import { jest } from '@jest/globals';
import type { ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

process.env.AWS_REGION = 'us-east-1';
process.env.PIKA_S3_BUCKET = 'pika-test-bucket';
process.env.CHAT_SESSION_TABLE = 'chat-session-test';
process.env.STAGE = 'test';

const mockBedrockSend = jest.fn<(command: { input: { modelId: string; body: string } }) => Promise<unknown>>();
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
    BedrockRuntimeClient: jest.fn().mockImplementation(() => ({ send: (command: { input: { modelId: string; body: string } }) => mockBedrockSend(command) })),
    InvokeModelCommand: jest.fn().mockImplementation((input: unknown) => ({ input }))
}));

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) })),
    PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input }))
}));

const mockGetChatMessagesInSession = jest.fn<() => Promise<unknown[]>>();
jest.mock('../../src/lib/chat-ddb', () => ({
    getChatMessagesInSession: () => mockGetChatMessagesInSession()
}));

jest.mock('../../src/lib/trace-store', () => ({
    getTracesForMessage: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([])
}));

jest.mock('../../src/lib/opensearch/opensearch-client', () => ({
    __esModule: true,
    default: {
        getClient: jest.fn<() => Promise<unknown>>().mockResolvedValue({
            get: jest.fn<() => Promise<unknown>>().mockResolvedValue({ body: { _source: {} } })
        })
    }
}));

import { analyzeSession } from '../../src/lambda/session-insights-runner/insights-analyzer';
import { sessionQualityHooks, resetSessionQualityHooks } from '../setup/default-session-quality-hooks';

const SENTINEL = 'TOOL_FAILED';

function makeSession(overrides: Record<string, unknown> = {}): ChatSession<RecordOrUndef> {
    return {
        userId: 'u1',
        sessionId: 's1',
        chatAppId: 'test-app',
        agentId: 'agent-1',
        lastMessageId: 'm2',
        invocationMode: 'chat-app',
        ...overrides
    } as unknown as ChatSession<RecordOrUndef>;
}

const MESSAGES = [
    { messageId: 'm1', source: 'user', message: 'map my catalog' },
    { messageId: 'm2', source: 'assistant', message: 'done' }
];

function scoring(assessments: Record<string, unknown> = {}, withMetrics = true, complexity = 'low') {
    return {
        assessments: {
            critical_issues_present: false,
            escalation_needed: false,
            requires_followup: false,
            satisfaction_level: 'satisfied',
            user_sentiment: 'positive',
            goal_completion_status: 'completed',
            ...assessments
        },
        ...(withMetrics ? { metrics: { ai_confidence_level: 'high', complexity_level: complexity } } : {})
    };
}

function modelResponse(body: unknown) {
    const payload = {
        id: 'resp-1',
        type: 'message',
        role: 'assistant',
        model: 'test-model',
        content: [{ type: 'text', text: `Analysis complete.\n<json>${JSON.stringify(body)}</json>` }],
        usage: { input_tokens: 10, output_tokens: 20 }
    };
    return { body: new TextEncoder().encode(JSON.stringify(payload)) };
}

function sentRequest() {
    const input = mockBedrockSend.mock.calls[0][0].input;
    return { modelId: input.modelId, body: JSON.parse(input.body) as Record<string, unknown> };
}

function sentPrompt(): string {
    return (sentRequest().body.messages as { content: { text: string }[] }[])[0].content[0].text;
}

function failureTrace(text: string) {
    return { orchestrationTrace: { observation: { actionGroupInvocationOutput: { text } } } };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockBedrockSend.mockReset().mockResolvedValue(modelResponse(scoring()));
    mockGetChatMessagesInSession.mockReset().mockResolvedValue(MESSAGES);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    resetSessionQualityHooks();
    jest.restoreAllMocks();
});

describe('analyzeSession when addFeedback throws after the insights are written', () => {
    it('returns the update with a cleared insight status and no notification', async () => {
        const buildFlaggedSessionNotification = jest.fn(async () => ({ send: async () => undefined }));
        Object.assign(sessionQualityHooks, { buildFlaggedSessionNotification });
        mockBedrockSend.mockResolvedValue(modelResponse(scoring({ critical_issues_present: true }, false)));

        const outcome = await analyzeSession(makeSession(), []);

        expect(outcome.update).toBeDefined();
        expect(outcome.update?.insightStatus).toBeNull();
        expect(outcome.update?.lastAnalyzedMessageId).toBe('m2');
        expect(outcome.update?.insightsS3Url).toBe('s3://pika-test-bucket/session-insights/test-app/u1/m2.json');
        expect(outcome.notification).toBeUndefined();
        expect(buildFlaggedSessionNotification).not.toHaveBeenCalled();
    });
});

