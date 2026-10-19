import { jest } from '@jest/globals';

process.env.SESSION_RUNNER_MUTEX_TABLE = 'test-mutex-table';
process.env.WAIT_TO_COMPUTE_INSIGHTS_MS = '3600000';
process.env.AWS_REGION = 'us-east-1';
process.env.STAGE = 'test';

const mockDynamoSend = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
jest.mock('@aws-sdk/client-dynamodb', () => {
    const original = jest.requireActual('@aws-sdk/client-dynamodb') as Record<string, unknown>;
    return {
        ...original,
        DynamoDBClient: jest.fn().mockImplementation(() => ({ send: mockDynamoSend })),
        PutItemCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
        GetItemCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
        DeleteItemCommand: jest.fn().mockImplementation((input: unknown) => ({ input }))
    };
});

const mockGetChatSessionByUserIdAndSessionId = jest.fn<(userId: string, sessionId: string) => Promise<Record<string, unknown> | undefined>>();
jest.mock('../../src/lib/chat-ddb', () => ({
    getChatSessionByUserIdAndSessionId: (userId: string, sessionId: string) => mockGetChatSessionByUserIdAndSessionId(userId, sessionId)
}));

const mockSetSessionsInsightsAnalysisInBatch = jest.fn<(items: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
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
const mockAnalyzeSession = jest.fn<(session: unknown, feedbackBatch: unknown) => Promise<MockOutcome>>().mockResolvedValue({});
jest.mock('../../src/lambda/session-insights-runner/insights-analyzer', () => ({
    analyzeSession: (session: unknown, feedbackBatch: unknown) => mockAnalyzeSession(session, feedbackBatch)
}));

import { handler, processInsightsWithPipeline } from '../../src/lambda/session-insights-runner/index';
import { sessionQualityHooks, resetSessionQualityHooks } from '../setup/default-session-quality-hooks';

function makeContext(remainingMs = 300_000): import('aws-lambda').Context {
    return {
        awsRequestId: 'test-request-id',
        getRemainingTimeInMillis: () => remainingMs,
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
    return {
        userId: 'user-1',
        sessionId: 'session-1',
        chatAppId: 'test-app',
        agentId: 'agent-1',
        lastMessageId: 'msg-100',
        invocationMode: 'chat-app',
        ...overrides
    };
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
        chatAppAllowlist: new Set(['test-app']) as Set<string> | undefined,
        ...overrides
    };
}

function makeUpdate(sessionId: string, overrides: Record<string, unknown> = {}) {
    return { userId: 'user-1', sessionId, lastAnalyzedMessageId: 'msg-100', insightStatus: null, insightsS3Url: 's3://b/k.json', ...overrides };
}

function* makeSinglePageIterator(sessions: ReturnType<typeof makeSession>[]) {
    yield sessions;
}

async function mockSweepPage(sessions: ReturnType<typeof makeSession>[]) {
    const { getSessionsThatNeedInsightsAnalysisIterator } = await import('../../src/lib/chat-admin-ddb');
    (getSessionsThatNeedInsightsAnalysisIterator as jest.Mock).mockReturnValueOnce(makeSinglePageIterator(sessions));
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDynamoSend.mockResolvedValue(undefined);
    mockSetSessionsInsightsAnalysisInBatch.mockResolvedValue(undefined);
    mockAnalyzeSession.mockResolvedValue({});
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    resetSessionQualityHooks();
    jest.restoreAllMocks();
});

