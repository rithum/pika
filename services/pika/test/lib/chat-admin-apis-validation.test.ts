import { validateChatAppOverride } from '../../src/lib/chat-admin-apis';

describe('validateChatAppOverride - additionalExternalAccessControl format', () => {
    afterEach(() => {
        delete process.env.PIKA_ACCOUNT_ID_PATTERN;
        delete process.env.PIKA_ACCOUNT_ID_PATTERN_DESCRIPTION;
    });

    it('rejects ids that do not match the configured pattern in full', () => {
        process.env.PIKA_ACCOUNT_ID_PATTERN = '[0-9]{9}';
        const errors = validateChatAppOverride({
            enabled: true,
            additionalExternalAccessControl: ['12345', '0000000011', '000000001']
        });
        expect(errors.some((e) => e.includes('invalid account ids') && e.includes('12345') && e.includes('0000000011'))).toBe(true);
        expect(errors.join(' ')).not.toContain('000000001.');
    });

    it('accepts ids that match the configured pattern', () => {
        process.env.PIKA_ACCOUNT_ID_PATTERN = '[0-9]{9}';
        const errors = validateChatAppOverride({ enabled: true, additionalExternalAccessControl: ['000000001'] });
        expect(errors).toEqual([]);
    });

    it('does not check the format when no pattern is configured', () => {
        const errors = validateChatAppOverride({ enabled: true, additionalExternalAccessControl: ['12345'] });
        expect(errors).toEqual([]);
    });

    it('includes the configured description in the error', () => {
        process.env.PIKA_ACCOUNT_ID_PATTERN = '[0-9]{9}';
        process.env.PIKA_ACCOUNT_ID_PATTERN_DESCRIPTION = 'Account ids must be 9 digits.';
        const errors = validateChatAppOverride({ enabled: true, additionalExternalAccessControl: ['12345'] });
        expect(errors).toEqual(['additionalExternalAccessControl contains invalid account ids: 12345. Account ids must be 9 digits.']);
    });

    it('skips the format check and logs once when the pattern is not a valid regular expression', () => {
        process.env.PIKA_ACCOUNT_ID_PATTERN = '(';
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const first = validateChatAppOverride({ enabled: true, additionalExternalAccessControl: ['12345'] });
            const second = validateChatAppOverride({ enabled: true, additionalExternalAccessControl: ['12345'] });
            expect(first).toEqual([]);
            expect(second).toEqual([]);
            expect(errorSpy).toHaveBeenCalledTimes(1);
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('still rejects non-string entries before checking format', () => {
        const errors = validateChatAppOverride({
            enabled: true,
            additionalExternalAccessControl: [123 as unknown as string]
        });
        expect(errors).toContain('additionalExternalAccessControl must be an array of strings');
    });

    it('treats an empty list as valid (no accounts granted)', () => {
        const errors = validateChatAppOverride({ enabled: true, additionalExternalAccessControl: [] });
        expect(errors).toEqual([]);
    });
});

describe('validateChatAppOverride - userRoles format', () => {
    it('accepts the pika roles and custom well-formed roles', () => {
        const errors = validateChatAppOverride({
            enabled: true,
            userRoles: ['pika:content-admin', 'pika:site-admin', 'admin', 'support-agent', 'team:billing'] as any
        });
        expect(errors).toEqual([]);
    });

    it('rejects roles that are not well-formed identifiers', () => {
        const errors = validateChatAppOverride({ enabled: true, userRoles: ['', 'has space', 'semi;colon', ':leading-colon'] as any });
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Invalid userRoles');
        expect(errors[0]).toContain('""');
        expect(errors[0]).toContain('"has space"');
        expect(errors[0]).toContain('"semi;colon"');
    });

    it('rejects non-string entries', () => {
        const errors = validateChatAppOverride({ enabled: true, userRoles: [42, null] as any });
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Invalid userRoles');
    });

    it('rejects a role longer than 64 characters', () => {
        const errors = validateChatAppOverride({ enabled: true, userRoles: ['a'.repeat(65)] as any });
        expect(errors).toHaveLength(1);
    });
});

describe('validateChatAppOverride - homePageFilterRules user type shape', () => {
    it('returns an error instead of throwing when userTypes is not an array', () => {
        const errors = validateChatAppOverride({ enabled: true, homePageFilterRules: [{ userTypes: 5 }] } as any);
        expect(errors).toEqual(['homePageFilterRules userTypes and chatAppUserTypes must be arrays']);
    });

    it('returns an error instead of throwing when chatAppUserTypes is a string', () => {
        const errors = validateChatAppOverride({ enabled: true, homePageFilterRules: [{ chatAppUserTypes: 'internal-user' }] } as any);
        expect(errors).toEqual(['homePageFilterRules userTypes and chatAppUserTypes must be arrays']);
    });
});
