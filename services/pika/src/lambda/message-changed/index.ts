import { ChatMessage } from '@pika/shared/types/chatbot/chatbot-types';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { Context, DynamoDBStreamEvent } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { deleteS3Object, getS3ObjectTagging, updateS3ObjectTagging } from '../../lib/s3';
import { isTTLDeletion } from '../../lib/utils';

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const CHAT_TAG = 'chat';
const CONFIRMED_TAG = 'confirmed';

/**
 * This lambda function is used to handle the changes to the chat message table.
 * It is used to ensure s3 objects that are actually used in a chat message are marked as confirmed
 * and that a message's s3 objects are deleted when the message is deleted.
 *
 * @param event - The event object from the DynamoDB stream.
 * @param _context - The context object from the Lambda function.
 */
export async function handler(event: DynamoDBStreamEvent, _context: Context) {
    console.log(`Processing ${event.Records.length} records from DynamoDB stream...`);

    const uploadS3Bucket = process.env.UPLOAD_S3_BUCKET;
    const stagingTableName = process.env.STAGING_TABLE_NAME;

    if (!uploadS3Bucket) {
        throw new Error('UPLOAD_S3_BUCKET is not set');
    }
    if (!stagingTableName) {
        throw new Error('STAGING_TABLE_NAME is not set');
    }

    for (const record of event.Records) {
        console.log(`Event ID: ${record.eventID}`);
        console.log(`Event Name: ${record.eventName}`); // INSERT, MODIFY, REMOVE
        console.log('DynamoDB Record: ', JSON.stringify(record.dynamodb, null, 2));

        // Determine the type of operation
        switch (record.eventName) {
            case 'INSERT':
                if (record.dynamodb?.NewImage) {
                    // Unmarshall the DynamoDB NewImage to a regular JavaScript object
                    const newItem = unmarshall(record.dynamodb.NewImage as any) as ChatMessage;
                    for (const file of newItem.files ?? []) {
                        if (file.locationType === 's3') {
                            if (file.s3Bucket !== uploadS3Bucket) {
                                console.warn(`Skipping S3 object ${file.s3Key} in bucket ${file.s3Bucket} because it is not the upload bucket`);
                                continue;
                            }
                            try {
                                // Make sure that any chat s3 object is marked as confirmed if it isn't already
                                const tags = await getS3ObjectTagging(file.s3Bucket, file.s3Key);
                                const chatTag = tags?.find((t) => t.Key === CHAT_TAG);
                                if (tags && chatTag && chatTag.Value === 'true') {
                                    let confirmedTag = tags?.find((t) => t.Key === CONFIRMED_TAG);
                                    if (!confirmedTag) {
                                        confirmedTag = { Key: CONFIRMED_TAG, Value: 'false' };
                                        tags.push(confirmedTag);
                                    }
                                    if (confirmedTag.Value === 'false') {
                                        confirmedTag.Value = 'true';
                                        await updateS3ObjectTagging(file.s3Bucket, file.s3Key, tags ?? []);
                                    }
                                }
                            } catch (error) {
                                console.error(`Error updating S3 object ${file.s3Key}: ${error}`);
                            }
                        }
                    }
                }
                break;
            case 'MODIFY':
                // We don't do anything right now on modify.
                break;
            case 'REMOVE':
                if (record.dynamodb?.OldImage) {
                    const deletedItem = unmarshall(record.dynamodb.OldImage as any) as ChatMessage;

                    // Check if this deletion was caused by TTL expiration
                    const isTTL = isTTLDeletion(record);
                    if (isTTL) {
                        console.log(`Message ${deletedItem.messageId} was deleted due to TTL expiration`);

                        // Stage the TTL-deleted record for batch archival
                        await stageTTLDeletion(deletedItem, 'message', record.eventSourceARN?.split('/')[1] || 'chat-messages', stagingTableName);

                        // Note: We're NOT deleting S3 files here - they'll be handled by the archive processor
                        // This prevents race conditions and ensures all data is archived together
                    } else {
                        console.log(`Message ${deletedItem.messageId} was manually deleted`);
                        // Delete assets from S3 referenced by the message
                        for (const asset of deletedItem.files ?? []) {
                            if (asset.locationType === 's3') {
                                if (asset.s3Bucket !== uploadS3Bucket) {
                                    console.warn(`Skipping S3 object ${asset.s3Key} in bucket ${asset.s3Bucket} because it is not the upload bucket`);
                                    continue;
                                }
                                try {
                                    await deleteS3Object(asset.s3Bucket, asset.s3Key);
                                    console.log(`Deleted S3 object ${asset.s3Key} (TTL deletion: ${isTTL})`);
                                } catch (error) {
                                    console.error(`Error deleting S3 object ${asset.s3Key}: ${error}`);
                                }
                            }
                        }
                    }
                }
                break;
            default:
                console.warn(`Unhandled event type: ${record.eventName}`);
                break;
        }
    }
}

/**
 * Stages a TTL-deleted record for batch archival
 * @param record The deleted record
 * @param recordType Type of record (message or session)
 * @param sourceTable Source DynamoDB table name
 * @param stagingTableName Name of the staging table
 */
async function stageTTLDeletion(record: any, recordType: 'message' | 'session', sourceTable: string, stagingTableName: string): Promise<void> {
    const ttlExpiredAt = record.exp_date_unix_seconds || Math.floor(Date.now() / 1000);
    const now = new Date();

    // Create staging record
    const stagingItem = {
        // Partition key - using timestamp prefix for even distribution
        staging_id: { S: `${now.toISOString()}_${randomUUID()}` },
        // Sort key - preserve original keys
        record_id: { S: `${record.userId || record.user_id}#${record.messageId || record.message_id || record.sessionId || record.session_id}` },
        // Metadata
        pk: { S: record.userId || record.user_id || '' },
        sk: { S: record.messageId || record.message_id || record.sessionId || record.session_id || '' },
        record_type: { S: recordType },
        source_table: { S: sourceTable },
        archived_at: { S: now.toISOString() },
        partition_hour: { S: now.toISOString().substring(0, 13) }, // YYYY-MM-DDTHH
        ttl_expired_at: { N: String(ttlExpiredAt) },
        // Store the complete record as JSON
        data: { S: JSON.stringify(record) },
        // TTL for staging records (7 days)
        exp_date_unix_seconds: { N: String(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60) }
    };

    try {
        await ddbClient.send(
            new PutItemCommand({
                TableName: stagingTableName,
                Item: stagingItem
            })
        );

        console.log(`Staged ${recordType} record: ${stagingItem.record_id.S}`);
    } catch (error) {
        console.error(`Failed to stage ${recordType} record: ${error}`);
        throw error;
    }
}
