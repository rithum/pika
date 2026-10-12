/**
 * message-changed INSERT rehydrates the traces the camelCase converter drops, so
 * OpenSearch gets llm_instructions and traces_str_gzipped, without a stream-poisoning failure mode.
 */

import { jest } from '@jest/globals';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { gzipAndBase64EncodeString } from 'pika-shared/util/server-utils';
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

function insertEvent(image: Record<string, unknown>): DynamoDBStreamEvent {
    return {
        Records: [
            {
                eventID: 'e1',
                eventName: 'INSERT',
                dynamodb: { NewImage: marshall(image, { removeUndefinedValues: true }) as any }
            }
        ]
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

/** A trace carrying an llm-instruction, in the wire format extractLLMInstructions expects. */
function llmInstructionTrace(prompt: string): Trace {
    return {
        orchestrationTrace: {
            rationale: {
                text: JSON.stringify({ type: 'llm-instruction', compressedData: gzipAndBase64EncodeString(prompt) })
            }
        }
    } as Trace;
}

beforeEach(() => {
    indexMock.mockClear();
    updateMock.mockClear();
    mockGetTracesForMessage.mockReset();
    mockGetTracesForMessage.mockResolvedValue([]);
});

describe('message-changed INSERT trace rehydration', () => {
    it('T1: indexes llm_instructions + traces_str_gzipped for an assistant message with traces', async () => {
        mockGetTracesForMessage.mockResolvedValue([llmInstructionTrace('THE SYSTEM PROMPT')]);

        await handler(insertEvent(assistantImage()), {} as any);

        expect(indexMock).toHaveBeenCalledTimes(1);
        const body = indexMock.mock.calls[0][0].body;
        expect(body.llm_instructions).toBe('THE SYSTEM PROMPT');
        expect(typeof body.traces_str_gzipped).toBe('string');
        expect(body.traces_str_gzipped.length).toBeGreaterThan(0);
    });

    it('T2: hydrates with the pointer mapped snake->camel (traces_s3.s3_key -> tracesS3.s3Key)', async () => {
        mockGetTracesForMessage.mockResolvedValue([]);

        await handler(insertEvent(assistantImage()), {} as any);

        expect(mockGetTracesForMessage).toHaveBeenCalledTimes(1);
        const arg = mockGetTracesForMessage.mock.calls[0][0];
        expect(arg.tracesS3).toEqual({ s3Key: 'traces/u1/s1/m1.json.gz', traceCount: 1, compressedSize: 123 });
        expect(arg.userId).toBe('u1');
        expect(arg.sessionId).toBe('s1');
    });

    it('T3: a hydration failure degrades to indexing without traces and does NOT throw (no stream poison)', async () => {
        mockGetTracesForMessage.mockRejectedValue(new Error('S3 throttled'));

        await expect(handler(insertEvent(assistantImage()), {} as any)).resolves.not.toThrow();

        // Message still indexed, just without trace-derived fields
        expect(indexMock).toHaveBeenCalledTimes(1);
        const body = indexMock.mock.calls[0][0].body;
        expect(body.llm_instructions).toBeUndefined();
        expect(body.traces_str_gzipped).toBeUndefined();
    });

    it('T4: user messages never trigger trace hydration', async () => {
        await handler(insertEvent(assistantImage({ source: 'user', message: 'hi' })), {} as any);

        expect(mockGetTracesForMessage).not.toHaveBeenCalled();
        expect(indexMock).toHaveBeenCalledTimes(1);
    });

    it('T5: legacy inline traces (no traces_s3) hydrate and index', async () => {
        mockGetTracesForMessage.mockResolvedValue([llmInstructionTrace('LEGACY PROMPT')]);

        // Legacy shape: inline `traces` array, no traces_s3 pointer.
        const inlineTraces = [llmInstructionTrace('LEGACY PROMPT')];
        await handler(insertEvent(assistantImage({ traces_s3: undefined, traces: inlineTraces })), {} as any);

        expect(mockGetTracesForMessage).toHaveBeenCalledTimes(1);
        const arg = mockGetTracesForMessage.mock.calls[0][0];
        expect(arg.traces).toHaveLength(1);
        expect(arg.tracesS3).toBeUndefined();

        expect(indexMock).toHaveBeenCalledTimes(1);
        const body = indexMock.mock.calls[0][0].body;
        expect(body.llm_instructions).toBe('LEGACY PROMPT');
        expect(typeof body.traces_str_gzipped).toBe('string');
    });

    it('MODIFY of an assistant message with traces_s3 does not hydrate or touch OpenSearch', async () => {
        const event = {
            Records: [
                {
                    eventID: 'e2',
                    eventName: 'MODIFY',
                    dynamodb: { NewImage: marshall(assistantImage(), { removeUndefinedValues: true }) as any }
                }
            ]
        } as unknown as DynamoDBStreamEvent;

        await handler(event, {} as any);

        expect(mockGetTracesForMessage).not.toHaveBeenCalled();
        expect(indexMock).not.toHaveBeenCalled();
        expect(updateMock).not.toHaveBeenCalled();
    });

    it('T6: skipped invocationMode neither hydrates nor indexes (no wasted S3)', async () => {
        for (const invocation_mode of ['direct-agent-invoke', 'chat-app-component']) {
            mockGetTracesForMessage.mockClear();
            indexMock.mockClear();

            await handler(insertEvent(assistantImage({ invocation_mode })), {} as any);

            expect(mockGetTracesForMessage).not.toHaveBeenCalled();
            expect(indexMock).not.toHaveBeenCalled();
        }
    });
});
