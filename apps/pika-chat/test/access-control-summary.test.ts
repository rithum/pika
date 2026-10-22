import { describe, expect, it } from '@jest/globals';
import { resolveAccessControlConfig } from '$lib/client/features/site-admin/components/chat-apps/access-control/access-control-config';
import {
    evaluateGeneralAccessForPopulation,
    evaluateHomeTileForPopulation,
    populationHasAccess,
    summarizeAccessControl,
    summarizeHomeTileVisibility,
    validateAccessControl
} from '$lib/client/features/site-admin/components/chat-apps/access-control/access-control-summary';

const CONFIG = resolveAccessControlConfig({
    roleLabels: { partner: 'Partner (account type)', vendor: 'Vendor (account type)', 'support-agent': 'Support agent' },
    internalUsersLabel: 'All internal staff'
});

function summarize(input: Parameters<typeof summarizeAccessControl>[0]) {
    return summarizeAccessControl(input, 'accounts', CONFIG);
}

function lineTexts(summary: ReturnType<typeof summarizeAccessControl>): string[] {
    return summary.lines.map((l) => l.text);
}

describe('summarizeAccessControl', () => {
    it('renders the real internal-or-partner config accurately (internal-user OR partner role)', () => {
        const summary = summarize({
            enabled: true,
            userTypes: ['internal-user'],
            userRoles: ['partner'],
            applyRulesAs: 'or'
        });

        expect(summary.grantsAnyAccess).toBe(true);
        expect(lineTexts(summary)).toEqual(['All internal staff', 'External users with role: Partner (account type)']);
        expect(summary.warnings).toEqual([]);
    });

    it('reports disabled apps as accessible to nobody, regardless of other fields', () => {
        const summary = summarize({
            enabled: false,
            userTypes: ['internal-user', 'external-user'],
            userRoles: ['partner']
        });

        expect(summary.grantsAnyAccess).toBe(false);
        expect(lineTexts(summary)).toEqual(['Disabled — nobody can access this chat app.']);
    });

    it('treats undefined input the same as disabled (no override configured yet)', () => {
        const summary = summarize(undefined);
        expect(summary.grantsAnyAccess).toBe(false);
        expect(summary.lines[0].tone).toBe('danger');
    });

    it('exclusive user ID list wins outright and ignores every other field', () => {
        const summary = summarize({
            enabled: true,
            exclusiveUserIdAccessControl: ['user-1', 'user-2'],
            userTypes: ['internal-user'],
            userRoles: ['partner'],
            exclusiveExternalAccessControl: ['000000042']
        });

        expect(summary.grantsAnyAccess).toBe(true);
        expect(summary.lines).toHaveLength(1);
        expect(summary.lines[0].text).toContain('PILOT MODE');
        expect(summary.lines[0].text).toContain('user-1, user-2');
        expect(summary.lines[0].tone).toBe('warning');
    });

    it('describes an external exclusive-accounts restriction as overriding the role rules, with a warning', () => {
        const summary = summarize({
            enabled: true,
            userTypes: ['internal-user', 'external-user'],
            userRoles: ['partner'],
            applyRulesAs: 'or',
            exclusiveExternalAccessControl: ['000000042', '000000099']
        });

        expect(lineTexts(summary).some((t) => t.includes('PILOT MODE for external users'))).toBe(true);
        expect(lineTexts(summary).some((t) => t === 'All internal staff')).toBe(true);
        expect(summary.warnings.some((w) => w.includes('ignored for external users'))).toBe(true);
    });

    it('describes additionalExternalAccessControl as an always-on additive grant', () => {
        const summary = summarize({
            enabled: true,
            userTypes: ['internal-user'],
            additionalExternalAccessControl: ['000000042']
        });

        expect(lineTexts(summary)).toEqual(['All internal staff', 'Plus account 000000042 (always allowed for external users, regardless of the rules above)']);
    });

    it('warns when additional accounts are combined with an external exclusive restriction', () => {
        const summary = summarize({
            enabled: true,
            exclusiveExternalAccessControl: ['000000042'],
            additionalExternalAccessControl: ['000000099']
        });

        expect(summary.warnings.some((w) => w.includes('always grants access even for accounts not on the external-accounts restriction list'))).toBe(true);
    });

    it('flags the OR-with-roles-but-no-types trap that grants access to everyone', () => {
        const summary = summarize({
            enabled: true,
            userRoles: ['partner'],
            applyRulesAs: 'or'
        });

        expect(lineTexts(summary)).toEqual(['All internal staff', 'All external users']);
        expect(summary.warnings.some((w) => w.includes('grants access to EVERYONE'))).toBe(true);
    });

    it('narrows correctly to role-only access when the same fields use AND instead (no type configured)', () => {
        const summary = summarize({
            enabled: true,
            userRoles: ['partner'],
            applyRulesAs: 'and'
        });

        expect(lineTexts(summary)).toEqual(['Internal users with role: Partner (account type)', 'External users with role: Partner (account type)']);
        expect(summary.warnings).toEqual([]);
    });

    it('describes a genuinely empty enabled config as granting nobody access', () => {
        const summary = summarize({ enabled: true });
        expect(summary.grantsAnyAccess).toBe(false);
        expect(lineTexts(summary)).toEqual(['No one — no user types, roles, or accounts are configured.']);
    });

    it('AND with both a user type and roles gates that population by role', () => {
        const summary = summarize({
            enabled: true,
            userTypes: ['external-user'],
            userRoles: ['partner', 'vendor'],
            applyRulesAs: 'and'
        });

        expect(lineTexts(summary)).toEqual(['External users with role: Partner (account type) or Vendor (account type)']);
    });

    it('describes support-agent as an external role granting access alongside internal users', () => {
        const summary = summarize({
            enabled: true,
            userTypes: ['internal-user'],
            userRoles: ['support-agent'],
            applyRulesAs: 'or'
        });

        expect(lineTexts(summary)).toEqual(['All internal staff', 'External users with role: Support agent']);
        expect(summary.warnings).toEqual([]);
    });
});

