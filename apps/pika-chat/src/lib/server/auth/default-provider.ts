import type { RequestEvent } from '@sveltejs/kit';
import type { AuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
import type { AuthProvider } from './types';

/**
 * Default mock authentication provider that maintains existing behavior
 * when no custom authentication provider is implemented
 */
export default class DefaultAuthProvider implements AuthProvider {
    async authenticate(_event: RequestEvent, _stage: string): Promise<AuthenticatedUser<undefined>> {
        // Create a mock user (existing behavior)
        const user: AuthenticatedUser<undefined> = {
            userId: '123',
            authData: undefined,
            email: 'test@test.com',
            firstName: 'Test',
            lastName: 'User',
            companyId: '123',
            companyName: 'Test Company',
            companyType: 'retailer',
            features: {
                instruction: {
                    type: 'instruction',
                    instruction: 'You are a helpful assistant that can answer questions and help with tasks.'
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
