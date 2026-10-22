import type { RequestEvent } from '@sveltejs/kit';
import type { AuthenticateResult, AuthenticatedUser, CustomDataUiRepresentation, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import { AuthProvider } from '$lib/server/auth/types';
import { appConfig } from '$lib/server/config';
import { localMockUser } from './local-mock-user';

const LOCAL_MOCK_ENV_KEYS = [
    'PIKA_LOCAL_MOCK_USER_ID',
    'PIKA_LOCAL_MOCK_FIRST_NAME',
    'PIKA_LOCAL_MOCK_LAST_NAME',
    'PIKA_LOCAL_MOCK_USER_TYPE',
    'PIKA_LOCAL_MOCK_ROLES',
    'PIKA_LOCAL_MOCK_ACCOUNT_ID',
    'PIKA_LOCAL_MOCK_ACCOUNT_TYPE',
    'PIKA_LOCAL_MOCK_AUTH_PROVIDER'
];

function localMockEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const key of LOCAL_MOCK_ENV_KEYS) {
        const value = appConfig.getArbitraryConfigValueNotRequired(key);
        if (value !== undefined) env[key] = value;
    }
    return env;
}

export default class LocalMockAuthProvider extends AuthProvider<RecordOrUndef, RecordOrUndef> {
    async authenticate(_event: RequestEvent): Promise<AuthenticateResult<RecordOrUndef, RecordOrUndef>> {
        return { authenticatedUser: localMockUser({ ...process.env, ...localMockEnv() }) };
    }

    // An account id shown when none has been chosen reads as a real account in the header panel.
    async getCustomDataUiRepresentation(
        user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
        chatAppId?: string
    ): Promise<CustomDataUiRepresentation | undefined> {
        const accountId = user.overrideData?.[chatAppId ?? '']?.accountId ?? user.customData?.accountId;
        return { title: 'Account ID', value: accountId ?? 'not set' };
    }
}
