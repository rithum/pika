import { INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS } from 'pika-shared/types/chatbot/chatbot-types';
import { getChatSessionByUserIdAndSessionId } from './chat-ddb';
import { setSessionsInsightsAnalysisInBatch } from './chat-admin-ddb';
import { sessionQualityHooks } from './custom/session-quality-hooks';
import { defaultSessionQualityHooks, type SessionQualityHooks, type ThumbsDownContext } from './session-quality-base';

export function getSessionQualityHooks(): SessionQualityHooks {
    const merged: SessionQualityHooks = { ...defaultSessionQualityHooks };
    for (const [k, v] of Object.entries(sessionQualityHooks)) {
        if (v !== undefined || k === 'toolFailureBodySentinel') {
            (merged as unknown as Record<string, unknown>)[k] = v;
        }
    }
    return merged;
}

export function isThumbsDownHookOverridden(): boolean {
    return typeof sessionQualityHooks.shouldMarkForInsightsOnThumbsDown === 'function';
}

export async function safeHook<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        console.error(`[SESSION-QUALITY] ${name} threw`, err);
        return fallback;
    }
}

export function safeHookSync<T>(name: string, fn: () => T, fallback: T): T {
    try {
        return fn();
    } catch (err) {
        console.error(`[SESSION-QUALITY] ${name} threw`, err);
        return fallback;
    }
}

export async function markSessionForInsightsOnThumbsDown(feedback: { type?: string; userId: string; sessionId: string }, source: 'end-user' | 'admin'): Promise<void> {
    try {
        if (feedback.type !== 'user_thumbs_down' || !isThumbsDownHookOverridden()) {
            return;
        }
        const { userId, sessionId } = feedback;
        const session = await getChatSessionByUserIdAndSessionId(userId, sessionId);
        if (!session || session.insightStatus === INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS) {
            return;
        }
        const ctx: ThumbsDownContext = { userId, sessionId, chatAppId: session.chatAppId, sessionAttributes: session.sessionAttributes as Record<string, unknown>, source };
        const hooks = getSessionQualityHooks();
        const shouldMark = await safeHook('shouldMarkForInsightsOnThumbsDown', () => hooks.shouldMarkForInsightsOnThumbsDown(ctx), false);
        if (!shouldMark) {
            return;
        }
        await setSessionsInsightsAnalysisInBatch([
            { userId, sessionId, insightStatus: INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS, lastAnalyzedMessageId: undefined, insightsS3Url: undefined }
        ]);
    } catch (err) {
        console.error('[SESSION-QUALITY] thumbs-down mark failed', err);
    }
}
