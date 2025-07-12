import type { RequestEvent } from '@sveltejs/kit';
import type {
    AuthenticatedUser,
    AuthenticateResult,
    CustomDataUiRepresentation,
} from '@pika/shared/types/chatbot/chatbot-types';
import { AuthProvider } from './types.js';

export interface MockAuthData extends Record<string, string | undefined> {
    mockAccessToken: string;
}

export interface MockCustomData extends Record<string, string | undefined> {
    accountId: string;
    accountType: string;
}

/**
 * Default mock authentication provider that maintains existing behavior
 * when no custom authentication provider is implemented
 *
 * ⚠️ SECURITY WARNING: This provider is for development only!
 * - Automatically authenticates anyone as the same hardcoded user
 * - Provides no real security or access control
 * - Must be replaced with custom authentication before production deployment
 * - See <root>docs/developer/getting-started.md for more information
 */
export default class DefaultAuthProvider extends AuthProvider<MockAuthData, MockCustomData> {
    constructor(stage: string) {
        super(stage);
    }

    async authenticate(_event: RequestEvent): Promise<AuthenticateResult<MockAuthData, MockCustomData>> {
        // Create a mock user (existing MockAuthData)
        const user: AuthenticatedUser<MockAuthData, MockCustomData> = {
            userId: '123',
            firstName: 'Test',
            lastName: 'User',
            userType: 'internal-user', // Assign as internal user for development
            authData: {
                mockAccessToken: 'aaa-bbb-ccc',
            },
            customData: {
                // accountId: '123',
                // accountType: 'standard',
            } as MockCustomData,
            features: {
                instruction: {
                    type: 'instruction',
                    instruction: 'You are a helpful assistant that can answer questions.',
                },
                history: {
                    type: 'history',
                    history: true,
                },
            },
            roles: ['pika:content-admin', 'pika:site-admin'],
        };

        return { authenticatedUser: user };
    }

    async getCustomDataUiRepresentation(
        user: AuthenticatedUser<MockAuthData, MockCustomData>,
        chatAppId?: string
    ): Promise<CustomDataUiRepresentation | undefined> {
        return {
            title: 'Account ID',
            value: user.overrideData?.[chatAppId ?? '']?.accountId ?? user.customData?.accountId ?? '123',
        };
    }

    /**
     * This is a mock implementation of the getCustomDataFieldPathToMatchUsersEntity method.
     *
     * Many users are associated with an account or company "entity".  This method returns the path to the custom data field that is used to match against the entity.
     *
     * Note the path is relative to the customData field of the user object.
     *
     * @returns The path to the custom data field to match against the entity.
     */
    async getCustomDataFieldPathToMatchUsersEntity(): Promise<string | undefined> {
        return 'accountId';
    }
}
