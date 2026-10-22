import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
    accessControlConfigFromSiteFeatures,
    BUILTIN_PREDEFINED_ROLES,
    BUILTIN_ROLE_LABELS,
    describeRole,
    resolveAccessControlConfig
} from '$lib/client/features/site-admin/components/chat-apps/access-control/access-control-config';

describe('resolveAccessControlConfig', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('with no config yields exactly the built-in labels, roles and internal label', () => {
        const config = resolveAccessControlConfig(undefined);
        expect(config.roleLabels).toEqual({ 'pika:content-admin': 'Content Admin', 'pika:site-admin': 'Site Admin' });
        expect(config.predefinedRoles).toEqual(['pika:content-admin', 'pika:site-admin']);
        expect(config.internalUsersLabel).toBe('All internal users');
        expect(config.accountIdRegex).toBeUndefined();
        expect(config.accountIdPatternDescription).toBeUndefined();
    });

    it('merges configured labels over the built-ins', () => {
        const config = resolveAccessControlConfig({ roleLabels: { partner: 'Partner', 'pika:site-admin': 'Administrator' } });
        expect(config.roleLabels).toEqual({ 'pika:content-admin': 'Content Admin', 'pika:site-admin': 'Administrator', partner: 'Partner' });
    });

    it('appends configured roles after the built-ins without duplicates', () => {
        const config = resolveAccessControlConfig({ predefinedRoles: ['partner', 'pika:site-admin', 'vendor', 'partner'] });
        expect(config.predefinedRoles).toEqual(['pika:content-admin', 'pika:site-admin', 'partner', 'vendor']);
    });

    it('uses a configured internal users label', () => {
        expect(resolveAccessControlConfig({ internalUsersLabel: 'All staff' }).internalUsersLabel).toBe('All staff');
    });

    it('drops an invalid pattern with a warning', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const config = resolveAccessControlConfig({ accountIdPattern: '(' });
        expect(config.accountIdRegex).toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('anchors the pattern so a longer value does not match', () => {
        const regex = resolveAccessControlConfig({ accountIdPattern: '[0-9]{9}' }).accountIdRegex;
        expect(regex?.test('123456789')).toBe(true);
        expect(regex?.test('1234567890')).toBe(false);
    });

    it('does not mutate the built-ins', () => {
        resolveAccessControlConfig({ roleLabels: { partner: 'Partner' }, predefinedRoles: ['partner'] });
        expect(Object.keys(BUILTIN_ROLE_LABELS)).toHaveLength(2);
        expect(BUILTIN_PREDEFINED_ROLES).toHaveLength(2);
    });
});

describe('accessControlConfigFromSiteFeatures', () => {
    it('reads siteAdmin.accessControl and tolerates missing site features', () => {
        expect(accessControlConfigFromSiteFeatures(undefined).internalUsersLabel).toBe('All internal users');
        const config = accessControlConfigFromSiteFeatures({ siteAdmin: { accessControl: { internalUsersLabel: 'Staff' } } } as Parameters<
            typeof accessControlConfigFromSiteFeatures
        >[0]);
        expect(config.internalUsersLabel).toBe('Staff');
    });
});

describe('describeRole', () => {
    it('falls back to the raw role name', () => {
        expect(describeRole('pika:site-admin')).toBe('Site Admin');
        expect(describeRole('partner')).toBe('partner');
        expect(describeRole('partner', { partner: 'Partner' })).toBe('Partner');
    });
});
