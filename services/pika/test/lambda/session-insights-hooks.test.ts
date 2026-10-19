import { jest } from '@jest/globals';
import type { ChatSession, ChatSessionFeedback, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

process.env.SESSION_RUNNER_MUTEX_TABLE = 'test-mutex-table';
process.env.WAIT_TO_COMPUTE_INSIGHTS_MS = '3600000';
process.env.AWS_REGION = 'us-east-1';
process.env.PIKA_S3_BUCKET = 'pika-test-bucket';
process.env.STAGE = 'test';

interface FakeCommand {
    kind: 'get' | 'put' | 'delete';
    input: { Item?: Record<string, { S?: string }>; Key?: Record<string, { S: string }>; ConditionExpression?: string };
}
const mockDynamoSend = jest.fn<(cmd: FakeCommand) => Promise<unknown>>();
jest.mock('@aws-sdk/client-dynamodb', () => {
    const original = jest.requireActual('@aws-sdk/client-dynamodb') as Record<string, unknown>;
    return {
        ...original,
        DynamoDBClient: jest.fn().mockImplementation(() => ({ send: (cmd: FakeCommand) => mockDynamoSend(cmd) })),
        PutItemCommand: jest.fn().mockImplementation((input: unknown) => ({ kind: 'put', input })),
        GetItemCommand: jest.fn().mockImplementation((input: unknown) => ({ kind: 'get', input })),
        DeleteItemCommand: jest.fn().mockImplementation((input: unknown) => ({ kind: 'delete', input }))
    };
});

jest.mock('p-map', () => {
    const pMap = async <T, R>(items: Iterable<T>, mapper: (item: T) => Promise<R>, opts?: { concurrency?: number }) => {
        const queue = [...items];
        const results: R[] = new Array(queue.length);
        let next = 0;
        const worker = async () => {
            while (next < queue.length) {
                const index = next++;
                results[index] = await mapper(queue[index]);
            }
        };
        await Promise.all(Array.from({ length: Math.min(opts?.concurrency ?? 1, queue.length) }, worker));
        return results;
    };
    return { __esModule: true, default: pMap };
});

jest.mock('p-retry', () => {
    class AbortError extends Error {}
    const pRetry = async (fn: (attempt: number) => Promise<unknown>, opts?: { retries?: number }) => {
        const attempts = (opts?.retries ?? 0) + 1;
        let lastError: unknown;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                return await fn(attempt);
            } catch (e) {
                if (e instanceof AbortError) throw e;
                lastError = e;
            }
        }
        throw lastError;
    };
    return { __esModule: true, default: pRetry, AbortError };
});

jest.mock('../../src/lib/chat-ddb', () => ({
    getChatSessionByUserIdAndSessionId: jest.fn(),
    getChatMessagesInSession: jest.fn()
}));
jest.mock('../../src/lib/trace-store', () => ({ getTracesForMessage: jest.fn() }));
jest.mock('../../src/lib/opensearch/opensearch-client', () => ({
    __esModule: true,
    default: { getClient: jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('no opensearch in test')) }
}));

const mockSetSessionsInsightsAnalysisInBatch = jest.fn<(items: unknown[]) => Promise<void>>();
jest.mock('../../src/lib/chat-admin-ddb', () => ({
    getSessionsThatNeedInsightsAnalysisIterator: jest.fn(),
    setSessionsInsightsAnalysisInBatch: (items: unknown[]) => mockSetSessionsInsightsAnalysisInBatch(items)
}));
jest.mock('../../src/lib/chat-admin-apis', () => ({
    addChatSessionFeedback: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
}));

interface MockOutcome {
    update?: Record<string, unknown>;
    notification?: { send: () => Promise<void> };
}
const mockAnalyzeSession = jest.fn<(session: unknown, feedbackBatch: unknown) => Promise<MockOutcome>>();
jest.mock('../../src/lambda/session-insights-runner/insights-analyzer', () => ({
    ...(jest.requireActual('../../src/lambda/session-insights-runner/insights-analyzer') as Record<string, unknown>),
    analyzeSession: (session: unknown, feedbackBatch: unknown) => mockAnalyzeSession(session, feedbackBatch)
}));

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { handler, processInsightsWithPipeline } from '../../src/lambda/session-insights-runner/index';
import { addFeedback } from '../../src/lambda/session-insights-runner/insights-analyzer';
import { getSessionsThatNeedInsightsAnalysisIterator } from '../../src/lib/chat-admin-ddb';
import { getSessionQualityHooks } from '../../src/lib/session-quality';
import type { PendingNotification } from '../../src/lib/session-quality-base';
import { sessionQualityHooks, resetSessionQualityHooks } from '../setup/default-session-quality-hooks';

