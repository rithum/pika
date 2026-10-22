import { getMatchingChatApps, withSessionRoles } from '../../src/lib/get-matching-chat-apps';
import type { ChatApp, ChatAppOverride, ChatUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

const ENTITY_PATH = 'accountId';

function makeUser(overrides: Partial<ChatUser<RecordOrUndef>> = {}): ChatUser<RecordOrUndef> {
    return {
        userId: 'user-1',
        firstName: 'Test',
        lastName: 'User',
        userType: 'external-user',
        features: {},
        customData: { accountId: '000000001' },
        ...overrides
    } as ChatUser<RecordOrUndef>;
}

function makeChatApp(override: Partial<ChatAppOverride> | undefined): ChatApp {
    return {
        chatAppId: 'test-app',
        title: 'Test App',
        agentId: 'agent-1',
        enabled: true,
        userTypes: ['internal-user', 'external-user'],
        features: {},
        override: override
            ? ({
                  chatAppId: 'test-app:override',
                  enabled: true,
                  ...override
              } as ChatAppOverride)
            : undefined
    } as unknown as ChatApp;
}

function userHasAccess(user: ChatUser<RecordOrUndef>, override: Partial<ChatAppOverride>): boolean {
    const apps = getMatchingChatApps(user, false, [], [makeChatApp(override)], ENTITY_PATH);
    return apps.length === 1;
}

const partnerGateRules: Partial<ChatAppOverride> = {
    userTypes: ['internal-user'],
    userRoles: ['partner'],
    applyRulesAs: 'or'
};

describe('additionalExternalAccessControl (additive grant list)', () => {
    it('allows an external user whose account is on the additional list even when general rules would deny', () => {
        const vendor = makeUser({ roles: ['vendor'], customData: { accountId: '000000042' } });
        const allowed = userHasAccess(vendor, {
            ...partnerGateRules,
            additionalExternalAccessControl: ['000000042']
        });
        expect(allowed).toBe(true);
    });

    it('does not deny external users who are not on the list - they fall through to general rules', () => {
        const partner = makeUser({ roles: ['partner'], customData: { accountId: '000000001' } });
        const allowed = userHasAccess(partner, {
            ...partnerGateRules,
            additionalExternalAccessControl: ['000000042']
        });
        expect(allowed).toBe(true);
    });

    it('still denies external users who neither match the list nor the general rules', () => {
        const vendor = makeUser({ roles: ['vendor'], customData: { accountId: '000000099' } });
        const allowed = userHasAccess(vendor, {
            ...partnerGateRules,
            additionalExternalAccessControl: ['000000042']
        });
        expect(allowed).toBe(false);
    });

    it('does not apply to internal users (they are governed by the other rules)', () => {
        const internal = makeUser({ userType: 'internal-user', customData: { accountId: '000000042' } });
        const allowed = userHasAccess(internal, {
            userTypes: ['internal-user'],
            additionalExternalAccessControl: ['000000042']
        });
        expect(allowed).toBe(true);
    });

    it('grants access alongside a configured exclusive external list (union of both lists)', () => {
        const bothLists: Partial<ChatAppOverride> = {
            exclusiveExternalAccessControl: ['000000001'],
            additionalExternalAccessControl: ['000000042']
        };

        const grantedVendor = makeUser({ roles: ['vendor'], customData: { accountId: '000000042' } });
        expect(userHasAccess(grantedVendor, bothLists)).toBe(true);

        const exclusiveListed = makeUser({ customData: { accountId: '000000001' } });
        expect(userHasAccess(exclusiveListed, bothLists)).toBe(true);

        const unlisted = makeUser({ customData: { accountId: '000000099' } });
        expect(userHasAccess(unlisted, bothLists)).toBe(false);
    });

    it('is ignored when exclusiveUserIdAccessControl is set - the user ID list takes precedence over everything', () => {
        const grantedButNotPinned = makeUser({ userId: 'user-2', customData: { accountId: '000000042' } });
        const allowed = userHasAccess(grantedButNotPinned, {
            userTypes: ['internal-user', 'external-user'],
            exclusiveUserIdAccessControl: ['some-other-user'],
            additionalExternalAccessControl: ['000000042']
        });
        expect(allowed).toBe(false);
    });

    it('does not grant access when the app override is disabled', () => {
        const vendor = makeUser({ roles: ['vendor'], customData: { accountId: '000000042' } });
        const allowed = userHasAccess(vendor, {
            enabled: false,
            ...partnerGateRules,
            additionalExternalAccessControl: ['000000042']
        });
        expect(allowed).toBe(false);
    });

    it('an empty list changes nothing', () => {
        const vendor = makeUser({ roles: ['vendor'], customData: { accountId: '000000042' } });
        const allowed = userHasAccess(vendor, {
            ...partnerGateRules,
            additionalExternalAccessControl: []
        });
        expect(allowed).toBe(false);
    });
});

describe('exclusiveExternalAccessControl regression (semantics unchanged)', () => {
    it('still exclusively denies external users not on the exclusive list, even with permissive userTypes', () => {
        const external = makeUser({ customData: { accountId: '000000099' } });
        const allowed = userHasAccess(external, {
            userTypes: ['internal-user', 'external-user'],
            exclusiveExternalAccessControl: ['000000001']
        });
        expect(allowed).toBe(false);
    });

    it('still allows external users on the exclusive list', () => {
        const external = makeUser({ customData: { accountId: '000000001' } });
        const allowed = userHasAccess(external, {
            userTypes: ['internal-user', 'external-user'],
            exclusiveExternalAccessControl: ['000000001']
        });
        expect(allowed).toBe(true);
    });
});

describe('example-bot GA configuration regression', () => {
    it('allows external partners via role with OR rules', () => {
        const partner = makeUser({ roles: ['partner'] });
        expect(userHasAccess(partner, partnerGateRules)).toBe(true);
    });

    it('allows internal users via type with OR rules', () => {
        const internal = makeUser({ userType: 'internal-user', customData: {} });
        expect(userHasAccess(internal, partnerGateRules)).toBe(true);
    });

    it('denies external vendors with OR rules', () => {
        const vendor = makeUser({ roles: ['vendor'] });
        expect(userHasAccess(vendor, partnerGateRules)).toBe(false);
    });
});

describe('support-agent role on internal-only overrides', () => {
    const internalOnlyOrSupport: Partial<ChatAppOverride> = {
        userTypes: ['internal-user'],
        userRoles: ['support-agent'],
        applyRulesAs: 'or'
    };

    it('allows an external user delegated via tools (support-agent role present)', () => {
        const delegatedVendor = makeUser({ roles: ['vendor', 'support-agent'] });
        expect(userHasAccess(delegatedVendor, internalOnlyOrSupport)).toBe(true);
    });

    it('denies an external user without the support-agent role', () => {
        const vendor = makeUser({ roles: ['vendor'] });
        expect(userHasAccess(vendor, internalOnlyOrSupport)).toBe(false);
    });

    it('allows an internal user with no roles at all', () => {
        const internal = makeUser({ userType: 'internal-user', roles: undefined, customData: {} });
        expect(userHasAccess(internal, internalOnlyOrSupport)).toBe(true);
    });

    it('denies a delegated external user when the override requires ALL rules (AND)', () => {
        const delegatedVendor = makeUser({ roles: ['vendor', 'support-agent'] });
        const allInternalAndSupport: Partial<ChatAppOverride> = {
            ...internalOnlyOrSupport,
            applyRulesAs: 'and'
        };
        expect(userHasAccess(delegatedVendor, allInternalAndSupport)).toBe(false);
    });
});

describe('withSessionRoles - the session, not the stored record, decides roles for an access check', () => {
    const stored = makeUser({ roles: ['vendor'] });
    const internalOnlyOrSupport: Partial<ChatAppOverride> = {
        userTypes: ['internal-user'],
        userRoles: ['support-agent'],
        applyRulesAs: 'or'
    };

    it('replaces the stored roles with the session roles when they are a string array', () => {
        expect(withSessionRoles(stored, ['vendor', 'support-agent']).roles).toEqual(['vendor', 'support-agent']);
    });

    it('keeps the stored roles when the request carries no roles', () => {
        expect(withSessionRoles(stored, undefined).roles).toEqual(['vendor']);
    });

    it('keeps the stored roles when the request roles are malformed', () => {
        expect(withSessionRoles(stored, 'support-agent').roles).toEqual(['vendor']);
        expect(withSessionRoles(stored, [42, 'vendor']).roles).toEqual(['vendor']);
    });

    it('lets an empty session role list mean no roles', () => {
        expect(withSessionRoles(stored, []).roles).toEqual([]);
    });

    it('admits a delegated user whose role lives only on the session', () => {
        const evaluated = withSessionRoles(stored, ['vendor', 'support-agent']);
        expect(userHasAccess(stored, internalOnlyOrSupport)).toBe(false);
        expect(userHasAccess(evaluated, internalOnlyOrSupport)).toBe(true);
    });
});

describe('additionalExternalAccessControl without an entity path', () => {
    it('is ignored when customDataFieldPathToMatchUsersEntity is absent', () => {
        const vendor = makeUser({ roles: ['vendor'], customData: { accountId: '000000042' } });
        const apps = getMatchingChatApps(vendor, false, [], [makeChatApp({ ...partnerGateRules, additionalExternalAccessControl: ['000000042'] })], undefined);
        expect(apps).toHaveLength(0);
    });
});

describe('both-lists warning', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('warns when exclusiveUserIdAccessControl and additionalExternalAccessControl are both set', () => {
        userHasAccess(makeUser(), { exclusiveUserIdAccessControl: ['user-1'], additionalExternalAccessControl: ['000000042'] });
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain('Both exclusiveUserIdAccessControl and additionalExternalAccessControl are set');
    });

    it('does not warn when only one is set', () => {
        userHasAccess(makeUser(), { exclusiveUserIdAccessControl: ['user-1'] });
        userHasAccess(makeUser(), { additionalExternalAccessControl: ['000000042'] });
        expect(warnSpy).not.toHaveBeenCalled();
    });
});

