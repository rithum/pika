import { jest } from '@jest/globals';

jest.mock('../../src/lib/chat-ddb', () => ({ getChatSessionByUserIdAndSessionId: jest.fn() }));
jest.mock('../../src/lib/chat-admin-ddb', () => ({ setSessionsInsightsAnalysisInBatch: jest.fn() }));

import { getSessionQualityHooks, isThumbsDownHookOverridden, safeHook, safeHookSync } from '../../src/lib/session-quality';
import { defaultSessionQualityHooks } from '../../src/lib/session-quality-base';
import { sessionQualityHooks, resetSessionQualityHooks } from '../setup/default-session-quality-hooks';

const ASSESSMENTS = { critical_issues_present: false, requires_followup: false, escalation_needed: false } as never;

afterEach(() => {
    resetSessionQualityHooks();
    jest.restoreAllMocks();
});

describe('defaults', () => {
    it('keeps the sweep enabled with no floor, allowlist, notification or thumbs-down marking', async () => {
        const hooks = getSessionQualityHooks();

        expect(await hooks.isSweepEnabled()).toBe(true);
        expect(await hooks.getSweepStartFloor()).toBeUndefined();
        expect(await hooks.getChatAppAllowlist()).toBeUndefined();
        expect(await hooks.buildFlaggedSessionNotification({} as never)).toBeUndefined();
        expect(await hooks.shouldMarkForInsightsOnThumbsDown({} as never)).toBe(false);
        expect(hooks.toolFailureBodySentinel).toBeUndefined();
        expect(isThumbsDownHookOverridden()).toBe(false);
    });

    it('treats critical issues, follow-up and escalation as employee follow-up', () => {
        const { requiresEmployeeFollowup } = getSessionQualityHooks();

        expect(requiresEmployeeFollowup(ASSESSMENTS)).toBe(false);
        expect(requiresEmployeeFollowup({ critical_issues_present: true } as never)).toBe(true);
        expect(requiresEmployeeFollowup({ requires_followup: true } as never)).toBe(true);
        expect(requiresEmployeeFollowup({ escalation_needed: true } as never)).toBe(true);
    });
});

describe('getSessionQualityHooks', () => {
    it('sees an override set on the module the source reads', () => {
        const isSweepEnabled = async () => false;
        Object.assign(sessionQualityHooks, { isSweepEnabled });

        expect(getSessionQualityHooks().isSweepEnabled).toBe(isSweepEnabled);
    });

    it('merges a partial override over the defaults', async () => {
        Object.assign(sessionQualityHooks, { getSweepStartFloor: async () => '2026-01-01T00:00:00.000Z' });

        const hooks = getSessionQualityHooks();

        expect(await hooks.getSweepStartFloor()).toBe('2026-01-01T00:00:00.000Z');
        expect(hooks.isSweepEnabled).toBe(defaultSessionQualityHooks.isSweepEnabled);
    });

    it('skips keys whose value is undefined', () => {
        Object.assign(sessionQualityHooks, { isSweepEnabled: undefined });

        expect(getSessionQualityHooks().isSweepEnabled).toBe(defaultSessionQualityHooks.isSweepEnabled);
    });

    it('keeps an explicit undefined toolFailureBodySentinel override', () => {
        Object.assign(sessionQualityHooks, { toolFailureBodySentinel: undefined });

        expect(Object.prototype.hasOwnProperty.call(getSessionQualityHooks(), 'toolFailureBodySentinel')).toBe(true);
        expect(getSessionQualityHooks().toolFailureBodySentinel).toBeUndefined();
    });

    it('resolves overrides at call time, not import time', () => {
        expect(getSessionQualityHooks().toolFailureBodySentinel).toBeUndefined();

        Object.assign(sessionQualityHooks, { toolFailureBodySentinel: 'TOOL_FAILED' });

        expect(getSessionQualityHooks().toolFailureBodySentinel).toBe('TOOL_FAILED');
    });

    it('reports the thumbs-down hook as overridden only when it is a function', () => {
        expect(isThumbsDownHookOverridden()).toBe(false);

        Object.assign(sessionQualityHooks, { shouldMarkForInsightsOnThumbsDown: async () => true });

        expect(isThumbsDownHookOverridden()).toBe(true);
    });
});

describe('safeHook', () => {
    it('returns the hook result', async () => {
        expect(await safeHook('h', async () => 'value', 'fallback')).toBe('value');
    });

    it('returns the fallback and logs when the hook throws', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(
            await safeHook(
                'myHook',
                async () => {
                    throw new Error('boom');
                },
                'fallback'
            )
        ).toBe('fallback');
        expect(error).toHaveBeenCalledWith('[SESSION-QUALITY] myHook threw', expect.any(Error));
    });
});

describe('safeHookSync', () => {
    it('returns the hook result', () => {
        expect(safeHookSync('h', () => 1, 2)).toBe(1);
    });

    it('returns the fallback and logs when the hook throws', () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(
            safeHookSync(
                'myHook',
                () => {
                    throw new Error('boom');
                },
                2
            )
        ).toBe(2);
        expect(error).toHaveBeenCalledWith('[SESSION-QUALITY] myHook threw', expect.any(Error));
    });
});
