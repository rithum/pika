/**
 * Reader side of the S3 trace offload: hydrates offloaded traces and rebuilds deduped
 * llm-instruction traces, so every reader sees the original wire format.
 */
import { GetObjectCommand, NoSuchKey, S3, S3ServiceException } from '@aws-sdk/client-s3';
import type { Trace } from '@aws-sdk/client-bedrock-agent-runtime';
import type { ChatMessage } from 'pika-shared/types/chatbot/chatbot-types';
import { gunzipBase64EncodedString, gzipAndBase64EncodeString } from 'pika-shared/util/server-utils';
import { gunzipSync } from 'zlib';
import { getRegion } from './utils';

let s3: S3 | undefined;

function getS3Client(): S3 {
    if (!s3) {
        s3 = new S3({ region: getRegion() });
    }
    return s3;
}

function getTraceBucket(): string {
    const bucket = process.env.PIKA_S3_BUCKET;
    if (!bucket) {
        throw new Error('PIKA_S3_BUCKET is not set; cannot read offloaded traces');
    }
    return bucket;
}

async function getGzippedObjectAsString(key: string): Promise<string> {
    const response = await getS3Client().send(new GetObjectCommand({ Bucket: getTraceBucket(), Key: key }));
    const bytes = await response.Body!.transformToByteArray();
    return gunzipSync(Buffer.from(bytes)).toString('utf-8');
}

// Readers hold s3:GetObject without s3:ListBucket, so S3 reports a missing key as 403 AccessDenied.
function isMissingObjectError(e: unknown): boolean {
    return e instanceof NoSuchKey || (e instanceof S3ServiceException && (e.name === 'AccessDenied' || e.$metadata?.httpStatusCode === 403));
}

/** Key prefix shared by a session's trace objects (per-message and system-prompt). */
export function sessionTracePrefix(userId: string, sessionId: string): string {
    return `traces/${userId}/${sessionId}/`;
}

function systemPromptKey(userId: string, sessionId: string, systemPromptRef: string): string {
    return `${sessionTracePrefix(userId, sessionId)}${systemPromptRef}.txt.gz`;
}

interface LlmInstructionTraceData {
    type: string;
    compressedData?: string;
    systemPromptRef?: string;
}

/** Rebuild a deduped llm-instruction trace into the full historical form. */
async function reconstituteLlmInstruction(trace: Trace, userId: string, sessionId: string, promptCache: Map<string, Promise<string>>): Promise<Trace> {
    const text = trace.orchestrationTrace?.rationale?.text;
    if (!text || !text.includes('"type":"llm-instruction"')) {
        return trace;
    }
    let data: LlmInstructionTraceData;
    try {
        data = JSON.parse(text);
    } catch {
        return trace;
    }
    if (data.type !== 'llm-instruction' || !data.systemPromptRef) {
        return trace;
    }

    const ref = data.systemPromptRef;
    const promptKey = systemPromptKey(userId, sessionId, ref);
    let pending = promptCache.get(promptKey);
    if (!pending) {
        pending = getGzippedObjectAsString(promptKey).catch((e) => {
            // Prompt object missing (e.g. expired by lifecycle): surface the delta
            // rather than failing the whole trace fetch.
            console.warn(`System prompt object ${ref} unavailable for session ${sessionId}:`, e instanceof Error ? e.message : e);
            return '';
        });
        promptCache.set(promptKey, pending);
    }
    const systemPrompt = await pending;

    let delta = '';
    if (data.compressedData) {
        try {
            delta = gunzipBase64EncodedString(data.compressedData);
        } catch (e) {
            // A capped inline-fallback trace may truncate compressedData mid-stream.
            // Surface the system prompt rather than failing the whole trace fetch.
            console.warn(`Failed to decompress llm-instruction delta for session ${sessionId}:`, e instanceof Error ? e.message : e);
        }
    }
    const full = [systemPrompt, delta].filter((p) => p).join('\n\n');

    return {
        orchestrationTrace: {
            ...trace.orchestrationTrace!,
            rationale: {
                ...trace.orchestrationTrace!.rationale,
                text: JSON.stringify({ type: 'llm-instruction', compressedData: gzipAndBase64EncodeString(full) })
            }
        }
    } as Trace;
}

/**
 * Return the message's traces, hydrating from S3 when offloaded. Pass one promptCache
 * across the messages of a session so its shared system-prompt object is fetched once.
 */
export async function getTracesForMessage(
    message: Pick<ChatMessage, 'traces' | 'tracesS3' | 'userId' | 'sessionId'>,
    promptCache: Map<string, Promise<string>> = new Map()
): Promise<Trace[]> {
    let rawTraces: Trace[];
    if (message.traces && message.traces.length > 0) {
        rawTraces = message.traces;
    } else if (message.tracesS3?.s3Key) {
        try {
            rawTraces = JSON.parse(await getGzippedObjectAsString(message.tracesS3.s3Key));
        } catch (e) {
            if (isMissingObjectError(e)) {
                console.warn(`Trace object ${message.tracesS3.s3Key} no longer exists or is not readable`);
                return [];
            }
            throw e;
        }
    } else {
        return [];
    }

    const hydrated: Trace[] = [];
    for (const trace of rawTraces) {
        hydrated.push(await reconstituteLlmInstruction(trace, message.userId, message.sessionId, promptCache));
    }
    return hydrated;
}