describe('handler single-session branch', () => {
    it('runs the single-session path when the event has sessionId and userId', async () => {
        const session = makeSession();
        mockGetChatSessionByUserIdAndSessionId.mockResolvedValueOnce(session);

        const result = await handler({ sessionId: 'session-1', userId: 'user-1' }, makeContext());

        expect(result).toEqual({ found: true, sessionId: 'session-1' });
        expect(mockGetChatSessionByUserIdAndSessionId).toHaveBeenCalledWith('user-1', 'session-1');
        expect(mockAnalyzeSession).toHaveBeenCalledWith(session, expect.any(Array));
    });

    it('takes and releases the sweep lock', async () => {
        mockGetChatSessionByUserIdAndSessionId.mockResolvedValueOnce(makeSession());

        await handler({ sessionId: 'session-1', userId: 'user-1' }, makeContext());

        const commands = (mockDynamoSend.mock.calls as unknown as [{ input: Record<string, unknown> }][]).map(([c]) => c.input);
        expect(commands[0]).toEqual(expect.objectContaining({ ConditionExpression: 'attribute_not_exists(lock_name)' }));
        expect(commands[commands.length - 1]).toEqual(expect.objectContaining({ Key: { lock_name: expect.anything() } }));
    });

    it('returns busy without analyzing while a sweep holds the lock', async () => {
        const { ConditionalCheckFailedException } = jest.requireActual('@aws-sdk/client-dynamodb') as typeof import('@aws-sdk/client-dynamodb');
        mockDynamoSend.mockRejectedValueOnce(new ConditionalCheckFailedException({ message: 'held', $metadata: {} }) as never);

        const result = await handler({ sessionId: 'session-1', userId: 'user-1' }, makeContext());

        expect(result).toEqual({ busy: true, sessionId: 'session-1' });
        expect(mockGetChatSessionByUserIdAndSessionId).not.toHaveBeenCalled();
        expect(mockAnalyzeSession).not.toHaveBeenCalled();
    });

    it('checks the runner env before the single-session path', async () => {
        const saved = process.env.SESSION_RUNNER_MUTEX_TABLE;
        delete process.env.SESSION_RUNNER_MUTEX_TABLE;
        try {
            await expect(handler({ sessionId: 'session-1', userId: 'user-1' }, makeContext())).rejects.toThrow('SESSION_RUNNER_MUTEX_TABLE is not set');
        } finally {
            process.env.SESSION_RUNNER_MUTEX_TABLE = saved;
        }
        expect(mockAnalyzeSession).not.toHaveBeenCalled();
    });

    it('returns found=false when the session does not exist', async () => {
        mockGetChatSessionByUserIdAndSessionId.mockResolvedValueOnce(undefined);

        const result = await handler({ sessionId: 'missing-session', userId: 'user-1' }, makeContext());

        expect(result).toEqual({ found: false, sessionId: 'missing-session' });
        expect(mockAnalyzeSession).not.toHaveBeenCalled();
    });

    it('ignores the sweep-enabled hook on the single-session path', async () => {
        Object.assign(sessionQualityHooks, { isSweepEnabled: async () => false });
        mockGetChatSessionByUserIdAndSessionId.mockResolvedValueOnce(makeSession());

        const result = await handler({ sessionId: 'session-1', userId: 'user-1' }, makeContext());

        expect(result).toEqual({ found: true, sessionId: 'session-1' });
        expect(mockAnalyzeSession).toHaveBeenCalledTimes(1);
    });

    it('falls through to the scheduled path when the event is missing userId', async () => {
        Object.assign(sessionQualityHooks, { isSweepEnabled: async () => false });

        await handler({ sessionId: 'session-1' }, makeContext());

        expect(mockGetChatSessionByUserIdAndSessionId).not.toHaveBeenCalled();
        expect(mockAnalyzeSession).not.toHaveBeenCalled();
    });
});

