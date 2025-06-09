import * as duckdb from 'duckdb'; // Provided by layer
import { DynamoDBClient, ScanCommand, BatchWriteItemCommand, ScanCommandOutput } from '@aws-sdk/client-dynamodb';
import { S3Client, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';
import { ScheduledEvent, Context, ScheduledHandler } from 'aws-lambda';

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

interface ArchiveConfig {
    targetFileSizeMB: number;
    maxRecordsPerBatch: number;
    maxLambdaRuntimeMinutes: number;
}

const config: ArchiveConfig = {
    targetFileSizeMB: 200, // Target 200MB files
    maxRecordsPerBatch: 100000, // Adjust based on record size
    maxLambdaRuntimeMinutes: 13 // Leave 2 minutes buffer for 15min Lambda limit
};

interface HourlyGroup {
    partition_hour: string;
    source_table: string;
    record_type: string;
    record_count: number;
}

// Helper functions to promisify DuckDB methods
function dbRunAsync(db: duckdb.Database, sql: string, ...params: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const callback = (err: any) => {
            if (err) reject(err);
            else resolve();
        };

        if (params.length > 0) {
            db.run(sql, ...params, callback);
        } else {
            db.run(sql, callback);
        }
    });
}

function dbAllAsync(db: duckdb.Database, sql: string, ...params: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const callback = (err: any, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows);
        };

        if (params.length > 0) {
            db.all(sql, ...params, callback);
        } else {
            db.all(sql, callback);
        }
    });
}

export const handler: ScheduledHandler = async (event: ScheduledEvent, context: Context) => {
    const startTime = Date.now();
    const cutoffTime = startTime + config.maxLambdaRuntimeMinutes * 60 * 1000;

    const stagingTableName = process.env.ARCHIVE_STAGING_TABLE_NAME;
    const archiveBucketName = process.env.ARCHIVE_BUCKET_NAME;

    if (!stagingTableName || !archiveBucketName) {
        throw new Error('Missing required environment variables');
    }

    // Initialize DuckDB - httpfs and parquet are pre-loaded by the layer!
    const db = new duckdb.Database(':memory:');

    try {
        // Configure S3 access (IAM role credentials are automatically used)
        await dbRunAsync(db, `SET s3_region='${process.env.AWS_REGION}';`);

        // Create table for archive records
        await dbRunAsync(
            db,
            `
            CREATE TABLE archive_batch (
                pk VARCHAR,
                sk VARCHAR,
                record_type VARCHAR,
                data JSON,
                archived_at TIMESTAMP,
                partition_hour VARCHAR,
                source_table VARCHAR,
                ttl_expired_at BIGINT
            );
        `
        );

        let processedCount = 0;
        let hasMoreData = true;
        let lastEvaluatedKey = undefined;
        const processedIds: string[][] = []; // For batch deletion

        // Scan staging table and load into DuckDB
        while (hasMoreData && Date.now() < cutoffTime && processedCount < config.maxRecordsPerBatch) {
            const scanResult: ScanCommandOutput = await ddbClient.send(
                new ScanCommand({
                    TableName: stagingTableName,
                    Limit: 1000,
                    ExclusiveStartKey: lastEvaluatedKey
                })
            );

            if (!scanResult.Items || scanResult.Items.length === 0) {
                hasMoreData = false;
                break;
            }

            // Convert and insert into DuckDB
            const records = scanResult.Items.map((item: any) => unmarshall(item));

            for (const record of records) {
                await dbRunAsync(
                    db,
                    `INSERT INTO archive_batch VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
                    record.pk,
                    record.sk,
                    record.record_type,
                    record.data, // Already JSON string
                    record.archived_at,
                    record.partition_hour,
                    record.source_table,
                    Number(record.ttl_expired_at) || 0
                );

                // Track for deletion
                processedIds.push([record.staging_id, record.record_id]);
            }

            processedCount += records.length;
            lastEvaluatedKey = scanResult.LastEvaluatedKey;
            hasMoreData = !!lastEvaluatedKey;
        }

        if (processedCount === 0) {
            console.log('No records to archive');
            return;
        }

        // Get hourly groups
        const hourlyGroups = (await dbAllAsync(
            db,
            `
            SELECT 
                partition_hour,
                source_table,
                record_type,
                COUNT(*) as record_count
            FROM archive_batch 
            GROUP BY partition_hour, source_table, record_type
            ORDER BY partition_hour, source_table, record_type;
        `
        )) as HourlyGroup[];

        // Write Parquet files for each group
        for (const group of hourlyGroups) {
            const partitionHour = group.partition_hour;
            const [datePart, hour] = partitionHour.split('T');
            const [year, month, day] = datePart.split('-');

            // Create S3 key with Hive-style partitioning
            const s3Key = `archived-dynamodb-data/table=${group.source_table}/type=${group.record_type}/year=${year}/month=${month}/day=${day}/hour=${hour}/records_${Date.now()}_${randomUUID()}.parquet`;

            // Write Parquet file directly to S3 using parameterized query
            await dbRunAsync(
                db,
                `COPY (
                    SELECT 
                        pk,
                        sk,
                        record_type,
                        json(data) as data,
                        archived_at,
                        source_table,
                        ttl_expired_at
                    FROM archive_batch 
                    WHERE partition_hour = ?
                    AND source_table = ?
                    AND record_type = ?
                    ORDER BY archived_at
                ) TO ? 
                (FORMAT 'parquet', COMPRESSION 'zstd', ROW_GROUP_SIZE 50000);`,
                partitionHour,
                group.source_table,
                group.record_type,
                `s3://${archiveBucketName}/${s3Key}`
            );

            console.log(`Archived ${group.record_count} ${group.record_type} records from ${group.source_table} to ${s3Key}`);
        }

        // Process S3 assets for messages before cleanup
        await processS3Assets(stagingTableName, archiveBucketName);

        // Clean up staged records in batches
        await cleanupStagedRecords(stagingTableName, processedIds);

        console.log(`Archive processor completed in ${Date.now() - startTime}ms, processed ${processedCount} records`);
    } catch (error) {
        console.error('Archive processing failed:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            eventId: event.id,
            region: event.region,
            time: event.time,
            functionName: context.functionName,
            requestId: context.awsRequestId,
            remainingTime: context.getRemainingTimeInMillis()
        });
        throw error;
    } finally {
        db.close();
    }
};

