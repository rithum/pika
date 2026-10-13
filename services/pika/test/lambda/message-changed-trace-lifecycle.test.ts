import { jest } from '@jest/globals';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import type { Trace } from '@aws-sdk/client-bedrock-agent-runtime';

process.env.AWS_REGION = 'us-east-1';
process.env.PIKA_S3_BUCKET = 'pika-test-bucket';
process.env.STAGING_TABLE_NAME = 'staging-test';

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({ send: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) })),
    PutItemCommand: jest.fn().mockImplementation((input: unknown) => ({ input }))
}));

const deleteS3ObjectMock = jest.fn<(bucket: string, key: string) => Promise<void>>().mockResolvedValue(undefined);
jest.mock('../../src/lib/s3', () => ({
    getS3ObjectTagging: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    updateS3ObjectTagging: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    deleteS3Object: (bucket: string, key: string) => deleteS3ObjectMock(bucket, key)
}));

const mockGetTracesForMessage = jest.fn<(arg: any) => Promise<Trace[]>>().mockResolvedValue([]);
jest.mock('../../src/lib/trace-store', () => ({
    getTracesForMessage: (arg: unknown) => mockGetTracesForMessage(arg)
}));

const indexMock = jest.fn<(arg: any) => Promise<unknown>>().mockResolvedValue({});
jest.mock('../../src/lib/opensearch/opensearch-client', () => ({
    __esModule: true,
    default: {
        getClient: jest.fn<() => Promise<unknown>>().mockResolvedValue({
            index: (arg: unknown) => indexMock(arg),
            update: jest.fn<() => Promise<unknown>>().mockResolvedValue({})
        })
    }
}));

import { handler } from '../../src/lambda/message-changed/index';

const POINTER_KEY = 'traces/u1/s1/m1.json.gz';

function assistantImage(overrides: Record<string, unknown> = {}) {
    return {
        message_id: 'm1',
        session_id: 's1',
        user_id: 'u1',
        source: 'assistant',
        timestamp: '2026-07-14T12:00:00.000Z',
        message: 'here is your answer',
        traces_s3: { s3_key: POINTER_KEY, trace_count: 1, compressed_size: 123 },
        ...overrides
    };
}

function removeEvent(image: Record<string, unknown>, ttl: boolean): DynamoDBStreamEvent {
    return {
        Records: [
            {
                eventID: 'r1',
                eventName: 'REMOVE',
                eventSourceARN: 'arn:aws:dynamodb:us-east-1:0000000000:table/chat-messages/stream/x',
                ...(ttl ? { userIdentity: { type: 'Service', principalId: 'dynamodb.amazonaws.com' } } : {}),
                dynamodb: { OldImage: marshall(image, { removeUndefinedValues: true }) as any }
            }
        ]
    } as unknown as DynamoDBStreamEvent;
}

function insertEvent(image: Record<string, unknown>): DynamoDBStreamEvent {
    return {
        Records: [{ eventID: 'i1', eventName: 'INSERT', dynamodb: { NewImage: marshall(image, { removeUndefinedValues: true }) as any } }]
    } as unknown as DynamoDBStreamEvent;
}

beforeEach(() => {
    deleteS3ObjectMock.mockReset();
    deleteS3ObjectMock.mockResolvedValue(undefined);
    indexMock.mockClear();
    mockGetTracesForMessage.mockReset();
});

describe('message-changed offloaded trace lifecycle', () => {
    it('indexes the message without trace fields when the offloaded traces hydrate to nothing', async () => {
        mockGetTracesForMessage.mockResolvedValue([]);

        await handler(insertEvent(assistantImage()), {} as any);

        expect(indexMock).toHaveBeenCalledTimes(1);
        const body = indexMock.mock.calls[0][0].body;
        expect(body.llm_instructions).toBeUndefined();
        expect(body.traces_str_gzipped).toBeUndefined();
    });

    it('deletes the trace object with the pointer key when the message expires by TTL', async () => {
        await handler(removeEvent(assistantImage(), true), {} as any);

        expect(deleteS3ObjectMock).toHaveBeenCalledWith('pika-test-bucket', POINTER_KEY);
    });

    it('deletes the trace object with the pointer key when the message is manually deleted', async () => {
        await handler(removeEvent(assistantImage(), false), {} as any);

        expect(deleteS3ObjectMock).toHaveBeenCalledWith('pika-test-bucket', POINTER_KEY);
    });

    it('deletes nothing for a removed message that has no trace pointer', async () => {
        await handler(removeEvent(assistantImage({ traces_s3: undefined }), false), {} as any);

        expect(deleteS3ObjectMock).not.toHaveBeenCalled();
    });

    it('does not throw when the trace object delete fails', async () => {
        deleteS3ObjectMock.mockRejectedValue(new Error('AccessDenied'));

        await expect(handler(removeEvent(assistantImage(), false), {} as any)).resolves.not.toThrow();
    });
});
