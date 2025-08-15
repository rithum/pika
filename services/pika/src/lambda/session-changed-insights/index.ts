import { ChatSession, INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Context, DynamoDBStreamEvent } from 'aws-lambda';
import { setSessionsInsightsAnalysisInBatch } from '../../lib/chat-admin-ddb';
import { SnakeCase } from 'pika-shared/util/chatbot-shared-utils';
import { convertChatSessionToCamelFromSnakeCase } from 'src/lib/utils';

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

    // Rule 2: Session has both but they're different → clear lastAnalyzedMessageId and set insightStatus to NEEDS_INSIGHTS_ANALYSIS
    if (hasLastMessageId && hasLastAnalyzedMessageId && session.lastMessageId !== session.lastAnalyzedMessageId) {
        console.log('Rule 2 applied: Session has both lastMessageId and lastAnalyzedMessageId but they differ');
        return {
            userId: session.userId,
            sessionId: session.sessionId,
            lastAnalyzedMessageId: null, // Set it to null so it will be removed from the session in dynamodb
            insightStatus: INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS,
            insightsS3Url: undefined // Leave it alone so the daemon lambda can see that there was an old s3 file and remove it once it recomputes insights
        };
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
