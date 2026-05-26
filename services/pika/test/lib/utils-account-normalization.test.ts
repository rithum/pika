import { convertChatSessionToCamelFromSnakeCase, getAccountBackfillAttributes, hasSessionAccountContext } from '../../src/lib/utils';

/** Minimal snake_case session for testing account-normalization logic only. */
function makeSession(sessionAttributes?: Record<string, unknown>): any {
    return {
        session_id: 'sess-1',
        user_id: 'user-1',
        agent_id: 'agent-1',
        chat_app_id: 'app-1',
        identity_id: 'id-1',
        invocation_mode: 'chat',
        create_date: '2024-01-01T00:00:00Z',
        last_update: '2024-01-01T00:00:00Z',
        entity_id: 'ent-1',
        ...(sessionAttributes !== undefined && { session_attributes: { user_id: 'user-1', chat_app_id: 'app-1', agent_id: 'agent-1', current_date: '2024-01-01', ...sessionAttributes } })
    };
}

describe('convertChatSessionToCamelFromSnakeCase — account ID normalization', () => {
    const originalEnv = process.env.PIKA_ACCOUNT_ID_FIELD_NAMES;

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.PIKA_ACCOUNT_ID_FIELD_NAMES;
        } else {
            process.env.PIKA_ACCOUNT_ID_FIELD_NAMES = originalEnv;
        }
    });

    describe('default field names (accountId, account_id)', () => {
        it('projects accountId string onto top-level', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ accountId: 'acc-123' }));
            expect((result as any).accountId).toBe('acc-123');
        });

        it('projects account_id string onto top-level', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ account_id: 'acc-456' }));
            expect((result as any).accountId).toBe('acc-456');
        });

        it('prefers accountId over account_id when both present', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ accountId: 'camel', account_id: 'snake' }));
            expect((result as any).accountId).toBe('camel');
        });

        it('stringifies a numeric accountId', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ accountId: 42 }));
            expect((result as any).accountId).toBe('42');
        });

        it('stringifies a numeric account_id', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ account_id: 99 }));
            expect((result as any).accountId).toBe('99');
        });

        it('does not project an empty string accountId', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ accountId: '' }));
            expect((result as any).accountId).toBeUndefined();
        });

        it('does not set accountId when no account fields are present', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ someOtherField: 'value' }));
            expect((result as any).accountId).toBeUndefined();
        });

        it('does not set accountId when session_attributes is absent', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession());
            expect((result as any).accountId).toBeUndefined();
        });
    });

    describe('nested account object fallback', () => {
        it('projects account.id when top-level fields are absent', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ account: { id: 'nested-id' } }));
            expect((result as any).accountId).toBe('nested-id');
        });

        it('projects account.accountId when top-level fields are absent', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ account: { accountId: 'nested-camel' } }));
            expect((result as any).accountId).toBe('nested-camel');
        });

        it('projects account.account_id when top-level fields are absent', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ account: { account_id: 'nested-snake' } }));
            expect((result as any).accountId).toBe('nested-snake');
        });

        it('stringifies a numeric account.id', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ account: { id: 7 } }));
            expect((result as any).accountId).toBe('7');
        });

        it('top-level accountId takes precedence over nested account.id', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ accountId: 'top', account: { id: 'nested' } }));
            expect((result as any).accountId).toBe('top');
        });

        it('does not project when account object has no id field', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ account: { name: 'Acme' } }));
            expect((result as any).accountId).toBeUndefined();
        });

        it('does not project when account is an array (not an object)', () => {
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ account: ['acc-1'] }));
            expect((result as any).accountId).toBeUndefined();
        });
    });

    describe('PIKA_ACCOUNT_ID_FIELD_NAMES env override', () => {
        it('uses a custom single field name', () => {
            process.env.PIKA_ACCOUNT_ID_FIELD_NAMES = 'retailerId';
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ retailerId: 'ret-789' }));
            expect((result as any).accountId).toBe('ret-789');
        });

        it('uses multiple custom field names in order', () => {
            process.env.PIKA_ACCOUNT_ID_FIELD_NAMES = 'supplierId,retailerId';
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ retailerId: 'ret-1', supplierId: 'sup-1' }));
            expect((result as any).accountId).toBe('sup-1');
        });

        it('ignores default field names when env override is set', () => {
            process.env.PIKA_ACCOUNT_ID_FIELD_NAMES = 'retailerId';
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ accountId: 'default-name', retailerId: 'custom-name' }));
            // custom field wins because accountId is not in the override list
            expect((result as any).accountId).toBe('custom-name');
        });

        it('trims whitespace around field names in env var', () => {
            process.env.PIKA_ACCOUNT_ID_FIELD_NAMES = ' retailerId , supplierId ';
            const result = convertChatSessionToCamelFromSnakeCase(makeSession({ supplierId: 'sup-2' }));
            expect((result as any).accountId).toBe('sup-2');
        });
    });
});