describe('allowlist filter', () => {
    it('analyzes a session whose chatAppId is in the allowlist', async () => {
        await mockSweepPage([makeSession({ chatAppId: 'test-app' })]);

        await processInsightsWithPipeline(new Date(), makeConfig(), makeContext());

        expect(mockAnalyzeSession).toHaveBeenCalledTimes(1);
    });

    it('skips analysis and clears only insight_status when the chatAppId is not in the allowlist', async () => {
        await mockSweepPage([makeSession({ chatAppId: 'other-app' })]);

        await processInsightsWithPipeline(new Date(), makeConfig(), makeContext());

        expect(mockAnalyzeSession).not.toHaveBeenCalled();
        expect(mockSetSessionsInsightsAnalysisInBatch).toHaveBeenCalledTimes(1);
        const flushed = mockSetSessionsInsightsAnalysisInBatch.mock.calls[0][0] as Record<string, unknown>[];
        expect(flushed).toHaveLength(1);
        expect(flushed[0]).toEqual({
            userId: 'user-1',
            sessionId: 'session-1',
            lastAnalyzedMessageId: undefined,
            insightStatus: null,
            insightsS3Url: undefined
        });
    });

    it('persists the analyzer outcome, not the skip-clear shape, for an allowlisted session', async () => {
        await mockSweepPage([makeSession({ chatAppId: 'test-app' })]);
        mockAnalyzeSession.mockResolvedValueOnce({ update: makeUpdate('session-1') });

        await processInsightsWithPipeline(new Date(), makeConfig(), makeContext());

        expect(mockAnalyzeSession).toHaveBeenCalledTimes(1);
        const flushed = mockSetSessionsInsightsAnalysisInBatch.mock.calls[0][0] as Record<string, unknown>[];
        expect(flushed).toHaveLength(1);
        expect(flushed[0].lastAnalyzedMessageId).toBe('msg-100');
        expect(flushed[0].insightsS3Url).toBe('s3://b/k.json');
    });

    it('flushes skip-clears at the batch-size threshold', async () => {
        await mockSweepPage([makeSession({ chatAppId: 'other', sessionId: 's1' }), makeSession({ chatAppId: 'other', sessionId: 's2' })]);

        await processInsightsWithPipeline(new Date(), makeConfig({ dbBatchSize: 1 }), makeContext());

        expect(mockSetSessionsInsightsAnalysisInBatch).toHaveBeenCalledTimes(2);
    });

    it('analyzes the allowlisted apps and clears the rest', async () => {
        await mockSweepPage([
            makeSession({ chatAppId: 'test-app', sessionId: 's1' }),
            makeSession({ chatAppId: 'weather', sessionId: 's2' }),
            makeSession({ chatAppId: 'other', sessionId: 's3' })
        ]);

        await processInsightsWithPipeline(new Date(), makeConfig({ chatAppAllowlist: new Set(['test-app', 'weather']) }), makeContext());

        expect(mockAnalyzeSession).toHaveBeenCalledTimes(2);
        expect(mockSetSessionsInsightsAnalysisInBatch).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ sessionId: 's3', insightStatus: null })]));
    });
});

describe('processed count', () => {
    const threeSessions = () => [makeSession({ sessionId: 's1' }), makeSession({ sessionId: 's2' }), makeSession({ sessionId: 's3' })];

    beforeEach(() => {
        mockAnalyzeSession
            .mockResolvedValueOnce({ update: makeUpdate('s1') })
            .mockResolvedValueOnce({ update: makeUpdate('s2') })
            .mockResolvedValueOnce({ update: makeUpdate('s3') });
    });

    it('counts flushed sessions on the final flush', async () => {
        await mockSweepPage(threeSessions());

        const result = await processInsightsWithPipeline(new Date(), makeConfig(), makeContext());

        expect(result.totalProcessed).toBe(3);
        expect(mockSetSessionsInsightsAnalysisInBatch).toHaveBeenCalledTimes(1);
    });

    it('counts mid-batch threshold flushes too', async () => {
        await mockSweepPage(threeSessions());

        const result = await processInsightsWithPipeline(new Date(), makeConfig({ dbBatchSize: 2 }), makeContext());

        expect(result.totalProcessed).toBe(3);
        expect(mockSetSessionsInsightsAnalysisInBatch).toHaveBeenCalledTimes(2);
    });
});

