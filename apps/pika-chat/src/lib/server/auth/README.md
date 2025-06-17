# Custom Authentication

This directory is where you implement your custom authentication logic. The framework will automatically detect and use your custom authentication provider.

## Quick Start

1. **Replace the placeholder provider**: Edit `provider.ts` and implement your authentication logic
2. **Define your auth data type**: Create custom types in `types.ts` if needed
3. **Test your implementation**: The framework will automatically use your provider

## Files

- `types.ts` - Type definitions for the authentication system
- `provider.ts` - **YOUR CUSTOM AUTH PROVIDER** (replace this file)
- `default-provider.ts` - Default mock authentication (fallback)
- `index.ts` - Framework integration logic

## Implementation

See `docs/help/authentication.md` for complete implementation details and examples.

## Example

```typescript
// provider.ts
import type { RequestEvent } from '@sveltejs/kit';
import type { AuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
import type { CustomAuthProvider } from './types';

export default class YourAuthProvider implements CustomAuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any>> {
        // Your authentication logic here
        const token = event.cookies.get('your-auth-token');
        if (!token) {
            throw redirect(302, '/auth/login');
        }

        // Validate token and get user data
        const userData = await this.getUserFromAuthProvider(token);
        return this.createAuthenticatedUser(userData, token);
    }
}
```

## Framework Integration

The framework automatically:

1. Loads your custom provider
2. Handles auth routes if you implement `shouldHandleRoute` and `handleAuthRoute`
3. Calls your `authenticate` method when no valid user cookie exists
4. Manages user creation/retrieval in the chat database
5. Handles secure cookie storage

## Fallback Behavior

If no custom provider is found or if there are errors, the framework falls back to the default mock authentication provider.
