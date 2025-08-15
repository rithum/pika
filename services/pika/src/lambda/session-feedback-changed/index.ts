import { ChatSessionFeedback } from 'pika-shared/types/chatbot/chatbot-types';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Context, DynamoDBStreamEvent } from 'aws-lambda';
import { chatSessionFeedbackChanged } from '../../lib/opensearch/opensearch';
import { SnakeCase, convertToCamelCase } from 'pika-shared/util/chatbot-shared-utils';

/**
 * This lambda function handles changes to the chat session feedback table.
 * It replicates feedback changes to OpenSearch, updating the feedback arrays within session documents.
 *
 * @param event - The event object from the DynamoDB stream.
 * @param _context - The context object from the Lambda function.
 */
export async function handler(event: DynamoDBStreamEvent, _context: Context) {
    console.log(`Processing ${event.Records.length} feedback records from DynamoDB stream...`);

    // Track changes for OpenSearch replication
    const newObjects: ChatSessionFeedback[] = [];
    const updatedObjects: ChatSessionFeedback[] = [];
    const deletedObjects: ChatSessionFeedback[] = [];

    for (const record of event.Records) {
        console.log(`Event ID: ${record.eventID}`);
        console.log(`Event Name: ${record.eventName}`);
        console.log('DynamoDB Record: ', JSON.stringify(record.dynamodb, null, 2));

        try {
            switch (record.eventName) {
                case 'INSERT':
                    if (record.dynamodb?.NewImage) {
                        const newFeedback = convertToCamelCase<ChatSessionFeedback>(unmarshall(record.dynamodb.NewImage as any) as SnakeCase<ChatSessionFeedback>);
                        console.log(`New feedback created: ${newFeedback.feedbackId} for session ${newFeedback.sessionId}`);
                        newObjects.push(newFeedback);
                    }
                    break;

                case 'MODIFY':
                    if (record.dynamodb?.NewImage) {
                        const modifiedFeedback = convertToCamelCase<ChatSessionFeedback>(unmarshall(record.dynamodb.NewImage as any) as SnakeCase<ChatSessionFeedback>);
                        console.log(`Feedback modified: ${modifiedFeedback.feedbackId} for session ${modifiedFeedback.sessionId}`);
                        updatedObjects.push(modifiedFeedback);
                    }
                    break;

                case 'REMOVE':
                    if (record.dynamodb?.OldImage) {
                        const deletedFeedback = convertToCamelCase<ChatSessionFeedback>(unmarshall(record.dynamodb.OldImage as any) as SnakeCase<ChatSessionFeedback>);
                        console.log(`Feedback deleted: ${deletedFeedback.feedbackId} for session ${deletedFeedback.sessionId}`);
                        deletedObjects.push(deletedFeedback);
                    }
                    break;

                default:
                    console.log(`Unhandled event type: ${record.eventName}`);
            }
        } catch (error) {
            console.error(`Error processing feedback record ${record.eventID}:`, error);
            // Continue processing other records rather than failing the entire batch
        }
    }

    // Replicate feedback changes to OpenSearch
    if (newObjects.length > 0 || updatedObjects.length > 0 || deletedObjects.length > 0) {
        try {
            console.log(`Replicating feedback to OpenSearch: ${newObjects.length} new, ${updatedObjects.length} updated, ${deletedObjects.length} deleted`);

            await chatSessionFeedbackChanged({
                newObjects: newObjects.length > 0 ? newObjects : undefined,
                updatedObjects: updatedObjects.length > 0 ? updatedObjects : undefined,
                deletedObjects: deletedObjects.length > 0 ? deletedObjects : undefined
            });

            console.log('Successfully replicated feedback changes to OpenSearch');
        } catch (error) {
            console.error('Failed to replicate feedback changes to OpenSearch:', error);
            // Re-throw the error since this is the primary function of this lambda
            throw error;
        }
    } else {
        console.log('No feedback changes to replicate to OpenSearch');
    }
}
