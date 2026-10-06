/**
 * Tests for determineInsightAnalysisUpdate — in particular the data-corruption self-heal branch
 * (T3), whose DynamoDB write was previously a floating promise (not awaited, so the try/catch
 * couldn't guard it and the write raced the Lambda freeze).
 */
import { jest, beforeEach, describe, it, expect } from '@jest/globals';
import { INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS } from 'pika-shared/types/chatbot/chatbot-types';
import type { ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

const mockSend = jest.fn<() => Promise<unknown>>();

jest.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: jest.fn().mockImplementation(() => ({})) }));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockSend })) },
    UpdateCommand: jest.fn().mockImplementation((input: unknown) => ({ input }))
}));
jest.mock('../../src/lib/chat-admin-ddb', () => ({ setSessionsInsightsAnalysisInBatch: jest.fn() }));

import { determineInsightAnalysisUpdate } from '../../src/lambda/session-changed-insights/index';

function makeSession(over: Record<string, unknown> = {}): ChatSession<RecordOrUndef> {
    return { userId: 'u1', sessionId: 's1', ...over } as unknown as ChatSession<RecordOrUndef>;
}

beforeEach(() => {
    mockSend.mockReset();
    process.env.CHAT_SESSION_TABLE = 'chat-session-table';
});

describe('determineInsightAnalysisUpdate', () => {
    it('Rule 1: lastMessageId but no lastAnalyzedMessageId → flags NEEDS_INSIGHTS_ANALYSIS', async () => {
        const r = await determineInsightAnalysisUpdate(makeSession({ lastMessageId: 's1:00003' }));
        expect(r?.insightStatus).toBe(INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS);
        expect(r?.lastAnalyzedMessageId).toBeUndefined();
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('Rule 2 legitimate (lastMsg > lastAnalyzed): re-flags and clears lastAnalyzed', async () => {
        const r = await determineInsightAnalysisUpdate(makeSession({ lastMessageId: 's1:00005', lastAnalyzedMessageId: 's1:00003' }));
        expect(r?.insightStatus).toBe(INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS);
        expect(r?.lastAnalyzedMessageId).toBeNull();
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('Rule 2 corruption (lastMsg < lastAnalyzed): awaits the self-heal write, returns undefined', async () => {
        mockSend.mockResolvedValueOnce({});
        const r = await determineInsightAnalysisUpdate(makeSession({ lastMessageId: 's1:00002', lastAnalyzedMessageId: 's1:00009' }));
        expect(r).toBeUndefined();
        expect(mockSend).toHaveBeenCalledTimes(1); // the auto-fix UpdateCommand was issued (and awaited)
    });

    it('Rule 2 corruption: a failed self-heal write is swallowed (still returns undefined, no re-trigger)', async () => {
        mockSend.mockRejectedValueOnce(new Error('ddb down'));
        const r = await determineInsightAnalysisUpdate(makeSession({ lastMessageId: 's1:00002', lastAnalyzedMessageId: 's1:00009' }));
        expect(r).toBeUndefined();
    });

    it('Rule 3: identical ids → no update', async () => {
        const r = await determineInsightAnalysisUpdate(makeSession({ lastMessageId: 's1:00003', lastAnalyzedMessageId: 's1:00003' }));
        expect(r).toBeUndefined();
    });

    it('missing userId/sessionId → undefined', async () => {
        const r = await determineInsightAnalysisUpdate(makeSession({ userId: '', lastMessageId: 's1:00003' }));
        expect(r).toBeUndefined();
    });
});