const START_FLOOR_KEY = 'session-insights-runner#start-floor';
const HOOK_FLOOR = '2026-03-03T00:00:00.000Z';
const ENV_FLOOR = '2026-02-02T00:00:00.000Z';
const RACED_FLOOR = '2026-01-01T00:00:00.000Z';

const iteratorMock = getSessionsThatNeedInsightsAnalysisIterator as unknown as jest.Mock<(...args: unknown[]) => unknown>;
let store: Map<string, Record<string, { S?: string }>>;
let calls: FakeCommand[];
let raceOnStamp = false;
let failFloorRead = false;

function makeContext(): import('aws-lambda').Context {
    return {
        awsRequestId: 'test-request-id',
        getRemainingTimeInMillis: () => 300_000,
        functionName: 'test-fn',
        functionVersion: '1',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:000000001:function:test-fn',
        memoryLimitInMB: '1024',
        logGroupName: '/aws/lambda/test-fn',
        logStreamName: '2024/01/01/[$LATEST]abc',
        identity: undefined as unknown as import('aws-lambda').CognitoIdentity,
        clientContext: undefined as unknown as import('aws-lambda').ClientContext,
        callbackWaitsForEmptyEventLoop: true,
        done: jest.fn(),
        fail: jest.fn(),
        succeed: jest.fn()
    };
}

function makeSession(overrides: Record<string, unknown> = {}) {
    return { userId: 'user-1', sessionId: 'session-1', chatAppId: 'test-app', agentId: 'agent-1', lastMessageId: 'msg-100', invocationMode: 'chat-app', ...overrides };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
    return {
        queryPageSize: 100,
        insightBatchSize: 10,
        dbBatchSize: 10,
        insightConcurrency: 1,
        feedbackConcurrency: 1,
        timeoutBufferMs: 0,
        maxRetries: 3,
        chatAppAllowlist: undefined as Set<string> | undefined,
        ...overrides
    };
}

function makeUpdate(sessionId: string) {
    return { userId: 'user-1', sessionId, lastAnalyzedMessageId: 'msg-100', insightStatus: null, insightsS3Url: 's3://b/k.json' };
}

function servePage(sessions: ReturnType<typeof makeSession>[]) {
    iteratorMock.mockImplementationOnce(() =>
        (async function* () {
            yield sessions;
        })()
    );
}

function lockCalls(kind: FakeCommand['kind']) {
    return calls.filter((c) => c.kind === kind && c.input.Item?.lock_name?.S !== START_FLOOR_KEY && c.input.Key?.lock_name?.S !== START_FLOOR_KEY);
}

function floorPuts() {
    return calls.filter((c) => c.kind === 'put' && c.input.Item?.lock_name?.S === START_FLOOR_KEY);
}

beforeEach(() => {
    jest.clearAllMocks();
    store = new Map();
    calls = [];
    raceOnStamp = false;
    failFloorRead = false;
    delete process.env.INSIGHTS_START_FLOOR;
    mockDynamoSend.mockImplementation(async (cmd) => {
        calls.push(cmd);
        const name = cmd.input.Item?.lock_name?.S ?? cmd.input.Key?.lock_name?.S ?? '';
        if (cmd.kind === 'get') {
            if (failFloorRead) throw new Error('dynamo unavailable');
            return { Item: store.get(name) };
        }
        if (cmd.kind === 'put') {
            if (name === START_FLOOR_KEY && raceOnStamp) {
                store.set(name, { lock_name: { S: name }, floor: { S: RACED_FLOOR } });
                throw new ConditionalCheckFailedException({ message: 'exists', $metadata: {}, Item: undefined } as never);
            }
            if (cmd.input.ConditionExpression && store.has(name)) {
                throw new ConditionalCheckFailedException({ message: 'exists', $metadata: {} } as never);
            }
            store.set(name, cmd.input.Item as Record<string, { S?: string }>);
            return {};
        }
        store.delete(name);
        return {};
    });
    mockSetSessionsInsightsAnalysisInBatch.mockResolvedValue(undefined);
    mockAnalyzeSession.mockResolvedValue({});
    iteratorMock.mockImplementation(() =>
        (async function* () {
            /* empty sweep */
        })()
    );
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    resetSessionQualityHooks();
    delete process.env.INSIGHTS_START_FLOOR;
    jest.restoreAllMocks();
});