describe('summarizeAccessControl defaults', () => {
    it('uses the built-in internal label and raw role names when no config is given', () => {
        const summary = summarizeAccessControl({ enabled: true, userTypes: ['internal-user'], userRoles: ['partner'], applyRulesAs: 'or' });
        expect(lineTexts(summary)).toEqual(['All internal users', 'External users with role: partner']);
    });

    it('uses a configured internalUsersLabel', () => {
        const summary = summarize({ enabled: true, userTypes: ['internal-user'] });
        expect(lineTexts(summary)).toEqual(['All internal staff']);
    });
});

describe('evaluateGeneralAccessForPopulation', () => {
    it('denies a population explicitly excluded from userTypes under AND, even with matching roles configured', () => {
        const result = evaluateGeneralAccessForPopulation('internal-user', ['external-user'], ['partner'], 'and');
        expect(result).toEqual({ access: 'none' });
    });

    it('still grants a population via role match under OR, even when userTypes excludes it', () => {
        const result = evaluateGeneralAccessForPopulation('internal-user', ['external-user'], ['partner'], 'or');
        expect(result).toEqual({ access: 'role-gated', roles: ['partner'] });
    });

    it('grants everyone when only userTypes is set and the population matches (roles absent)', () => {
        const result = evaluateGeneralAccessForPopulation('external-user', ['external-user'], undefined, 'and');
        expect(result).toEqual({ access: 'all' });
    });

    it('denies access entirely when neither userTypes nor userRoles are configured', () => {
        const result = evaluateGeneralAccessForPopulation('external-user', undefined, undefined, 'and');
        expect(result).toEqual({ access: 'none' });
    });
});

describe('validateAccessControl', () => {
    it('never blocks a disabled app', () => {
        expect(validateAccessControl({ enabled: false })).toEqual({ errors: [], warnings: [] });
    });

    it('never blocks the real internal-or-partner config', () => {
        expect(
            validateAccessControl({
                enabled: true,
                userTypes: ['internal-user'],
                userRoles: ['partner'],
                applyRulesAs: 'or'
            })
        ).toEqual({ errors: [], warnings: [] });
    });

    it('never blocks a pilot-mode exclusive account restriction with no general rules configured', () => {
        const result = validateAccessControl({
            enabled: true,
            exclusiveExternalAccessControl: ['000000042']
        });
        expect(result.errors).toEqual([]);
    });

    it('blocks only the genuinely broken case: enabled with no possible grant path', () => {
        const result = validateAccessControl({ enabled: true });
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('no one will be able to access it');
    });

    it('surfaces the exclusive+additional combination as a warning, not an error', () => {
        const result = validateAccessControl({
            enabled: true,
            exclusiveExternalAccessControl: ['000000042'],
            additionalExternalAccessControl: ['000000099']
        });
        expect(result.errors).toEqual([]);
        expect(result.warnings.length).toBeGreaterThan(0);
    });
});

// External users may only see apps typed external.
const EXTERNAL_TYPED_ONLY_TILE_RULES = [
    { userTypes: ['internal-user' as const], chatAppUserTypes: ['internal-user' as const, 'external-user' as const] },
    { userTypes: ['external-user' as const], chatAppUserTypes: ['external-user' as const] }
];