async function cleanupStagedRecords(tableName: string, recordIds: string[][]) {
    // Delete in batches of 25 (DynamoDB limit)
    const batches = [];
    for (let i = 0; i < recordIds.length; i += 25) {
        batches.push(recordIds.slice(i, i + 25));
    }

    for (const batch of batches) {
        const deleteRequests = batch.map(([staging_id, record_id]) => ({
            DeleteRequest: {
                Key: {
                    staging_id: { S: staging_id },
                    record_id: { S: record_id }
                }
            }
        }));

        await ddbClient.send(
            new BatchWriteItemCommand({
                RequestItems: {
                    [tableName]: deleteRequests
                }
            })
        );
    }

    console.log(`Deleted ${recordIds.length} staged records`);
}

async function processS3Assets(stagingTableName: string, archiveBucketName: string) {
    // Scan for message records that have S3 assets
    let hasMoreData = true;
    let lastEvaluatedKey = undefined;

    while (hasMoreData) {
        const scanResult: ScanCommandOutput = await ddbClient.send(
            new ScanCommand({
                TableName: stagingTableName,
                FilterExpression: 'record_type = :rt',
                ExpressionAttributeValues: {
                    ':rt': { S: 'message' }
                },
                Limit: 100,
                ExclusiveStartKey: lastEvaluatedKey
            })
        );

        if (!scanResult.Items || scanResult.Items.length === 0) {
            hasMoreData = false;
            break;
        }

        // Process each message record
        for (const item of scanResult.Items) {
            const record = unmarshall(item);
            try {
                const messageData = JSON.parse(record.data);

                // Check if message has assets
                if (messageData.assets && Array.isArray(messageData.assets)) {
                    for (const asset of messageData.assets) {
                        if (asset.locationType === 's3' && asset.s3Bucket && asset.s3Key) {
                            try {
                                // Copy the object to the archive bucket
                                await s3Client.send(
                                    new CopyObjectCommand({
                                        CopySource: `${asset.s3Bucket}/${asset.s3Key}`,
                                        Bucket: archiveBucketName,
                                        Key: asset.s3Key
                                    })
                                );

                                console.log(`Copied S3 object ${asset.s3Key} to archive bucket`);

                                // Delete the original object
                                await s3Client.send(
                                    new DeleteObjectCommand({
                                        Bucket: asset.s3Bucket,
                                        Key: asset.s3Key
                                    })
                                );

                                console.log(`Deleted original S3 object ${asset.s3Key} from ${asset.s3Bucket}`);
                            } catch (error) {
                                console.error(`Error processing S3 asset ${asset.s3Key}: ${error}`);
                                // Continue processing other assets
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`Error processing message data: ${error}`);
                // Continue with other records
            }
        }

        lastEvaluatedKey = scanResult.LastEvaluatedKey;
        hasMoreData = !!lastEvaluatedKey;
    }
}
