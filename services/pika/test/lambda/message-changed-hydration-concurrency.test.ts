/**
 * message-changed hydrates traces with a bounded look-ahead: a later record's rejection never
 * goes unhandled while an earlier record's OpenSearch write is pending.
 */

import { jest } from '@jest/globals';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import type { Trace } from '@aws-sdk/client-bedrock-agent-runtime';

process.env.AWS_REGION = 'us-east-1';
process.env.PIKA_S3_BUCKET = 'pika-test-bucket';
process.env.STAGING_TABLE_NAME = 'staging-test';

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
    PutItemCommand: jest.fn().mockImplementation((input: unknown) => ({ input }))
}));

// message-changed touches lib/s3 only in the files/REMOVE branches (not exercised here)
jest.mock('../../src/lib/s3', () => ({
    getS3ObjectTagging: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    updateS3ObjectTagging: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    deleteS3Object: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
}));

const mockGetTracesForMessage = jest.fn<(arg: any) => Promise<Trace[]>>().mockResolvedValue([]);
jest.mock('../../src/lib/trace-store', () => ({
    getTracesForMessage: (arg: unknown) => mockGetTracesForMessage(arg)
}));

const indexMock = jest.fn<(arg: any) => Promise<unknown>>().mockResolvedValue({});
const updateMock = jest.fn<(arg: any) => Promise<unknown>>().mockResolvedValue({});
jest.mock('../../src/lib/opensearch/opensearch-client', () => ({
    __esModule: true,
    default: {
        getClient: jest.fn<() => Promise<unknown>>().mockResolvedValue({
            index: (arg: unknown) => indexMock(arg),
            update: (arg: unknown) => updateMock(arg)
        })
    }
}));

import { handler } from '../../src/lambda/message-changed/index';

function insertBatch(images: Record<string, unknown>[]): DynamoDBStreamEvent {
    return {
        Records: images.map((image, i) => ({
            eventID: `e${i}`,
            eventName: 'INSERT',
            dynamodb: { NewImage: marshall(image, { removeUndefinedValues: true }) as any }
        }))
    } as unknown as DynamoDBStreamEvent;
}

function assistantImage(overrides: Record<string, unknown> = {}) {
    return {
        message_id: 'm1',
        session_id: 's1',
        user_id: 'u1',
        source: 'assistant',
        timestamp: '2026-07-14T12:00:00.000Z',
        message: 'here is your answer',
        traces_s3: { s3_key: 'traces/u1/s1/m1.json.gz', trace_count: 1, compressed_size: 123 },
        ...overrides
    };
}

function image(n: number, overrides: Record<string, unknown> = {}) {
    return assistantImage({ message_id: `m${n}`, session_id: `s${n}`, ...overrides });
}

function indexedIds(): string[] {
    return indexMock.mock.calls.map((c) => c[0].id);
}

beforeEach(() => {
    indexMock.mockReset();
    indexMock.mockResolvedValue({});
    updateMock.mockReset();
    updateMock.mockResolvedValue({});
    mockGetTracesForMessage.mockReset();
    mockGetTracesForMessage.mockResolvedValue([]);
});

describe('message-changed bounded trace hydration', () => {
    it('catches a later record rejection while an earlier replicate is pending', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        let releaseFirst!: () => void;
        const firstWrite = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        indexMock.mockImplementationOnce(() => firstWrite.then(() => ({})));
        mockGetTracesForMessage.mockImplementation(async (arg: any) => {
            if (arg.sessionId === 's2') {
                throw new Error('S3 throttled');
            }
            return [];
        });

        const done = handler(insertBatch([image(1), image(2)]), {} as any);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(indexMock).toHaveBeenCalledTimes(1);
        expect(mockGetTracesForMessage.mock.calls.map((c) => c[0].sessionId)).toContain('s2');
        releaseFirst();
        await expect(done).resolves.toBeUndefined();

        expect(indexedIds()).toEqual(['m1', 'm2']);
        const hydrateWarnings = warn.mock.calls.filter((c) => String(c[0]).startsWith('Failed to hydrate traces'));
        expect(hydrateWarnings).toHaveLength(1);
        expect(hydrateWarnings[0][0]).toContain('m2');
        warn.mockRestore();
    });

    it('never has more than 8 hydrations in flight and replicates all 12 in order', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        mockGetTracesForMessage.mockImplementation(async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 5));
            inFlight--;
            return [];
        });

        await handler(insertBatch(Array.from({ length: 12 }, (_, k) => image(k + 1))), {} as any);

        expect(mockGetTracesForMessage).toHaveBeenCalledTimes(12);
        expect(maxInFlight).toBeLessThanOrEqual(8);
        expect(maxInFlight).toBeGreaterThan(1);
        expect(indexedIds()).toEqual(Array.from({ length: 12 }, (_, k) => `m${k + 1}`));
    });

    it('does not hydrate user messages or skipped invocation modes, and still replicates them', async () => {
        await handler(
            insertBatch([
                image(1, { source: 'user', message: 'hi' }),
                image(2, { invocation_mode: 'direct-agent-invoke' }),
                image(3, { invocation_mode: 'chat-app-component' }),
                image(4)
            ]),
            {} as any
        );

        expect(mockGetTracesForMessage).toHaveBeenCalledTimes(1);
        expect(mockGetTracesForMessage.mock.calls[0][0].sessionId).toBe('s4');
        expect(indexedIds()).toEqual(['m1', 'm4']);
    });
});
