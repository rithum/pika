import { jest } from '@jest/globals';

const mockQuery = jest.fn<(input: Record<string, unknown>) => Promise<{ Items: unknown[] }>>();
const mockSend = jest.fn<(command: { input: Record<string, unknown> }) => Promise<{ Items: unknown[] }>>();

jest.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: jest.fn().mockImplementation(() => ({})) }));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocument: { from: jest.fn().mockImplementation(() => ({ query: mockQuery, send: mockSend })) },
    BatchGetCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
    QueryCommand: jest.fn().mockImplementation((input: unknown) => ({ input }))
}));

import { getSessionsThatNeedInsightsAnalysis, getSessionsThatNeedInsightsAnalysisIterator } from '../../src/lib/chat-admin-ddb';

const CUTOFF = new Date('2026-06-19T03:00:00.000Z');
const FLOOR = '2026-06-18T00:00:00.000Z';

beforeEach(() => {
    process.env.CHAT_SESSION_TABLE = 'chat-session-table';
    mockQuery.mockReset().mockResolvedValue({ Items: [] });
    mockSend.mockReset().mockResolvedValue({ Items: [] });
});

describe('sweep start floor', () => {
    it('getSessionsThatNeedInsightsAnalysisIterator filters out sessions older than the floor', async () => {
        for await (const _page of getSessionsThatNeedInsightsAnalysisIterator(CUTOFF, 10, () => 60_000, 1_000, FLOOR)) {
            // drain
        }

        const input = mockSend.mock.calls[0][0].input as { FilterExpression: string; ExpressionAttributeValues: Record<string, unknown> };
        expect(input.FilterExpression).toBe('last_update <= :settleCutoff AND last_update >= :startFloor');
        expect(input.ExpressionAttributeValues[':startFloor']).toBe(FLOOR);
    });

    it('getSessionsThatNeedInsightsAnalysis filters out sessions older than the floor', async () => {
        await getSessionsThatNeedInsightsAnalysis(CUTOFF, FLOOR);

        const input = mockQuery.mock.calls[0][0] as { FilterExpression: string; ExpressionAttributeValues: Record<string, unknown> };
        expect(input.FilterExpression).toBe('last_update <= :settleCutoff AND last_update >= :startFloor');
        expect(input.ExpressionAttributeValues[':startFloor']).toBe(FLOOR);
    });
});
