// This file is a placeholder for custom authentication providers
// Users should replace this file with their own authentication implementation
// See docs/help/authentication.md for implementation details

// Example structure (remove this and implement your own):
/*
import type { RequestEvent } from '@sveltejs/kit';
import type { AuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
import type { AuthProvider } from '../auth/types';

export default class YourAuthProvider implements AuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any> | Response> {
        // Your authentication logic here
        throw new Error('Custom authentication not implemented');
    }
}
*/

// Export null to indicate no custom provider is implemented
export default null;
