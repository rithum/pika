import type { ChatSession, RecordOrUndef, SessionInsightScoring } from 'pika-shared/types/chatbot/chatbot-types';
import type { SnakeCase } from 'pika-shared/util/chatbot-shared-utils';

export interface ThumbsDownContext {
    userId: string;
    sessionId: string;
    chatAppId?: string;
    sessionAttributes?: Record<string, unknown>;
    source: 'end-user' | 'admin';
}

export interface FlaggedSessionEvent {
    session: ChatSession<RecordOrUndef>;
    scoring: SnakeCase<SessionInsightScoring>;
    urgent: string[];
    notes: string[];
}

export interface PendingNotification {
    send(): Promise<void>;
}

export interface SessionQualityHooks {
    isSweepEnabled(): Promise<boolean>;
    /** ISO date; the sweep skips sessions last active before it. undefined = use pika's default floor. */
    getSweepStartFloor(): Promise<string | undefined>;
    /** undefined = every chat app; an empty set = evaluate nothing. */
    getChatAppAllowlist(): Promise<Set<string> | undefined>;
    requiresEmployeeFollowup(assessments: SnakeCase<SessionInsightScoring>['assessments']): boolean;
    buildFlaggedSessionNotification(event: FlaggedSessionEvent): Promise<PendingNotification | undefined>;
    shouldMarkForInsightsOnThumbsDown(ctx: ThumbsDownContext): Promise<boolean>;
    toolFailureBodySentinel: string | undefined;
}

export const defaultSessionQualityHooks: SessionQualityHooks = {
    isSweepEnabled: async () => true,
    getSweepStartFloor: async () => undefined,
    getChatAppAllowlist: async () => undefined,
    requiresEmployeeFollowup: (a) => !!(a.critical_issues_present || a.requires_followup || a.escalation_needed),
    buildFlaggedSessionNotification: async () => undefined,
    shouldMarkForInsightsOnThumbsDown: async () => false,
    toolFailureBodySentinel: undefined
};
