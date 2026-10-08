import { describe, it, expect } from '@jest/globals';
import { getOverridableFeatures } from 'pika-shared/util/server-utils';

const user = { userId: 'u1', firstName: 'A', lastName: 'B', userType: 'internal-user', roles: [], features: {} } as any;

function chatAppWith(features: Record<string, unknown>) {
    return { chatAppId: 'app1', title: 't', agentId: 'a', enabled: true, features } as any;
}

describe('suggestions.expandedByDefault', () => {
    const siteFeatures = { suggestions: { enabled: true, suggestions: [] } } as any;

    it('passes true through', () => {
        const chatApp = chatAppWith({ suggestions: { featureId: 'suggestions', enabled: true, suggestions: ['x'], expandedByDefault: true } });
        const result = getOverridableFeatures(siteFeatures, chatApp, user);
        expect(result.suggestions.expandedByDefault).toBe(true);
    });

    it('defaults to false when unset', () => {
        const chatApp = chatAppWith({ suggestions: { featureId: 'suggestions', enabled: true, suggestions: ['x'] } });
        const result = getOverridableFeatures(siteFeatures, chatApp, user);
        expect(result.suggestions.expandedByDefault).toBe(false);
    });
});

describe('promptInputFieldPlaceholder', () => {
    it('uses the app value when site-enabled', () => {
        const chatApp = chatAppWith({
            promptInputFieldPlaceholder: { featureId: 'promptInputFieldPlaceholder', enabled: true, promptInputFieldPlaceholder: 'Type here' }
        });
        const result = getOverridableFeatures({ promptInputFieldPlaceholder: { enabled: true } } as any, chatApp, user);
        expect(result.promptInputFieldPlaceholder.placeholder).toBe('Type here');
    });

    it('falls back to the default when the app enables it without a value', () => {
        const chatApp = chatAppWith({ promptInputFieldPlaceholder: { featureId: 'promptInputFieldPlaceholder', enabled: true } });
        const result = getOverridableFeatures({ promptInputFieldPlaceholder: { enabled: true } } as any, chatApp, user);
        expect(result.promptInputFieldPlaceholder.placeholder).toBe('Ask me a question');
    });

    it('falls back to the default when nothing is configured', () => {
        const result = getOverridableFeatures({} as any, chatAppWith({}), user);
        expect(result.promptInputFieldPlaceholder.placeholder).toBe('Ask me a question');
    });

    it('is undefined when the site disables it', () => {
        const result = getOverridableFeatures({ promptInputFieldPlaceholder: { enabled: false } } as any, chatAppWith({}), user);
        expect(result.promptInputFieldPlaceholder.placeholder).toBeUndefined();
    });
});

describe('assistantPrivacyNotice', () => {
    it('has no notice when nothing is configured', () => {
        const result = getOverridableFeatures({} as any, chatAppWith({}), user);
        expect(result.assistantPrivacyNotice.notice).toBeUndefined();
    });

    it('uses the app notice when site-enabled', () => {
        const chatApp = chatAppWith({
            assistantPrivacyNotice: { featureId: 'assistantPrivacyNotice', enabled: true, assistantPrivacyNotice: 'Only you can see this.' }
        });
        const result = getOverridableFeatures({ assistantPrivacyNotice: { enabled: true } } as any, chatApp, user);
        expect(result.assistantPrivacyNotice.notice).toBe('Only you can see this.');
    });
});
