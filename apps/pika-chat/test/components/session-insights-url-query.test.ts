import { describe, expect, it } from 'vitest';

import { readSessionInsightsQueryFromSearch } from '$lib/client/features/site-admin/components/session-insights/utils';

describe('readSessionInsightsQueryFromSearch', () => {
    it('reads query=', () => {
        expect(readSessionInsightsQueryFromSearch('?query=019f6ca0-9b39-7760-9abb-b54428043b66')).toBe(
            '019f6ca0-9b39-7760-9abb-b54428043b66'
        );
    });

    it('reads q= and sessionId= as aliases', () => {
        expect(readSessionInsightsQueryFromSearch('q=abc123')).toBe('abc123');
        expect(readSessionInsightsQueryFromSearch('?sessionId=abc123')).toBe('abc123');
    });

    it('prefers query over q and sessionId', () => {
        expect(readSessionInsightsQueryFromSearch('?q=nope&sessionId=nope&query=yes-it-is')).toBe('yes-it-is');
    });

    it('rejects short or empty values', () => {
        expect(readSessionInsightsQueryFromSearch('')).toBeUndefined();
        expect(readSessionInsightsQueryFromSearch('?query=ab')).toBeUndefined();
        expect(readSessionInsightsQueryFromSearch('?query=%20%20')).toBeUndefined();
    });
});