// ─── helpers for chat-apis tests ────────────────────────────────────────────

/** Minimal camelCase ChatSession for hasSessionAccountContext. */
function makeChatSession(overrides: Record<string, unknown> = {}, sessionAttributesOverrides?: Record<string, unknown>): any {
    const base: Record<string, unknown> = {
        sessionId: 'sess-1',
        userId: 'user-1',
        agentId: 'agent-1',
        chatAppId: 'app-1',
        identityId: 'id-1',
        invocationMode: 'chat',
        createDate: '2024-01-01T00:00:00Z',
        lastUpdate: '2024-01-01T00:00:00Z',
        entityId: 'ent-1',
        ...overrides
    };
    if (sessionAttributesOverrides !== undefined) {
        base.sessionAttributes = {
            userId: 'user-1',
            chatAppId: 'app-1',
            agentId: 'agent-1',
            currentDate: '2024-01-01',
            ...sessionAttributesOverrides
        };
    }
    return base;
}

// ─── hasSessionAccountContext ────────────────────────────────────────────────

describe('hasSessionAccountContext', () => {
    const originalEnv = process.env.PIKA_ACCOUNT_ID_FIELD_NAMES;

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.PIKA_ACCOUNT_ID_FIELD_NAMES;
        } else {
            process.env.PIKA_ACCOUNT_ID_FIELD_NAMES = originalEnv;
        }
    });

    describe('default field names (accountId, account_id)', () => {
        it('returns true when top-level accountId is set', () => {
            expect(hasSessionAccountContext(makeChatSession({ accountId: 'acc-1' }))).toBe(true);
        });

        it('returns true when top-level account_id is set', () => {
            expect(hasSessionAccountContext(makeChatSession({ account_id: 'acc-2' }))).toBe(true);
        });

        it('returns true when sessionAttributes.accountId is set', () => {
            expect(hasSessionAccountContext(makeChatSession({}, { accountId: 'attr-acc' }))).toBe(true);
        });

        it('returns true when sessionAttributes.account_id is set', () => {
            expect(hasSessionAccountContext(makeChatSession({}, { account_id: 'attr-acc' }))).toBe(true);
        });

        it('returns false when no account fields are present', () => {
            expect(hasSessionAccountContext(makeChatSession({}, { someField: 'value' }))).toBe(false);
        });

        it('returns false when session has no sessionAttributes', () => {
            expect(hasSessionAccountContext(makeChatSession())).toBe(false);
        });

        it('returns true via nested account.id fallback', () => {
            expect(hasSessionAccountContext(makeChatSession({}, { account: { id: 'nested-1' } }))).toBe(true);
        });
    });

    describe('legacy field names (retailerId, supplierId, etc.)', () => {
        it('returns true when top-level retailerId is set (default field names)', () => {
            // With default field names, retailerId is NOT included — should return false
            delete process.env.PIKA_ACCOUNT_ID_FIELD_NAMES;
            expect(hasSessionAccountContext(makeChatSession({ retailerId: 'ret-1' }))).toBe(false);
        });

        it('returns true when top-level retailerId is set with PIKA_ACCOUNT_ID_FIELD_NAMES override', () => {
            process.env.PIKA_ACCOUNT_ID_FIELD_NAMES = 'accountId,account_id,retailerId,retailer_id,supplierId,supplier_id,actingAsAccountId,acting_as_account_id';
            expect(hasSessionAccountContext(makeChatSession({ retailerId: 'ret-1' }))).toBe(true);
        });

        it('returns true when sessionAttributes.supplierId is set with PIKA_ACCOUNT_ID_FIELD_NAMES override', () => {
            process.env.PIKA_ACCOUNT_ID_FIELD_NAMES = 'accountId,account_id,retailerId,retailer_id,supplierId,supplier_id';
            expect(hasSessionAccountContext(makeChatSession({}, { supplierId: 'sup-42' }))).toBe(true);
        });

        it('returns true when top-level actingAsAccountId is set with PIKA_ACCOUNT_ID_FIELD_NAMES override', () => {
            process.env.PIKA_ACCOUNT_ID_FIELD_NAMES = 'accountId,account_id,actingAsAccountId,acting_as_account_id';
            expect(hasSessionAccountContext(makeChatSession({ actingAsAccountId: 'act-5' }))).toBe(true);
        });
    });
});

