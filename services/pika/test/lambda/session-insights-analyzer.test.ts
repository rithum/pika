import { jest } from '@jest/globals';
import { INSIGHT_STATUS_INSIGHTS_FAILED } from 'pika-shared/types/chatbot/chatbot-types';
import type { ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

process.env.AWS_REGION = 'us-east-1';
process.env.PIKA_S3_BUCKET = 'pika-test-bucket';
process.env.CHAT_SESSION_TABLE = 'chat-session-test';
process.env.STAGE = 'test';

const mockBedrockSend = jest.fn<() => Promise<unknown>>();
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
    BedrockRuntimeClient: jest.fn().mockImplementation(() => ({ send: mockBedrockSend })),
    InvokeModelCommand: jest.fn().mockImplementation((input: unknown) => ({ input }))
}));

const mockS3Send = jest.fn<() => Promise<unknown>>().mockResolvedValue({});
jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
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
import { buildUpdateRequest } from '../../src/lib/chat-admin-ddb';

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

function bedrockSuccessResponse(scoring: unknown) {
    const body = {
        id: 'resp-1',
        type: 'message',
        role: 'assistant',
        model: 'test-model',
        content: [{ type: 'text', text: `Analysis complete.\n<json>${JSON.stringify(scoring)}</json>` }],
        usage: { input_tokens: 10, output_tokens: 20 }
    };
    return { body: new TextEncoder().encode(JSON.stringify(body)) };
}

function validationException(message: string, name = 'ValidationException'): Error {
    const err = new Error(message);
    err.name = name;
    return err;
}

beforeEach(() => {
    mockBedrockSend.mockReset();
    mockS3Send.mockClear();
    mockGetChatMessagesInSession.mockReset().mockResolvedValue(MESSAGES);
});

describe('analyzeSession error classification', () => {
    it('ValidationException → update persists INSIGHTS_FAILED stamped with the last message id', async () => {
        mockBedrockSend.mockRejectedValueOnce(validationException('Input is too long for requested model'));

        const outcome = await analyzeSession(makeSession(), []);

        expect(outcome.update).toEqual({
            userId: 'u1',
            sessionId: 's1',
            lastAnalyzedMessageId: 'm2',
            insightStatus: INSIGHT_STATUS_INSIGHTS_FAILED,
            insightsS3Url: undefined
        });
        expect(outcome.update?.insightStatus).toBe('INSIGHTS_FAILED');
        expect(outcome.notification).toBeUndefined();

        const req = buildUpdateRequest(outcome.update!);
        expect(req?.updateParams.UpdateExpression).toBe('SET #insightStatus = :insightStatus, #lastAnalyzedMessageId = :lastAnalyzedMessageId');
        expect(req?.updateParams.ExpressionAttributeValues[':insightStatus']).toBe('INSIGHTS_FAILED');
        expect(req?.updateParams.ExpressionAttributeNames['#insightStatus']).toBe('insight_status');
    });

    it('"Input is too long" without the exception name is still terminal', async () => {
        mockBedrockSend.mockRejectedValueOnce(validationException('Input is too long for requested model', 'Error'));

        const outcome = await analyzeSession(makeSession(), []);

        expect(outcome.update?.insightStatus).toBe(INSIGHT_STATUS_INSIGHTS_FAILED);
        expect(outcome.update?.lastAnalyzedMessageId).toBe('m2');
    });

    it('throttling error → no update (status untouched, retried next tick)', async () => {
        mockBedrockSend.mockRejectedValueOnce(validationException('Rate exceeded', 'ThrottlingException'));

        const outcome = await analyzeSession(makeSession(), []);

        expect(outcome.update).toBeUndefined();
        expect(outcome.notification).toBeUndefined();
    });

    it('success path unchanged — insightStatus: null + lastAnalyzedMessageId + insightsS3Url', async () => {
        mockBedrockSend.mockResolvedValueOnce(bedrockSuccessResponse(BENIGN_SCORING));

        const outcome = await analyzeSession(makeSession(), []);

        expect(outcome.update).toEqual({
            userId: 'u1',
            sessionId: 's1',
            lastAnalyzedMessageId: 'm2',
            insightStatus: null,
            insightsS3Url: 's3://pika-test-bucket/session-insights/test-app/u1/m2.json'
        });
        expect(mockS3Send).toHaveBeenCalledTimes(1);
        expect(outcome.notification).toBeUndefined();
    });
});
