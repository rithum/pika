import { describe, it, expect } from '@jest/globals';
import { localMockUser } from '../../src/lib/custom/local-mock-user';

describe('localMockUser', () => {
    it('uses neutral defaults with an empty env', () => {
        const user = localMockUser({});
        expect(user.userId).toBe('local-dev-user');
        expect(user.roles).toEqual(['pika:content-admin', 'pika:site-admin']);
        expect(user.customData).toBeUndefined();
        expect(user.authData).toEqual({ mockAccessToken: 'aaa-bbb-ccc' });
        expect(user.authData).not.toHaveProperty('provider');
    });

    it('applies env overrides', () => {
        const user = localMockUser({
            PIKA_LOCAL_MOCK_USER_ID: 'dev-1',
            PIKA_LOCAL_MOCK_FIRST_NAME: 'Ada',
            PIKA_LOCAL_MOCK_LAST_NAME: 'Lovelace',
            PIKA_LOCAL_MOCK_USER_TYPE: 'external-user',
            PIKA_LOCAL_MOCK_ACCOUNT_ID: '000000001',
            PIKA_LOCAL_MOCK_ACCOUNT_TYPE: 'partner',
            PIKA_LOCAL_MOCK_AUTH_PROVIDER: 'example-idp'
        });
        expect(user.userId).toBe('dev-1');
        expect(user.firstName).toBe('Ada');
        expect(user.lastName).toBe('Lovelace');
        expect(user.userType).toBe('external-user');
        expect(user.customData).toEqual({ accountId: '000000001', accountType: 'partner' });
        expect(user.authData).toEqual({ mockAccessToken: 'aaa-bbb-ccc', provider: 'example-idp' });
    });

    it('trims and drops blank entries in PIKA_LOCAL_MOCK_ROLES', () => {
        expect(localMockUser({ PIKA_LOCAL_MOCK_ROLES: ' a, ,b ' }).roles).toEqual(['a', 'b']);
    });
});
