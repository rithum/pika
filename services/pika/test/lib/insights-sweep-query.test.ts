import { jest } from '@jest/globals';

const mockQuery = jest.fn<(input: Record<string, unknown>) => Promise<{ Items: unknown[] }>>();
const mockSend = jest.fn<(command: { input: Record<string, unknown> }) => Promise<{ Items: unknown[] }>>();

jest.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: jest.fn().mockImplementation(() => ({})) }));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocument: { from: jest.fn().mockImplementation(() => ({ query: mockQuery, send: mockSend })) },
    BatchGetCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
    QueryCommand: jest.fn().mockImplementation((input: unknown) => ({ input }))
}));

import { buildInsightsSweepQueryInput } from '../../src/lib/insights-sweep-query';
import { getSessionsThatNeedInsightsAnalysis, getSessionsThatNeedInsightsAnalysisIterator } from '../../src/lib/chat-admin-ddb';
import { INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS } from 'pika-shared/types/chatbot/chatbot-types';

const SETTLE = '2026-06-19T03:00:00.000Z';
const FLOOR = '2026-06-18T00:00:00.000Z';

describe('buildInsightsSweepQueryInput', () => {
    it('keys on insight_status only — no last_message_id sort-key cutoff (the original bug)', () => {
        const q = buildInsightsSweepQueryInput('chat-session', SETTLE);
        expect(q.KeyConditionExpression).toBe('insight_status = :insightStatus');
        expect(q.KeyConditionExpression).not.toContain('last_message_id');
        expect(q.IndexName).toBe('insight-status-index');
        expect(q.ExpressionAttributeValues[':insightStatus']).toBe(INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS);
        // never compare the sessionId:num sort key against a date string anywhere in the query
        expect(JSON.stringify(q)).not.toContain('last_message_id');
    });

    it('filters by the settle cutoff on last_update (real timestamp attr)', () => {
        const q = buildInsightsSweepQueryInput('t', SETTLE);
        expect(q.FilterExpression).toBe('last_update <= :settleCutoff');
        expect(q.ExpressionAttributeValues[':settleCutoff']).toBe(SETTLE);
        expect(q.ExpressionAttributeValues[':startFloor']).toBeUndefined();
    });

    it('adds the start-date floor when provided (only post-launch sessions)', () => {
        const q = buildInsightsSweepQueryInput('t', SETTLE, FLOOR);
        expect(q.FilterExpression).toBe('last_update <= :settleCutoff AND last_update >= :startFloor');
        expect(q.ExpressionAttributeValues[':startFloor']).toBe(FLOOR);
        expect(q.ExpressionAttributeValues[':settleCutoff']).toBe(SETTLE);
    });

    it('omits the floor when startFloor is empty/undefined', () => {
        expect(buildInsightsSweepQueryInput('t', SETTLE, undefined).FilterExpression).toBe('last_update <= :settleCutoff');
        expect(buildInsightsSweepQueryInput('t', SETTLE, '').FilterExpression).toBe('last_update <= :settleCutoff');
    });
});

describe('sweep call sites use the sweep query', () => {
    const CUTOFF = new Date(SETTLE);

    beforeEach(() => {
        process.env.CHAT_SESSION_TABLE = 'chat-session-table';
        mockQuery.mockReset().mockResolvedValue({ Items: [] });
        mockSend.mockReset().mockResolvedValue({ Items: [] });
    });

    it('getSessionsThatNeedInsightsAnalysis queries the insight_status partition with the settle filter', async () => {
        await getSessionsThatNeedInsightsAnalysis(CUTOFF);
        const input = mockQuery.mock.calls[0][0];
        expect(input.KeyConditionExpression).toBe('insight_status = :insightStatus');
        expect(input.FilterExpression).toContain('last_update <= :settleCutoff');
    });

    it('getSessionsThatNeedInsightsAnalysisIterator queries the insight_status partition with the settle filter', async () => {
        const pages = getSessionsThatNeedInsightsAnalysisIterator(CUTOFF, 10, () => 60_000, 1_000);
        for await (const _page of pages) {
            // drain
        }
        const input = mockSend.mock.calls[0][0].input;
        expect(input.KeyConditionExpression).toBe('insight_status = :insightStatus');
        expect(input.FilterExpression).toContain('last_update <= :settleCutoff');
    });
});
