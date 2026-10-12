import { NoSuchKey, S3, S3ServiceException } from '@aws-sdk/client-s3';
import { jest } from '@jest/globals';
import { gzipSync } from 'zlib';
import { gunzipBase64EncodedString, gzipAndBase64EncodeString } from 'pika-shared/util/server-utils';

process.env.PIKA_S3_BUCKET = 'test-pika-bucket';

import { getTracesForMessage } from '../../src/lib/trace-store';

const sendSpy = jest.spyOn(S3.prototype, 'send');

function s3Response(payload: string | Buffer) {
    const gzipped = gzipSync(payload);
    return {
        Body: { transformToByteArray: async () => new Uint8Array(gzipped) }
    };
}

function baseMessage(overrides: Record<string, unknown> = {}) {
    return {
        userId: 'u1',
        sessionId: 's1',
        traces: undefined,
        tracesS3: { s3Key: 'traces/u1/s1/s1:123.json.gz', traceCount: 2, compressedSize: 100 },
        ...overrides
    } as any;
}

describe('getTracesForMessage', () => {
    beforeEach(() => {
        sendSpy.mockReset();
    });

    afterAll(() => {
        sendSpy.mockRestore();
    });

    it('returns inline traces without touching S3 when they need no reconstitution (legacy/fallback)', async () => {
        const inline = [{ orchestrationTrace: { rationale: { text: 'r' } } }];
        const traces = await getTracesForMessage(baseMessage({ traces: inline, tracesS3: undefined }));

        expect(traces).toEqual(inline);
        expect(sendSpy).not.toHaveBeenCalled();
    });

    it('reconstitutes a deduped llm-instruction trace supplied INLINE (S3-failure fallback)', async () => {
        // The S3-failure fallback persists the deduped form inline, so the reader
        // must reconstitute inline traces too — not just S3-offloaded ones.
        const inline = [
            {
                orchestrationTrace: {
                    rationale: {
                        traceId: 'llm-instruction',
                        text: JSON.stringify({
                            type: 'llm-instruction',
                            systemPromptRef: 'system-prompt-abcd1234',
                            compressedData: gzipAndBase64EncodeString('per-turn delta')
                        })
                    }
                }
            }
        ];
        // Only the system-prompt object is fetched; the traces themselves are inline.
        sendSpy.mockResolvedValueOnce(s3Response('THE SYSTEM PROMPT') as never);

        const traces = await getTracesForMessage(baseMessage({ traces: inline, tracesS3: undefined }));

        const data = JSON.parse((traces[0] as any).orchestrationTrace.rationale.text);
        expect(data.systemPromptRef).toBeUndefined();
        expect(gunzipBase64EncodedString(data.compressedData)).toBe('THE SYSTEM PROMPT\n\nper-turn delta');
        expect(sendSpy).toHaveBeenCalledTimes(1);
        expect((sendSpy.mock.calls[0][0] as any).input.Key).toBe('traces/u1/s1/system-prompt-abcd1234.txt.gz');
    });

    it('returns [] when the message has neither inline traces nor a pointer', async () => {
        expect(await getTracesForMessage(baseMessage({ tracesS3: undefined }))).toEqual([]);
    });

    it('fetches and gunzips the offloaded traces object', async () => {
        const stored = [
            { orchestrationTrace: { observation: { actionGroupInvocationOutput: { text: 'tool result' } } } },
            { orchestrationTrace: { rationale: { traceId: 'x', text: 'plain rationale' } } }
        ];
        sendSpy.mockResolvedValueOnce(s3Response(JSON.stringify(stored)) as never);

        const traces = await getTracesForMessage(baseMessage());

        expect(traces).toEqual(stored);
        const getArgs = sendSpy.mock.calls[0][0] as any;
        expect(getArgs.input).toEqual({ Bucket: 'test-pika-bucket', Key: 'traces/u1/s1/s1:123.json.gz' });
    });

    it('reconstitutes a deduped llm-instruction trace to the full wire format', async () => {
        const stored = [
            {
                orchestrationTrace: {
                    rationale: {
                        traceId: 'llm-instruction',
                        text: JSON.stringify({
                            type: 'llm-instruction',
                            systemPromptRef: 'system-prompt-abcd1234',
                            compressedData: gzipAndBase64EncodeString('per-turn delta')
                        })
                    }
                }
            }
        ];
        sendSpy.mockResolvedValueOnce(s3Response(JSON.stringify(stored)) as never).mockResolvedValueOnce(s3Response('THE SYSTEM PROMPT') as never);

        const traces = await getTracesForMessage(baseMessage());

        const data = JSON.parse((traces[0] as any).orchestrationTrace.rationale.text);
        expect(data.systemPromptRef).toBeUndefined();
        expect(gunzipBase64EncodedString(data.compressedData)).toBe('THE SYSTEM PROMPT\n\nper-turn delta');

        // Prompt fetched from the session's system-prompt object
        const promptArgs = sendSpy.mock.calls[1][0] as any;
        expect(promptArgs.input.Key).toBe('traces/u1/s1/system-prompt-abcd1234.txt.gz');
    });

    it('fetches a shared system prompt only once per call (prompt cache)', async () => {
        const dedupedTrace = (traceId: string) => ({
            orchestrationTrace: {
                rationale: {
                    traceId,
                    text: JSON.stringify({
                        type: 'llm-instruction',
                        systemPromptRef: 'system-prompt-abcd1234',
                        compressedData: gzipAndBase64EncodeString('delta')
                    })
                }
            }
        });
        sendSpy.mockResolvedValueOnce(s3Response(JSON.stringify([dedupedTrace('a'), dedupedTrace('b')])) as never).mockResolvedValueOnce(s3Response('PROMPT') as never);

        await getTracesForMessage(baseMessage());

        expect(sendSpy).toHaveBeenCalledTimes(2); // 1 traces object + 1 prompt object
    });

    it('returns [] when the trace object no longer exists (lifecycle-expired)', async () => {
        sendSpy.mockRejectedValueOnce(new NoSuchKey({ message: 'gone', $metadata: {} }) as never);

        expect(await getTracesForMessage(baseMessage())).toEqual([]);
    });

    it('returns [] when a missing trace object surfaces as 403 AccessDenied (no s3:ListBucket)', async () => {
        sendSpy.mockRejectedValueOnce(new S3ServiceException({ name: 'AccessDenied', $fault: 'client', message: 'Access Denied', $metadata: { httpStatusCode: 403 } }) as never);

        expect(await getTracesForMessage(baseMessage())).toEqual([]);
    });

    it('rethrows other S3 errors', async () => {
        sendSpy.mockRejectedValueOnce(new S3ServiceException({ name: 'SlowDown', $fault: 'server', message: 'slow down', $metadata: { httpStatusCode: 503 } }) as never);

        await expect(getTracesForMessage(baseMessage())).rejects.toThrow('slow down');
    });

    it('shares one system-prompt fetch across concurrent messages given the same cache', async () => {
        const stored = JSON.stringify([
            {
                orchestrationTrace: {
                    rationale: {
                        traceId: 'llm-instruction',
                        text: JSON.stringify({ type: 'llm-instruction', systemPromptRef: 'system-prompt-abcd1234' })
                    }
                }
            }
        ]);
        sendSpy.mockImplementation((async (cmd: any) => s3Response(cmd.input.Key.endsWith('.txt.gz') ? 'PROMPT' : stored)) as never);

        const cache = new Map<string, Promise<string>>();
        const results = await Promise.all(
            [1, 2, 3].map((n) => getTracesForMessage(baseMessage({ tracesS3: { s3Key: `traces/u1/s1/s1:${n}.json.gz`, traceCount: 1, compressedSize: 1 } }), cache))
        );

        const promptFetches = sendSpy.mock.calls.filter((c) => (c[0] as any).input.Key.endsWith('.txt.gz'));
        expect(promptFetches).toHaveLength(1);
        for (const traces of results) {
            const data = JSON.parse((traces[0] as any).orchestrationTrace.rationale.text);
            expect(gunzipBase64EncodedString(data.compressedData)).toBe('PROMPT');
        }
    });

    it('degrades to the delta when the system prompt object is missing', async () => {
        const stored = [
            {
                orchestrationTrace: {
                    rationale: {
                        traceId: 'llm-instruction',
                        text: JSON.stringify({
                            type: 'llm-instruction',
                            systemPromptRef: 'system-prompt-gone',
                            compressedData: gzipAndBase64EncodeString('delta only')
                        })
                    }
                }
            }
        ];
        sendSpy.mockResolvedValueOnce(s3Response(JSON.stringify(stored)) as never).mockRejectedValueOnce(new NoSuchKey({ message: 'gone', $metadata: {} }) as never);

        const traces = await getTracesForMessage(baseMessage());

        const data = JSON.parse((traces[0] as any).orchestrationTrace.rationale.text);
        expect(gunzipBase64EncodedString(data.compressedData)).toBe('delta only');
    });
});
