import { ChatSession, INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Context, DynamoDBStreamEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { setSessionsInsightsAnalysisInBatch } from '../../lib/chat-admin-ddb';
import { SnakeCase } from 'pika-shared/util/chatbot-shared-utils';
import { convertChatSessionToCamelFromSnakeCase } from 'src/lib/utils';

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * This lambda function is used to handle the changes to the chat session table.
 *
 * If the session has been removed, we don't do anything.
 *
 * If the session has been created or modified, we look at the new or modified session and follow these rules:
 *
 * If we have a session that doesn't have a lastAnalyzedMessageId but does have a lastMessageId, then we set
 * insightStatus to NEEDS_INSIGHTS_ANALYSIS.
 *
 * If we have a session with both lastAnalyzedMessageId and lastMessageId but lastMessageId is not the same as lastAnalyzedMessageId
 * then we remove lastAnalyzedMessageId and set insightStatus to NEEDS_INSIGHTS_ANALYSIS.
 *
 * If we have a session with both lastAnalyzedMessageId and lastMessageId but lastMessageId is the same as lastAnalyzedMessageId
 * then we don't do anything.
 *
 * @param event - The event object from the DynamoDB stream.
 * @param _context - The context object from the Lambda function.
 */
export async function handler(event: DynamoDBStreamEvent, _context: Context) {
    console.log(`Processing ${event.Records.length} session records from DynamoDB stream...`);

    const chatSessionTable = process.env.CHAT_SESSION_TABLE;
    if (!chatSessionTable) {
        throw new Error('CHAT_SESSION_TABLE is not set');
    }

    // Collect sessions that need insights analysis updates
    const sessionsToUpdate: {
        userId: string;
        sessionId: string;
        lastAnalyzedMessageId: string | undefined | null;
        insightStatus: typeof INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS | undefined | null;
        insightsS3Url: string | undefined | null;
    }[] = [];

    for (const record of event.Records) {
        console.log(`Event ID: ${record.eventID}`);
        console.log(`Event Name: ${record.eventName}`);
        console.log('DynamoDB Record: ', JSON.stringify(record.dynamodb, null, 2));

        let session: ChatSession<RecordOrUndef>;
        if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
            if (!record.dynamodb?.NewImage) {
                console.log('No NewImage found, skipping record');
                continue;
            }
            session = convertChatSessionToCamelFromSnakeCase<RecordOrUndef>(unmarshall(record.dynamodb.NewImage as any) as SnakeCase<ChatSession<RecordOrUndef>>);

            // If the session is a test session, skip it
            if (session.testType === 'mock') {
                console.log(`Skipping test session: ${session.sessionId}`);
                continue;
            }
        } else {
            console.log(`Skipping unsupported event type: ${record.eventName}`);
            continue;
        }

        // Determine if this session needs insights analysis
        const sessionUpdate = determineInsightAnalysisUpdate(session);

        if (sessionUpdate) {
            console.log(`Session ${session.sessionId} needs insights analysis update:`, sessionUpdate);
            sessionsToUpdate.push(sessionUpdate);
        } else {
            console.log(`Session ${session.sessionId} does not need insights analysis update`);
        }
    }

    // Batch update sessions that need insights analysis
    if (sessionsToUpdate.length > 0) {
        console.log(`Batching update for ${sessionsToUpdate.length} sessions that need insights analysis`);
        try {
            await setSessionsInsightsAnalysisInBatch(sessionsToUpdate);
            console.log('Successfully updated sessions for insights analysis');
        } catch (error) {
            console.error('Error updating sessions for insights analysis:', error);
            throw error;
        }
    } else {
        console.log('No sessions need insights analysis updates');
    }
}

/**
 * Helper function to update a session's lastMessageId when data corruption is detected.
 * This syncs the session record with the reality of what messages exist.
 *
 * Note: We do NOT update updated_on because this is a data correction, not actual user activity.
 * Updating updated_on could interfere with session timeout/expiration logic.
 */
async function updateSessionLastMessageId(userId: string, sessionId: string, newLastMessageId: string): Promise<void> {
    const chatSessionTable = process.env.CHAT_SESSION_TABLE;
    if (!chatSessionTable) {
        throw new Error('CHAT_SESSION_TABLE is not set');
    }

    await ddbDocClient.send(
        new UpdateCommand({
            TableName: chatSessionTable,
            Key: {
                user_id: userId,
                session_id: sessionId
            },
            UpdateExpression: 'SET last_message_id = :lastMessageId',
            ExpressionAttributeValues: {
                ':lastMessageId': newLastMessageId
            }
        })
    );
}