// ─── getAccountBackfillAttributes ───────────────────────────────────────────

describe('getAccountBackfillAttributes', () => {
    const originalEnv = process.env.PIKA_ACCOUNT_ID_FIELD_NAMES;

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.PIKA_ACCOUNT_ID_FIELD_NAMES;
        } else {
            process.env.PIKA_ACCOUNT_ID_FIELD_NAMES = originalEnv;
        }
    });

    it('returns empty object for undefined input', () => {
        expect(getAccountBackfillAttributes(undefined)).toEqual({});
    });

    it('picks up accountId and accountType with default field names', () => {
        const result = getAccountBackfillAttributes({ accountId: 'acc-1', accountType: 'retailer', irrelevant: 'drop-me' });
        expect(result).toEqual({ accountId: 'acc-1', accountType: 'retailer' });
        expect(result).not.toHaveProperty('irrelevant');
    });

    it('picks up account_id and account_name with default field names', () => {
        const result = getAccountBackfillAttributes({ account_id: 'acc-2', account_name: 'Acme' });
        expect(result).toEqual({ account_id: 'acc-2', account_name: 'Acme' });
    });

    it('picks up nested account object', () => {
        const result = getAccountBackfillAttributes({ account: { id: 'nested-1' } });
        expect(result).toEqual({ account: { id: 'nested-1' } });
    });

    it('does NOT pick up retailerId with default field names', () => {
        delete process.env.PIKA_ACCOUNT_ID_FIELD_NAMES;
        const result = getAccountBackfillAttributes({ retailerId: 'ret-1', accountId: 'acc-1' });
        expect(result).toHaveProperty('accountId', 'acc-1');
        expect(result).not.toHaveProperty('retailerId');
    });

    it('picks up retailerId when included in PIKA_ACCOUNT_ID_FIELD_NAMES', () => {
        process.env.PIKA_ACCOUNT_ID_FIELD_NAMES = 'accountId,account_id,retailerId,retailer_id,supplierId,supplier_id,actingAsAccountId,acting_as_account_id';
        const result = getAccountBackfillAttributes({
            retailerId: 'ret-99',
            supplierId: 'sup-99',
            actingAsAccountId: 'act-99',
            accountType: 'retailer',
            irrelevant: 'drop-me'
        });
        expect(result).toHaveProperty('retailerId', 'ret-99');
        expect(result).toHaveProperty('supplierId', 'sup-99');
        expect(result).toHaveProperty('actingAsAccountId', 'act-99');
        expect(result).toHaveProperty('accountType', 'retailer');
        expect(result).not.toHaveProperty('irrelevant');
    });

    it('omits null values', () => {
        const result = getAccountBackfillAttributes({ accountId: null as any, account_id: 'acc-3' });
        expect(result).not.toHaveProperty('accountId');
        expect(result).toHaveProperty('account_id', 'acc-3');
    });
});