describe('sweep enable gate', () => {
    it('takes no lock and runs no sweep when the sweep is disabled', async () => {
        Object.assign(sessionQualityHooks, { isSweepEnabled: async () => false });

        await handler(undefined, makeContext());

        expect(calls).toHaveLength(0);
        expect(iteratorMock).not.toHaveBeenCalled();
    });

    it('takes no lock and runs no sweep when isSweepEnabled throws', async () => {
        Object.assign(sessionQualityHooks, {
            isSweepEnabled: async () => {
                throw new Error('config unavailable');
            }
        });

        await handler(undefined, makeContext());

        expect(calls).toHaveLength(0);
        expect(iteratorMock).not.toHaveBeenCalled();
    });

    it('runs the sweep under the default hooks', async () => {
        await handler(undefined, makeContext());

        expect(lockCalls('put')).toHaveLength(1);
        expect(iteratorMock).toHaveBeenCalledTimes(1);
        expect(lockCalls('delete')).toHaveLength(1);
    });
});

describe('start floor', () => {
    const floorPassedToSweep = () => iteratorMock.mock.calls[0][4];

    it('prefers the hook over the env var and the stamp', async () => {
        process.env.INSIGHTS_START_FLOOR = ENV_FLOOR;
        Object.assign(sessionQualityHooks, { getSweepStartFloor: async () => HOOK_FLOOR });

        await handler(undefined, makeContext());

        expect(floorPassedToSweep()).toBe(HOOK_FLOOR);
        expect(floorPuts()).toHaveLength(0);
    });

    it('prefers the env var over the stamp', async () => {
        process.env.INSIGHTS_START_FLOOR = ENV_FLOOR;

        await handler(undefined, makeContext());

        expect(floorPassedToSweep()).toBe(ENV_FLOOR);
        expect(floorPuts()).toHaveLength(0);
    });

    it('stamps the floor once with no ttl and reuses it', async () => {
        await handler(undefined, makeContext());
        await handler(undefined, makeContext());

        expect(floorPuts()).toHaveLength(1);
        const item = floorPuts()[0].input.Item as Record<string, unknown>;
        expect(item).not.toHaveProperty('ttl');
        expect(floorPuts()[0].input.ConditionExpression).toBe('attribute_not_exists(lock_name)');
        const stamped = (item.floor as { S: string }).S;
        expect(iteratorMock.mock.calls[0][4]).toBe(stamped);
        expect(iteratorMock.mock.calls[1][4]).toBe(stamped);
    });

    it('re-reads the floor when the stamp write loses a race', async () => {
        raceOnStamp = true;

        await handler(undefined, makeContext());

        expect(floorPassedToSweep()).toBe(RACED_FLOOR);
    });

    it('skips the sweep, and still releases the lock, when the stamp cannot be read', async () => {
        failFloorRead = true;

        await handler(undefined, makeContext());

        expect(iteratorMock).not.toHaveBeenCalled();
        expect(lockCalls('delete')).toHaveLength(1);
    });

    it('skips the sweep and stamps no floor when the floor hook throws', async () => {
        Object.assign(sessionQualityHooks, {
            getSweepStartFloor: async () => {
                throw new Error('boom');
            }
        });

        await handler(undefined, makeContext());

        expect(floorPuts()).toHaveLength(0);
        expect(iteratorMock).not.toHaveBeenCalled();
        expect(lockCalls('delete')).toHaveLength(1);
    });
});

