import type { AuthenticatedUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

export interface LocalMockCustomData extends Record<string, string | undefined> {
    accountId?: string;
    accountType?: string;
}

const DEFAULT_ROLES = ['pika:content-admin', 'pika:site-admin'];

/**
 * Not pika's DefaultAuthProvider id '123': a stored row for a shared id can carry account data that hides the account override dialog.
 */
function defaultUserId(env: NodeJS.ProcessEnv): string {
    return env.PIKA_LOCAL_MOCK_USER_ID ?? 'local-dev-user';
}

function splitRoles(raw: string | undefined): string[] | undefined {
    if (!raw) return undefined;
    const roles = raw
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean);
    return roles.length ? roles : undefined;
}

function authData(env: NodeJS.ProcessEnv): Record<string, string> {
    return { mockAccessToken: 'aaa-bbb-ccc', ...(env.PIKA_LOCAL_MOCK_AUTH_PROVIDER ? { provider: env.PIKA_LOCAL_MOCK_AUTH_PROVIDER } : {}) };
}

/**
 * customData stays undefined unless PIKA_LOCAL_MOCK_ACCOUNT_ID/TYPE is set, so the account override dialog still appears.
 */
export function localMockUser(env: NodeJS.ProcessEnv = process.env): AuthenticatedUser<RecordOrUndef, RecordOrUndef> {
    const customData: LocalMockCustomData = {};
    if (env.PIKA_LOCAL_MOCK_ACCOUNT_ID) customData.accountId = env.PIKA_LOCAL_MOCK_ACCOUNT_ID;
    if (env.PIKA_LOCAL_MOCK_ACCOUNT_TYPE) customData.accountType = env.PIKA_LOCAL_MOCK_ACCOUNT_TYPE;

    return {
        userId: defaultUserId(env),
        firstName: env.PIKA_LOCAL_MOCK_FIRST_NAME ?? 'Test',
        lastName: env.PIKA_LOCAL_MOCK_LAST_NAME ?? 'User',
        userType: (env.PIKA_LOCAL_MOCK_USER_TYPE as 'internal-user' | 'external-user') ?? 'internal-user',
        authData: authData(env),
        customData: Object.keys(customData).length ? (customData as RecordOrUndef) : undefined,
        features: {
            instruction: { type: 'instruction', instruction: 'You are a helpful assistant that can answer questions.' },
            history: { type: 'history', history: true }
        },
        roles: splitRoles(env.PIKA_LOCAL_MOCK_ROLES) ?? DEFAULT_ROLES
    } as AuthenticatedUser<RecordOrUndef, RecordOrUndef>;
}
