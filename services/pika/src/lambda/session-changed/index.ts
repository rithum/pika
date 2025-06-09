import { ChatSession } from '@pika/shared/types/chatbot/chatbot-types';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { Context, DynamoDBStreamEvent } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { isTTLDeletion } from '../../lib/utils';

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

/**
 * This lambda function is used to handle the changes to the chat session table.
 * It stages TTL-deleted sessions for batch archival.
 *
 * @param event - The event object from the DynamoDB stream.
 * @param _context - The context object from the Lambda function.
 */
export async function handler(event: DynamoDBStreamEvent, _context: Context) {
    console.log(`Processing ${event.Records.length} session records from DynamoDB stream...`);

    const stagingTableName = process.env.STAGING_TABLE_NAME;
    if (!stagingTableName) {
        throw new Error('STAGING_TABLE_NAME is not set');
    }

    for (const record of event.Records) {
        console.log(`Event ID: ${record.eventID}`);
        console.log(`Event Name: ${record.eventName}`);
        console.log('DynamoDB Record: ', JSON.stringify(record.dynamodb, null, 2));

        // We only care about REMOVE events for sessions
        if (record.eventName === 'REMOVE' && record.dynamodb?.OldImage) {
            const deletedSession = unmarshall(record.dynamodb.OldImage as any) as ChatSession;
            
            if (isTTLDeletion(record)) {
                console.log(`Session ${deletedSession.sessionId} was deleted due to TTL expiration`);
                
                // Stage the TTL-deleted record for batch archival
                await stageTTLDeletion(
                    deletedSession,
                    'session',
                    record.eventSourceARN?.split('/')[1] || 'chat-sessions',
                    stagingTableName
                );
            } else {
                console.log(`Session ${deletedSession.sessionId} was manually deleted`);
                // For manual deletions, we don't archive - just log it
            }
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
async function stageTTLDeletion(
    record: any,
    recordType: 'message' | 'session',
    sourceTable: string,
    stagingTableName: string
): Promise<void> {
    const ttlExpiredAt = record.exp_date_unix_seconds || Math.floor(Date.now() / 1000);
    const now = new Date();
    
    // Create staging record
    const stagingItem = {
        // Partition key - using timestamp prefix for even distribution
        staging_id: { S: `${now.toISOString()}_${randomUUID()}` },
        // Sort key - preserve original keys
        record_id: { S: `${record.userId || record.user_id}#${record.sessionId || record.session_id}` },
        // Metadata
        pk: { S: record.userId || record.user_id || '' },
        sk: { S: record.sessionId || record.session_id || '' },
        record_type: { S: recordType },
        source_table: { S: sourceTable },
        archived_at: { S: now.toISOString() },
        partition_hour: { S: now.toISOString().substring(0, 13) }, // YYYY-MM-DDTHH
        ttl_expired_at: { N: String(ttlExpiredAt) },
        // Store the complete record as JSON
        data: { S: JSON.stringify(record) },
        // TTL for staging records (7 days)
        exp_date_unix_seconds: { N: String(Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)) }
    };
    
    try {
        await ddbClient.send(new PutItemCommand({
            TableName: stagingTableName,
            Item: stagingItem
        }));
        
        console.log(`Staged ${recordType} record: ${stagingItem.record_id.S}`);
    } catch (error) {
        console.error(`Failed to stage ${recordType} record: ${error}`);
        throw error;
    }
}
