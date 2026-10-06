import { validateChatAppOverride } from '../../src/lib/chat-admin-apis';

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