describe('analyzeSession model request', () => {
    it('uses the Sonnet 4.6 model id and sends no top_p', async () => {
        await analyzeSession(makeSession(), []);

        const { modelId, body } = sentRequest();
        expect(modelId).toBe('us.anthropic.claude-sonnet-4-6');
        expect(body.temperature).toBe(1);
        expect(body).not.toHaveProperty('top_p');
    });
});

describe('analyzeSession skips', () => {
    it('returns an empty outcome for a session that is not a chat-app session', async () => {
        const outcome = await analyzeSession(makeSession({ invocationMode: 'direct-agent-invoke' }), []);

        expect(outcome).toEqual({});
        expect(mockBedrockSend).not.toHaveBeenCalled();
    });
});

describe('analyzeSession tool failure sentinel', () => {
    const FAILURE_TEXT = `${SENTINEL} {"error":"upstream"}`;
    const messagesWithFailure = [
        { messageId: 'm1', source: 'user', message: 'map my catalog' },
        { messageId: 'm2', source: 'assistant', message: 'done', traces: [failureTrace(FAILURE_TEXT)] }
    ];

    it('adds toolFailures to the prompt when the hook supplies a sentinel', async () => {
        Object.assign(sessionQualityHooks, { toolFailureBodySentinel: SENTINEL });
        mockGetChatMessagesInSession.mockResolvedValue(messagesWithFailure);

        await analyzeSession(makeSession(), []);

        expect(sentPrompt()).toContain('"toolFailures":["TOOL_FAILED {\\"error\\":\\"upstream\\"}"]');
    });

    it('adds no toolFailures to the prompt under the default hooks', async () => {
        mockGetChatMessagesInSession.mockResolvedValue(messagesWithFailure);

        await analyzeSession(makeSession(), []);

        expect(sentPrompt()).not.toContain('toolFailures');
    });
});

describe('analyzeSession truncation', () => {
    const hugeSession = Array.from({ length: 200 }, (_, i) => ({
        messageId: `m${i + 1}`,
        source: i % 2 === 0 ? 'user' : 'assistant',
        message: `msg-${i + 1}-` + 'x'.repeat(5_000)
    }));

    it('truncates an over-budget payload and stamps the last message id', async () => {
        mockGetChatMessagesInSession.mockResolvedValue(hugeSession);

        const outcome = await analyzeSession(makeSession({ lastMessageId: 'm200' }), []);

        expect(sentPrompt()).toContain('earlier messages omitted for length');
        expect(sentPrompt()).not.toContain('msg-10-');
        expect(outcome.update?.lastAnalyzedMessageId).toBe('m200');
    });
});

describe('analyzeSession flagged-session notification', () => {
    it('logs INSIGHTS_FLAGGED with the session ids and severity', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        mockBedrockSend.mockResolvedValue(modelResponse(scoring({ escalation_needed: true })));

        await analyzeSession(makeSession(), []);

        const line = warn.mock.calls.map((c) => String(c[0])).find((m) => m.startsWith('INSIGHTS_FLAGGED'));
        expect(line).toBe(
            'INSIGHTS_FLAGGED session_id=s1 chat_app_id=test-app agent_id=agent-1 severity=urgent goal=completed satisfaction=satisfied'
        );
    });

    it('does not build a notification for a session with only non-urgent notes', async () => {
        const buildFlaggedSessionNotification = jest.fn(async () => ({ send: async () => undefined }));
        Object.assign(sessionQualityHooks, { buildFlaggedSessionNotification });
        mockBedrockSend.mockResolvedValue(modelResponse(scoring({}, true, 'high')));

        const outcome = await analyzeSession(makeSession(), []);

        expect(outcome.update).toBeDefined();
        expect(outcome.notification).toBeUndefined();
        expect(buildFlaggedSessionNotification).not.toHaveBeenCalled();
    });

    it('returns the hook notification alongside the update for an urgent session', async () => {
        const notification = { send: async () => undefined };
        const buildFlaggedSessionNotification = jest.fn(async () => notification);
        Object.assign(sessionQualityHooks, { buildFlaggedSessionNotification });
        mockBedrockSend.mockResolvedValue(modelResponse(scoring({ escalation_needed: true })));

        const outcome = await analyzeSession(makeSession(), []);

        expect(outcome.notification).toBe(notification);
        expect(outcome.update?.insightStatus).toBeNull();
    });
});
