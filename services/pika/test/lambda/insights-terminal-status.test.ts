import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ChatSession, ChatSessionLiteForUpdate, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

const mockGetMessages = jest.fn<() => Promise<unknown[]>>();

jest.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: jest.fn().mockImplementation(() => ({})) }));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocument: { from: jest.fn().mockImplementation(() => ({ send: jest.fn() })) },
    DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: jest.fn() })) },
    BatchGetCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
    QueryCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
    UpdateCommand: jest.fn().mockImplementation((input: unknown) => ({ input }))
}));
jest.mock('src/lib/chat-ddb', () => ({ getChatMessagesInSession: mockGetMessages }));
jest.mock('../../src/lib/opensearch/opensearch-client', () => ({
    __esModule: true,
    default: { getClient: jest.fn().mockImplementation(() => Promise.reject(new Error('no opensearch in test'))) }
}));

import { isUnrecoverableAnalysisError } from '../../src/lambda/session-insights-runner/analysis-error';
import { analyzeSession } from '../../src/lambda/session-insights-runner/insights-analyzer';
import { determineInsightAnalysisUpdate } from '../../src/lambda/session-changed-insights/index';
import { buildUpdateRequest } from '../../src/lib/chat-admin-ddb';

describe('isUnrecoverableAnalysisError', () => {
    it('is true for an input-too-long message', () => {
        expect(isUnrecoverableAnalysisError(new Error('Input is too long for requested model'))).toBe(true);
    });

    it('is true for a prompt-too-long message', () => {
        expect(isUnrecoverableAnalysisError(new Error('prompt is too long: 250000 tokens > 200000 maximum'))).toBe(true);
    });

    it('is true for an exceed-context-limit message', () => {
        expect(
            isUnrecoverableAnalysisError(
                new Error('input length and `max_tokens` exceed context limit: 195000 + 10000 > 200000, decrease input length or `max_tokens` and try again')
            )
        ).toBe(true);
    });

    it('is false for a ValidationException that is not about input size', () => {
        const e = new Error('The provided model identifier is invalid.');
        e.name = 'ValidationException';
        expect(isUnrecoverableAnalysisError(e)).toBe(false);
    });

    it('is false for a generic error', () => {
        expect(isUnrecoverableAnalysisError(new Error('throttled'))).toBe(false);
    });

    it('is false for a throttling error', () => {
        const e = new Error('slow down');
        e.name = 'ThrottlingException';
        expect(isUnrecoverableAnalysisError(e)).toBe(false);
    });

    it('is false for a non-Error value', () => {
        expect(isUnrecoverableAnalysisError('boom')).toBe(false);
    });
});

describe('buildUpdateRequest', () => {
    beforeEach(() => {
        process.env.CHAT_SESSION_TABLE = 'chat-session-table';
    });

    it('sets INSIGHTS_FAILED as the insight status', () => {
        const req = buildUpdateRequest({
            userId: 'u',
            sessionId: 's',
            lastAnalyzedMessageId: undefined,
            insightStatus: 'INSIGHTS_FAILED',
            insightsS3Url: undefined
        });
        expect(req?.updateParams.UpdateExpression).toContain('#insightStatus = :insightStatus');
        expect(req?.updateParams.ExpressionAttributeValues[':insightStatus']).toBe('INSIGHTS_FAILED');
    });
});

describe('terminal analysis failure', () => {
    function makeSession(over: Record<string, unknown> = {}): ChatSession<RecordOrUndef> {
        return { userId: 'u1', sessionId: 's1', chatAppId: 'app', agentId: 'a1', lastMessageId: 's1:00005', ...over } as unknown as ChatSession<RecordOrUndef>;
    }

    async function failedUpdate() {
        mockGetMessages.mockRejectedValue(new Error('Input is too long for requested model.'));
        const batch: ChatSessionLiteForUpdate[] = [];
        await analyzeSession(makeSession(), batch, []);
        expect(batch).toHaveLength(1);
        return batch[0];
    }

    beforeEach(() => {
        mockGetMessages.mockReset();
        process.env.CHAT_SESSION_TABLE = 'chat-session-table';
    });

    it('pushes INSIGHTS_FAILED stamped with the session lastMessageId', async () => {
        const update = await failedUpdate();
        expect(update.insightStatus).toBe('INSIGHTS_FAILED');
        expect(update.lastAnalyzedMessageId).toBe('s1:00005');
    });

    it('is left alone by the stream rules while no newer message exists', async () => {
        const update = await failedUpdate();
        const r = await determineInsightAnalysisUpdate(
            makeSession({ lastAnalyzedMessageId: update.lastAnalyzedMessageId, insightStatus: 'INSIGHTS_FAILED' })
        );
        expect(r).toBeUndefined();
    });

    it('is re-queued once a newer message arrives', async () => {
        const r = await determineInsightAnalysisUpdate(
            makeSession({ lastMessageId: 's1:00006', lastAnalyzedMessageId: 's1:00005', insightStatus: 'INSIGHTS_FAILED' })
        );
        expect(r?.insightStatus).toBe('NEEDS_INSIGHTS_ANALYSIS');
    });
});
