import type { RequestEvent } from '@sveltejs/kit';
import type { AuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
import { AuthProvider } from './types.js';

export interface MockAuthData extends Record<string, string | undefined> {
    mockAccessToken: string;
}

export interface MockCustomData extends Record<string, string | undefined> {
    accountId: string;
    accountName: string;
    accountType: string;
}

/**
 * Default mock authentication provider that maintains existing behavior
 * when no custom authentication provider is implemented
 */
export default class DefaultAuthProvider extends AuthProvider<MockAuthData, MockCustomData> {
    constructor(stage: string) {
        super(stage);
    }

    async authenticate(_event: RequestEvent): Promise<AuthenticatedUser<MockAuthData, MockCustomData>> {
        // Create a mock user (existing MockAuthData)
        const user: AuthenticatedUser<MockAuthData, MockCustomData> = {
            userId: '123',
            firstName: 'Test',
            lastName: 'User',
            authData: {
                mockAccessToken: 'aaa-bbb-ccc'
            },
            customData: {
                accountId: '123',
                accountName: 'Test Company',
                accountType: 'retailer'
            },
            features: {
                instruction: {
                    type: 'instruction',
                    instruction: 'You are a helpful assistant that can answer questions.'
                },
                history: {
                    type: 'history',
                    history: true
                }
            }
        };

        return user;
    }
}