describe('chat-app allowlist', () => {
    it('clears nothing and analyzes everything when the allowlist is undefined', async () => {
        servePage([makeSession({ sessionId: 's1', chatAppId: 'a' }), makeSession({ sessionId: 's2', chatAppId: 'b' })]);

        await handler(undefined, makeContext());

        expect(mockAnalyzeSession).toHaveBeenCalledTimes(2);
        expect(mockSetSessionsInsightsAnalysisInBatch).not.toHaveBeenCalled();
    });

    it('skips the sweep for an empty allowlist', async () => {
        Object.assign(sessionQualityHooks, { getChatAppAllowlist: async () => new Set<string>() });

        await handler(undefined, makeContext());

        expect(iteratorMock).not.toHaveBeenCalled();
        expect(mockAnalyzeSession).not.toHaveBeenCalled();
        expect(mockSetSessionsInsightsAnalysisInBatch).not.toHaveBeenCalled();
        expect(lockCalls('delete')).toHaveLength(1);
    });

    it('analyzes allowlisted apps and clears the queue flag of the others', async () => {
        Object.assign(sessionQualityHooks, { getChatAppAllowlist: async () => new Set(['a']) });
        servePage([makeSession({ sessionId: 's1', chatAppId: 'a' }), makeSession({ sessionId: 's2', chatAppId: 'b' })]);

        await handler(undefined, makeContext());

        expect(mockAnalyzeSession).toHaveBeenCalledTimes(1);
        expect(mockSetSessionsInsightsAnalysisInBatch).toHaveBeenCalledWith([expect.objectContaining({ sessionId: 's2', insightStatus: null, lastAnalyzedMessageId: undefined })]);
    });

    it('skips the sweep when the allowlist hook throws', async () => {
        Object.assign(sessionQualityHooks, {
            getChatAppAllowlist: async () => {
                throw new Error('boom');
            }
        });

        await handler(undefined, makeContext());

        expect(iteratorMock).not.toHaveBeenCalled();
        expect(mockSetSessionsInsightsAnalysisInBatch).not.toHaveBeenCalled();
    });
});

describe('flagged-session notification', () => {
    const BENIGN_SCORING = {
        assessments: {
            critical_issues_present: false,
            escalation_needed: false,
            requires_followup: false,
            satisfaction_level: 'satisfied',
            user_sentiment: 'positive',
            goal_completion_status: 'completed'
        },
        metrics: { ai_confidence_level: 'high', complexity_level: 'low' }
    };

    function scoring(assessments: Record<string, unknown> = {}) {
        return { ...BENIGN_SCORING, assessments: { ...BENIGN_SCORING.assessments, ...assessments } } as never;
    }

    function runAddFeedback(s: never, session: Record<string, unknown> = {}, lastAnalyzedMessageId = 'msg-100') {
        const feedbackBatch: ChatSessionFeedback[] = [];
        const result = addFeedback(
            s,
            makeSession(session) as unknown as ChatSession<RecordOrUndef>,
            'msg-1',
            lastAnalyzedMessageId,
            's3://b/k.json',
            feedbackBatch,
            getSessionQualityHooks()
        );
        return { result, feedbackBatch };
    }

    it('applies the default follow-up predicate', async () => {
        const { result, feedbackBatch } = runAddFeedback(scoring({ requires_followup: true }));

        await result;

        expect(feedbackBatch.some((f) => f.type === 'critical_issues_present')).toBe(true);
    });

    it('uses a custom requiresEmployeeFollowup', async () => {
        const buildFlaggedSessionNotification = jest.fn(async () => ({ send: async () => undefined }));
        Object.assign(sessionQualityHooks, { requiresEmployeeFollowup: (a: { escalation_needed?: boolean }) => !!a.escalation_needed, buildFlaggedSessionNotification });

        const ignored = runAddFeedback(scoring({ requires_followup: true }));
        expect(await ignored.result).toBeUndefined();
        expect(ignored.feedbackBatch.some((f) => f.type === 'critical_issues_present')).toBe(false);
        expect(buildFlaggedSessionNotification).not.toHaveBeenCalled();

        const flagged = runAddFeedback(scoring({ escalation_needed: true }));
        expect(await flagged.result).toBeDefined();
        expect(buildFlaggedSessionNotification).toHaveBeenCalledTimes(1);
    });

    it('falls back to the default predicate when the custom one throws', async () => {
        Object.assign(sessionQualityHooks, {
            requiresEmployeeFollowup: () => {
                throw new Error('boom');
            }
        });

        const { result, feedbackBatch } = runAddFeedback(scoring({ critical_issues_present: true }));

        await result;
        expect(feedbackBatch.some((f) => f.type === 'critical_issues_present')).toBe(true);
    });

    it('builds no notification when the boundary was already alerted', async () => {
        const buildFlaggedSessionNotification = jest.fn(async () => ({ send: async () => undefined }));
        Object.assign(sessionQualityHooks, { buildFlaggedSessionNotification });

        const { result } = runAddFeedback(scoring({ critical_issues_present: true }), { lastAnalyzedMessageId: 'msg-100' }, 'msg-100');

        expect(await result).toBeUndefined();
        expect(buildFlaggedSessionNotification).not.toHaveBeenCalled();
    });

    it('builds no notification when the hook throws', async () => {
        Object.assign(sessionQualityHooks, {
            buildFlaggedSessionNotification: async () => {
                throw new Error('boom');
            }
        });

        const { result } = runAddFeedback(scoring({ critical_issues_present: true }));

        expect(await result).toBeUndefined();
    });
});

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

