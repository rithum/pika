import { jest } from '@jest/globals';
import type { ChatSession, ChatSessionFeedbackForCreate, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

const addFeedback = jest.fn<(feedback: unknown) => Promise<void>>().mockResolvedValue(undefined);
const getChatSessionByUserIdAndSessionId = jest.fn<(userId: string, sessionId: string) => Promise<ChatSession<RecordOrUndef> | undefined>>();
jest.mock('../../src/lib/chat-ddb', () => ({
    addFeedback: (feedback: unknown) => addFeedback(feedback),
    getChatSessionByUserIdAndSessionId: (userId: string, sessionId: string) => getChatSessionByUserIdAndSessionId(userId, sessionId)
}));

const setSessionsInsightsAnalysisInBatch = jest.fn<(items: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
jest.mock('../../src/lib/chat-admin-ddb', () => ({
    addFeedback: (feedback: unknown) => addFeedback(feedback),
    setSessionsInsightsAnalysisInBatch: (items: unknown[]) => setSessionsInsightsAnalysisInBatch(items)
}));
jest.mock('../../src/lib/bedrock-agent', () => ({}));
jest.mock('../../src/lib/get-matching-chat-apps', () => ({}));
jest.mock('../../src/lib/opensearch/opensearch', () => ({}));

import { addChatSessionFeedback as addEndUserFeedback } from '../../src/lib/chat-apis';
import { addChatSessionFeedback as addAdminFeedback } from '../../src/lib/chat-admin-apis';
import { markSessionForInsightsOnThumbsDown } from '../../src/lib/session-quality';
import { sessionQualityHooks, resetSessionQualityHooks } from '../setup/default-session-quality-hooks';

const THUMBS_DOWN = { sessionId: 's1', userId: 'u1', type: 'user_thumbs_down' } as ChatSessionFeedbackForCreate;

function session(overrides: Record<string, unknown> = {}): ChatSession<RecordOrUndef> {
    return { sessionId: 's1', userId: 'u1', chatAppId: 'test-app', sessionAttributes: { accountId: '000000001' }, ...overrides } as unknown as ChatSession<RecordOrUndef>;
}

function useHook(result: boolean | Error) {
    const hook = jest.fn(async () => {
        if (result instanceof Error) throw result;
        return result;
    });
    Object.assign(sessionQualityHooks, { shouldMarkForInsightsOnThumbsDown: hook });
    return hook;
}

beforeEach(() => {
    jest.clearAllMocks();
    getChatSessionByUserIdAndSessionId.mockResolvedValue(session());
    setSessionsInsightsAnalysisInBatch.mockResolvedValue(undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    resetSessionQualityHooks();
    jest.restoreAllMocks();
});

describe('markSessionForInsightsOnThumbsDown', () => {
    it('does no session read and no mark with the default hooks', async () => {
        await markSessionForInsightsOnThumbsDown(THUMBS_DOWN, 'end-user');

        expect(getChatSessionByUserIdAndSessionId).not.toHaveBeenCalled();
        expect(setSessionsInsightsAnalysisInBatch).not.toHaveBeenCalled();
    });

    it('marks the session once when the hook returns true', async () => {
        const hook = useHook(true);

        await markSessionForInsightsOnThumbsDown(THUMBS_DOWN, 'end-user');

        expect(hook).toHaveBeenCalledWith({ userId: 'u1', sessionId: 's1', chatAppId: 'test-app', sessionAttributes: { accountId: '000000001' }, source: 'end-user' });
        expect(setSessionsInsightsAnalysisInBatch).toHaveBeenCalledTimes(1);
        expect(setSessionsInsightsAnalysisInBatch).toHaveBeenCalledWith([
            { userId: 'u1', sessionId: 's1', insightStatus: 'NEEDS_INSIGHTS_ANALYSIS', lastAnalyzedMessageId: undefined, insightsS3Url: undefined }
        ]);
    });

    it('does not mark when the hook returns false', async () => {
        useHook(false);

        await markSessionForInsightsOnThumbsDown(THUMBS_DOWN, 'end-user');

        expect(setSessionsInsightsAnalysisInBatch).not.toHaveBeenCalled();
    });

    it('ignores feedback that is not a thumbs-down', async () => {
        const hook = useHook(true);

        await markSessionForInsightsOnThumbsDown({ ...THUMBS_DOWN, type: 'user_thumbs_up' }, 'end-user');

        expect(hook).not.toHaveBeenCalled();
        expect(getChatSessionByUserIdAndSessionId).not.toHaveBeenCalled();
    });

    it('does not call the hook when the session is already queued', async () => {
        const hook = useHook(true);
        getChatSessionByUserIdAndSessionId.mockResolvedValue(session({ insightStatus: 'NEEDS_INSIGHTS_ANALYSIS' }));

        await markSessionForInsightsOnThumbsDown(THUMBS_DOWN, 'end-user');

        expect(hook).not.toHaveBeenCalled();
        expect(setSessionsInsightsAnalysisInBatch).not.toHaveBeenCalled();
    });

    it('does not mark and does not throw when the hook throws', async () => {
        useHook(new Error('hook failed'));

        await expect(markSessionForInsightsOnThumbsDown(THUMBS_DOWN, 'admin')).resolves.toBeUndefined();

        expect(setSessionsInsightsAnalysisInBatch).not.toHaveBeenCalled();
    });

    it('does not throw when the mark throws', async () => {
        useHook(true);
        setSessionsInsightsAnalysisInBatch.mockRejectedValue(new Error('ddb down'));

        await expect(markSessionForInsightsOnThumbsDown(THUMBS_DOWN, 'admin')).resolves.toBeUndefined();

        expect(console.error).toHaveBeenCalledWith('[SESSION-QUALITY] thumbs-down mark failed', expect.any(Error));
    });

    it('does not throw when the session read throws', async () => {
        useHook(true);
        getChatSessionByUserIdAndSessionId.mockRejectedValue(new Error('read failed'));

        await expect(markSessionForInsightsOnThumbsDown(THUMBS_DOWN, 'admin')).resolves.toBeUndefined();
    });
});

describe('addChatSessionFeedback wiring', () => {
    it('end-user path saves the feedback and passes source end-user', async () => {
        const hook = useHook(true);

        const result = await addEndUserFeedback(THUMBS_DOWN, 'u1');

        expect(addFeedback).toHaveBeenCalledWith(result);
        expect(hook).toHaveBeenCalledWith(expect.objectContaining({ source: 'end-user' }));
        expect(setSessionsInsightsAnalysisInBatch).toHaveBeenCalledTimes(1);
    });

    it('admin path saves the feedback and passes source admin', async () => {
        const hook = useHook(true);

        const result = await addAdminFeedback(THUMBS_DOWN);

        expect(addFeedback).toHaveBeenCalledWith(result);
        expect(hook).toHaveBeenCalledWith(expect.objectContaining({ source: 'admin' }));
        expect(setSessionsInsightsAnalysisInBatch).toHaveBeenCalledTimes(1);
    });

    it('returns the feedback on both paths when the hook throws', async () => {
        useHook(new Error('hook failed'));

        await expect(addEndUserFeedback(THUMBS_DOWN, 'u1')).resolves.toEqual(expect.objectContaining({ sessionId: 's1', userId: 'u1' }));
        await expect(addAdminFeedback(THUMBS_DOWN)).resolves.toEqual(expect.objectContaining({ sessionId: 's1', userId: 'u1' }));
    });
});
