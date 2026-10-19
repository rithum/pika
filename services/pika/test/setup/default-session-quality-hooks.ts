import type { SessionQualityHooks } from '../../src/lib/session-quality-base';

export const sessionQualityHooks: Partial<SessionQualityHooks> = {};

export function resetSessionQualityHooks(): void {
    for (const k of Object.keys(sessionQualityHooks)) delete (sessionQualityHooks as Record<string, unknown>)[k];
}