describe('withSessionRoles with mixed and non-array input', () => {
    const stored = makeUser({ roles: ['vendor'] });

    it('keeps the stored roles for a mixed-type array', () => {
        expect(withSessionRoles(stored, ['support-agent', 7]).roles).toEqual(['vendor']);
    });

    it('keeps the stored roles for a non-array value', () => {
        expect(withSessionRoles(stored, { roles: ['support-agent'] }).roles).toEqual(['vendor']);
    });

    it('does not mutate the stored user', () => {
        withSessionRoles(stored, ['support-agent']);
        expect(stored.roles).toEqual(['vendor']);
    });
});

describe('session roles reach the access decision', () => {
    const storedAdmin = makeUser({ roles: ['admin'] });
    const requiresSupportAgent: Partial<ChatAppOverride> = { userTypes: ['internal-user'], userRoles: ['support-agent'], applyRulesAs: 'or' };

    it('returns the app when the request roles carry the required role', () => {
        const evaluated = withSessionRoles(storedAdmin, ['support-agent']);
        expect(userHasAccess(evaluated, requiresSupportAgent)).toBe(true);
    });

    it('does not return the app when only the stored role is used', () => {
        expect(userHasAccess(withSessionRoles(storedAdmin, undefined), requiresSupportAgent)).toBe(false);
    });
});