// Both populations may see the app regardless of its type declaration.
const BOTH_POPULATIONS_TILE_RULES = [
    { userTypes: ['internal-user' as const], chatAppUserTypes: ['internal-user' as const, 'external-user' as const] },
    { userTypes: ['external-user' as const], chatAppUserTypes: ['internal-user' as const, 'external-user' as const] }
];

const INTERNAL_OR_PARTNER = {
    enabled: true,
    userTypes: ['internal-user' as const],
    userRoles: ['partner' as const],
    applyRulesAs: 'or' as const,
    additionalExternalAccessControl: ['000000084']
};

describe('evaluateHomeTileForPopulation', () => {
    it('hides the tile from external users: app typed internal-only hides the tile from external users', () => {
        expect(evaluateHomeTileForPopulation('internal-user', ['internal-user'], EXTERNAL_TYPED_ONLY_TILE_RULES)).toBe(true);
        expect(evaluateHomeTileForPopulation('external-user', ['internal-user'], EXTERNAL_TYPED_ONLY_TILE_RULES)).toBe(false);
    });

    it('rules covering both populations show the tile to both populations', () => {
        expect(evaluateHomeTileForPopulation('internal-user', ['internal-user'], BOTH_POPULATIONS_TILE_RULES)).toBe(true);
        expect(evaluateHomeTileForPopulation('external-user', ['internal-user'], BOTH_POPULATIONS_TILE_RULES)).toBe(true);
    });

    it('empty rules hide the tile from everyone', () => {
        expect(evaluateHomeTileForPopulation('external-user', ['internal-user', 'external-user'], [])).toBe(false);
    });

    it('mirrors the server quirk: the LAST matching rule wins', () => {
        const rules = [
            { userTypes: ['external-user' as const], chatAppUserTypes: ['external-user' as const] },
            { userTypes: ['external-user' as const], chatAppUserTypes: ['internal-user' as const] }
        ];
        expect(evaluateHomeTileForPopulation('external-user', ['external-user'], rules)).toBe(false);
    });
});

describe('populationHasAccess', () => {
    it('internal-or-partner config: both populations have access', () => {
        expect(populationHasAccess(INTERNAL_OR_PARTNER, 'internal-user')).toBe(true);
        expect(populationHasAccess(INTERNAL_OR_PARTNER, 'external-user')).toBe(true);
    });

    it('grant list alone gives external access', () => {
        expect(populationHasAccess({ enabled: true, additionalExternalAccessControl: ['000000042'] }, 'external-user')).toBe(true);
        expect(populationHasAccess({ enabled: true, additionalExternalAccessControl: ['000000042'] }, 'internal-user')).toBe(false);
    });

    it('empty config means no access for anyone', () => {
        expect(populationHasAccess({ enabled: true }, 'internal-user')).toBe(false);
        expect(populationHasAccess({ enabled: true }, 'external-user')).toBe(false);
    });
});

describe('summarizeHomeTileVisibility', () => {
    it('warns when external users have access but no tile', () => {
        const result = summarizeHomeTileVisibility(
            { ...INTERNAL_OR_PARTNER, homePageFilterRules: EXTERNAL_TYPED_ONLY_TILE_RULES },
            ['internal-user'],
            undefined
        );
        expect(result.externalVisible).toBe(false);
        expect(result.warnings.some((w) => /External users have chat access but will NOT see the home-page tile/.test(w))).toBe(true);
    });

    it('no warnings when both populations can see the tile', () => {
        const result = summarizeHomeTileVisibility({ ...INTERNAL_OR_PARTNER, homePageFilterRules: BOTH_POPULATIONS_TILE_RULES }, ['internal-user'], undefined);
        expect(result.internalVisible).toBe(true);
        expect(result.externalVisible).toBe(true);
        expect(result.warnings).toEqual([]);
    });

    it('does not warn about populations that lack access anyway', () => {
        const internalOnly = { enabled: true, userTypes: ['internal-user' as const] };
        const result = summarizeHomeTileVisibility(
            { ...internalOnly, homePageFilterRules: [{ userTypes: ['internal-user' as const], chatAppUserTypes: ['internal-user' as const] }] },
            ['internal-user'],
            undefined
        );
        expect(result.externalVisible).toBe(false);
        expect(result.warnings).toEqual([]);
    });

    it('falls back to site rules when the override has none, and reports site defaults when unknown', () => {
        const withSiteRules = summarizeHomeTileVisibility(INTERNAL_OR_PARTNER, ['internal-user'], BOTH_POPULATIONS_TILE_RULES);
        expect(withSiteRules.externalVisible).toBe(true);

        const unknown = summarizeHomeTileVisibility(INTERNAL_OR_PARTNER, ['internal-user'], undefined);
        expect(unknown.internalVisible).toBeUndefined();
        expect(unknown.lines[0].text).toMatch(/site default rules/);
    });
});