/**
 * Determines if a session needs insights analysis updates based on the design requirements.
 * Returns the update object if an update is needed, null otherwise.
 */
function determineInsightAnalysisUpdate(session: ChatSession<RecordOrUndef>):
    | {
          userId: string;
          sessionId: string;
          lastAnalyzedMessageId: string | undefined | null;
          insightStatus: typeof INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS | undefined | null;
          insightsS3Url: string | undefined | null;
      }
    | undefined {
    console.log(`determineInsightAnalysisUpdate: ${JSON.stringify(session, null, 2)}`);
    // Ensure we have the required fields
    if (!session.userId || !session.sessionId) {
        console.log('Session missing required userId or sessionId, skipping');
        return undefined;
    }

    const hasLastMessageId = !!session.lastMessageId;
    const hasLastAnalyzedMessageId = !!session.lastAnalyzedMessageId;

    // Rule 1: Session has lastMessageId but no lastAnalyzedMessageId → set insightStatus to NEEDS_INSIGHTS_ANALYSIS
    if (hasLastMessageId && !hasLastAnalyzedMessageId) {
        console.log('Rule 1 applied: Session has lastMessageId but no lastAnalyzedMessageId');
        return {
            userId: session.userId,
            sessionId: session.sessionId,
            lastAnalyzedMessageId: undefined, // Leave it alone since already not defined
            insightStatus: INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS,
            insightsS3Url: undefined // Leave it alone since we aren't supposed to have one yet anyway
        };
    }

    // Rule 2: Session has both but they're different → need to determine if this is legitimate or data corruption
    if (hasLastMessageId && hasLastAnalyzedMessageId && session.lastMessageId !== session.lastAnalyzedMessageId) {
        // Compare as strings (UUIDv7 is lexically sortable)
        const lastMsg = session.lastMessageId || '';
        const lastAnalyzed = session.lastAnalyzedMessageId || '';

        if (lastMsg > lastAnalyzed) {
            // LEGITIMATE: New messages exist that haven't been analyzed yet
            console.log(`Rule 2 applied: New messages detected (${lastMsg} > ${lastAnalyzed})`);
            return {
                userId: session.userId,
                sessionId: session.sessionId,
                lastAnalyzedMessageId: null, // Set it to null so it will be removed from the session in dynamodb
                insightStatus: INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS,
                insightsS3Url: undefined // Leave it alone so the daemon lambda can see that there was an old s3 file and remove it once it recomputes insights
            };
        } else if (lastMsg < lastAnalyzed) {
            // DATA CORRUPTION: Insights runner found messages the session doesn't know about
            // This indicates the session's lastMessageId was never updated properly
            // DO NOT re-trigger analysis - it will create an infinite loop
            console.error(`[DATA CORRUPTION] Session ${session.sessionId} has stale lastMessageId`);
            console.error(`  Current lastMessageId: ${lastMsg}`);
            console.error(`  lastAnalyzedMessageId: ${lastAnalyzed}`);
            console.error(`  Auto-fixing by syncing lastMessageId to match lastAnalyzedMessageId`);

            // AUTO-FIX: Update session's lastMessageId to match reality
            // This makes the session record reflect what messages actually exist
            try {
                updateSessionLastMessageId(session.userId, session.sessionId, lastAnalyzed);
                console.log(`[AUTO-FIX] Successfully updated session ${session.sessionId} lastMessageId to ${lastAnalyzed}`);

                // TODO: Send CloudWatch metric/alert for monitoring
                // await sendCloudWatchMetric('SessionDataCorruptionAutoFixed', 1);
            } catch (error) {
                console.error(`[AUTO-FIX FAILED] Could not update session ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
                // Even if fix fails, don't re-trigger analysis (prevents infinite loop)
            }

            // Return undefined to prevent re-triggering analysis
            return undefined;
        }
    }

    // Rule 3: Session has both and they're the same → do nothing
    if (hasLastMessageId && hasLastAnalyzedMessageId && session.lastMessageId === session.lastAnalyzedMessageId) {
        console.log('Rule 3 applied: Session has both lastMessageId and lastAnalyzedMessageId and they match - no action needed');
        return undefined;
    }

    // Additional case: Session has no lastMessageId → ensure it doesn't have insightStatus set
    if (!hasLastMessageId && session.insightStatus === INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS) {
        console.log('Additional rule: Session has no lastMessageId but has insightStatus set - clearing it');
        return {
            userId: session.userId,
            sessionId: session.sessionId,
            lastAnalyzedMessageId: undefined,
            insightStatus: null, // Remove the status entirely from the record and GSI
            insightsS3Url: undefined
        };
    }

    // No action needed
    return undefined;
}