describe('notification after persist', () => {
    it('sweep path: sends only after the persist resolves', async () => {
        await mockSweepPage([makeSession()]);
        const callOrder: string[] = [];
        const notification = { send: jest.fn(async () => void callOrder.push('send')) };
        mockAnalyzeSession.mockResolvedValueOnce({ update: makeUpdate('session-1'), notification });
        mockSetSessionsInsightsAnalysisInBatch.mockImplementationOnce(async () => void callOrder.push('persist'));

        await processInsightsWithPipeline(new Date(), makeConfig(), makeContext());

        expect(callOrder).toEqual(['persist', 'send']);
    });

    it('single-session path: sends only after the persist resolves', async () => {
        mockGetChatSessionByUserIdAndSessionId.mockResolvedValueOnce(makeSession());
        const callOrder: string[] = [];
        const notification = { send: jest.fn(async () => void callOrder.push('send')) };
        mockAnalyzeSession.mockResolvedValueOnce({ update: makeUpdate('session-1'), notification });
        mockSetSessionsInsightsAnalysisInBatch.mockImplementationOnce(async () => void callOrder.push('persist'));

        await handler({ sessionId: 'session-1', userId: 'user-1' }, makeContext());

        expect(callOrder).toEqual(['persist', 'send']);
        expect(notification.send).toHaveBeenCalledTimes(1);
    });

    it('sends nothing when the persist rejects', async () => {
        mockGetChatSessionByUserIdAndSessionId.mockResolvedValueOnce(makeSession());
        const notification = { send: jest.fn(async () => undefined) };
        mockAnalyzeSession.mockResolvedValueOnce({ update: makeUpdate('session-1'), notification });
        mockSetSessionsInsightsAnalysisInBatch.mockRejectedValueOnce(new Error('ddb down'));

        await expect(handler({ sessionId: 'session-1', userId: 'user-1' }, makeContext())).rejects.toThrow('ddb down');

        expect(notification.send).not.toHaveBeenCalled();
    });

    it('sends nothing when the outcome has no notification', async () => {
        mockGetChatSessionByUserIdAndSessionId.mockResolvedValueOnce(makeSession());
        mockAnalyzeSession.mockResolvedValueOnce({ update: makeUpdate('session-1') });

        await handler({ sessionId: 'session-1', userId: 'user-1' }, makeContext());

        expect(mockSetSessionsInsightsAnalysisInBatch).toHaveBeenCalledTimes(1);
    });
});

describe('concurrent flushes', () => {
    function deferred() {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => (resolve = r));
        return { promise, resolve };
    }

    it('writes every feedback record and session exactly once when flushes overlap', async () => {
        const { addChatSessionFeedback } = await import('../../src/lib/chat-admin-apis');
        await mockSweepPage([makeSession({ sessionId: 's1' }), makeSession({ sessionId: 's2' }), makeSession({ sessionId: 's3' })]);
        mockAnalyzeSession.mockImplementation(async (session, feedbackBatch) => {
            const id = (session as { sessionId: string }).sessionId;
            (feedbackBatch as unknown[]).push({ sessionId: id });
            return { update: makeUpdate(id) };
        });
        const firstPersist = deferred();
        mockSetSessionsInsightsAnalysisInBatch.mockImplementationOnce(() => firstPersist.promise);
        setImmediate(() => setImmediate(firstPersist.resolve));

        const result = await processInsightsWithPipeline(new Date(), makeConfig({ dbBatchSize: 1, insightConcurrency: 3 }), makeContext());

        const persisted = mockSetSessionsInsightsAnalysisInBatch.mock.calls.flatMap(([items]) => (items as { sessionId: string }[]).map((u) => u.sessionId));
        expect(persisted.sort()).toEqual(['s1', 's2', 's3']);
        const feedbackIds = (addChatSessionFeedback as jest.Mock).mock.calls.map(([f]) => (f as { sessionId: string }).sessionId);
        expect(feedbackIds.sort()).toEqual(['s1', 's2', 's3']);
        expect(result.totalProcessed).toBe(3);
    });

    it('puts a failed flush back so a later flush writes it', async () => {
        await mockSweepPage([makeSession({ sessionId: 's1' })]);
        mockAnalyzeSession.mockResolvedValue({ update: makeUpdate('s1') });
        mockSetSessionsInsightsAnalysisInBatch.mockRejectedValueOnce(new Error('throttled'));

        await processInsightsWithPipeline(new Date(), makeConfig({ dbBatchSize: 1 }), makeContext());

        expect(mockSetSessionsInsightsAnalysisInBatch).toHaveBeenCalledTimes(2);
        expect(mockSetSessionsInsightsAnalysisInBatch.mock.calls[1][0]).toEqual([expect.objectContaining({ sessionId: 's1' })]);
    });
});