const tick = () => new Promise<void>((r) => setImmediate(r));

async function until(condition: () => boolean) {
    for (let i = 0; i < 50 && !condition(); i++) await tick();
    expect(condition()).toBe(true);
}

describe('notification delivery', () => {
    function notification(send: () => Promise<void> = async () => undefined) {
        return { send: jest.fn(send) } satisfies PendingNotification;
    }

    it('sends only after the session update is persisted', async () => {
        servePage([makeSession()]);
        const order: string[] = [];
        const n = notification(async () => void order.push('send'));
        mockAnalyzeSession.mockResolvedValueOnce({ update: makeUpdate('session-1'), notification: n });
        mockSetSessionsInsightsAnalysisInBatch.mockImplementationOnce(async () => void order.push('persist'));

        await handler(undefined, makeContext());

        expect(order).toEqual(['persist', 'send']);
    });

    it('sends nothing when the flush fails', async () => {
        servePage([makeSession()]);
        const n = notification();
        mockAnalyzeSession.mockResolvedValue({ update: makeUpdate('session-1'), notification: n });
        mockSetSessionsInsightsAnalysisInBatch.mockRejectedValue(new Error('ddb down'));

        const result = await processInsightsWithPipeline(new Date(), makeConfig(), makeContext());

        expect(result.totalFailed).toBeGreaterThan(0);
        expect(n.send).not.toHaveBeenCalled();
    });

    it('sends exactly one notification and writes one update after a failed threshold flush, a retry and a later success', async () => {
        servePage([makeSession()]);
        const sent: string[] = [];
        mockAnalyzeSession.mockImplementation(async () => ({
            update: makeUpdate('session-1'),
            notification: notification(async () => void sent.push('send'))
        }));
        mockSetSessionsInsightsAnalysisInBatch.mockRejectedValueOnce(new Error('ddb down')).mockResolvedValue(undefined);

        const result = await processInsightsWithPipeline(new Date(), makeConfig({ dbBatchSize: 1 }), makeContext());

        expect(mockAnalyzeSession).toHaveBeenCalledTimes(2);
        expect(mockSetSessionsInsightsAnalysisInBatch).toHaveBeenCalledTimes(2);
        expect(mockSetSessionsInsightsAnalysisInBatch.mock.calls[1][0]).toHaveLength(1);
        expect(sent).toEqual(['send']);
        expect(result.totalProcessed).toBe(1);
    });

    it('does not fail the flush when send throws', async () => {
        servePage([makeSession()]);
        const n = notification(async () => {
            throw new Error('notifier down');
        });
        mockAnalyzeSession.mockResolvedValueOnce({ update: makeUpdate('session-1'), notification: n });

        const result = await processInsightsWithPipeline(new Date(), makeConfig(), makeContext());

        expect(n.send).toHaveBeenCalledTimes(1);
        expect(result.totalProcessed).toBe(1);
        expect(result.totalFailed).toBe(0);
    });

    it('does not clear or send for sessions added while a flush is awaiting its write', async () => {
        servePage([makeSession({ sessionId: 'a' }), makeSession({ sessionId: 'b' })]);
        const sent: string[] = [];
        const released: Array<() => void> = [];
        const bAnalysis = deferred();
        mockSetSessionsInsightsAnalysisInBatch.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    released.push(resolve);
                })
        );
        mockAnalyzeSession.mockImplementation(async (session) => {
            const id = (session as { sessionId: string }).sessionId;
            if (id === 'b') await bAnalysis.promise;
            return { update: makeUpdate(id), notification: notification(async () => void sent.push(id)) };
        });

        const run = processInsightsWithPipeline(new Date(), makeConfig({ dbBatchSize: 1, insightConcurrency: 2 }), makeContext());
        await until(() => released.length === 1);
        expect(mockSetSessionsInsightsAnalysisInBatch.mock.calls[0][0]).toHaveLength(1);

        bAnalysis.resolve();
        await until(() => released.length === 2);
        expect(mockSetSessionsInsightsAnalysisInBatch.mock.calls[1][0]).toHaveLength(2);

        released[0]();
        await until(() => sent.length > 0);
        await tick();
        expect(sent).toEqual(['a']);

        released[1]();
        const result = await run;

        expect(sent).toEqual(['a', 'b']);
        expect(result.totalFailed).toBe(0);
    });
});
