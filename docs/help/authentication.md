# Custom Authentication Guide

This guide explains how to implement custom authentication in your Pika project using the authentication customization extension point.

## Overview

Pika Framework provides a flexible authentication system that allows you to implement your own authentication logic while maintaining the framework's user management and chat functionality. Your custom authentication code is protected from framework updates and can handle complex flows like OAuth, SSO, and custom auth providers.

## Customization Location

**Location:** `apps/pika-chat/src/lib/server/auth-provider/`

**Purpose:** Implement custom authentication flows for your specific SSO or auth provider.

**Protected:** Yes - this directory is never overwritten by sync operations.

## Cookie Size Management

The framework intelligently handles large authentication data by automatically splitting it across multiple cookies when needed:

- **Single Cookie**: For small user data (≤4KB), uses the standard `au` cookie
- **Multi-Cookie**: For large user data (>4KB), splits data across multiple cookies:
    - `au` - Contains metadata (part count, total size, timestamp)
    - `au_part_0`, `au_part_1`, etc. - Contains encrypted data chunks

This allows you to store arbitrarily large authentication data without worrying about cookie size limits.

## Implementation Steps

### 1. Create the Custom Auth Provider Directory

First, create the customization directory:

```bash
mkdir -p apps/pika-chat/src/lib/server/auth-provider
```

### 2. Define Your Auth Data Type

Create a type definition file for your custom authentication data:

```typescript
// apps/pika-chat/src/lib/server/auth-provider/types.ts
export interface YourCustomAuthData {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    // Add your custom auth properties here
    identityId?: string;
    accountId?: string;
    accountType?: 'retailer' | 'supplier';
    // ... any other auth-specific data (no size limit!)
}
```

### 3. Implement Your Auth Provider

Create your main authentication provider:

```typescript
// apps/pika-chat/src/lib/server/auth-provider/index.ts
import type { RequestEvent } from '@sveltejs/kit';
import type { AuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
import type { CustomAuthProvider, NotAuthenticatedError, ForceUserToReauthenticateError } from '../auth/types';
import { redirect } from '@sveltejs/kit';

export default class YourAuthProvider implements CustomAuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any> | Response> {
        // Check if this is an OAuth callback
        if (event.url.pathname.startsWith('/oauth/callback')) {
            return this.handleOAuthCallback(event);
        }

        // Check if this is a login route
        if (event.url.pathname.startsWith('/auth/login')) {
            return this.startOAuthFlow(event);
        }

        // Extract auth token from cookies or headers
        const authToken = this.extractAuthToken(event);
        if (!authToken) {
            // No token found - redirect to login
            return redirect(302, '/login');
        }

        try {
            // Validate token and get user data
            const userData = await this.getUserFromAuthProvider(authToken);
            return this.createAuthenticatedUser(userData, authToken);
        } catch (error) {
            // Token invalid or expired - throw NotAuthenticatedError
            throw new NotAuthenticatedError('Invalid or expired token');
        }
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<any>): Promise<AuthenticatedUser<any> | undefined> {
        // Check if the user's access token is still valid
        const accessToken = user.authData.accessToken;

        try {
            // Validate the token with your auth provider
            const isValid = await this.validateTokenWithProvider(accessToken);

            if (isValid) {
                // Token is still valid - no action needed
                return undefined;
            }

            // Token is invalid but we have a refresh token
            if (user.authData.refreshToken) {
                try {
                    const newTokens = await this.refreshTokens(user.authData.refreshToken);
                    const updatedUser = { ...user };
                    updatedUser.authData = {
                        ...updatedUser.authData,
                        accessToken: newTokens.access_token,
                        refreshToken: newTokens.refresh_token,
                        expiresAt: newTokens.expires_at
                    };
                    return updatedUser;
                } catch (refreshError) {
                    // Refresh failed - force re-authentication
                    throw new ForceUserToReauthenticateError('Token refresh failed');
                }
            }

            // No refresh token available - force re-authentication
            throw new ForceUserToReauthenticateError('Token expired and no refresh token available');
        } catch (error) {
            if (error instanceof ForceUserToReauthenticateError) {
                throw error;
            }
            // Other errors - force re-authentication
            throw new ForceUserToReauthenticateError('Token validation failed');
        }
    }

    private extractAuthToken(event: RequestEvent): string | null {
        // Extract token from cookies, headers, etc.
        return event.cookies.get('your-auth-token') || event.request.headers.get('authorization')?.replace('Bearer ', '');
    }

    private async getUserFromAuthProvider(token: string): Promise<any> {
        // Make API call to your auth provider to get user data
        const response = await fetch('https://your-auth-provider.com/api/user', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to get user data');
        }

        return response.json();
    }

    private async validateTokenWithProvider(token: string): Promise<boolean> {
        // Validate token with your auth provider
        const response = await fetch('https://your-auth-provider.com/api/validate', {
            headers: { Authorization: `Bearer ${token}` }
        });

        return response.ok;
    }

    private async refreshTokens(refreshToken: string): Promise<any> {
        // Refresh tokens with your auth provider
        const response = await fetch('https://your-auth-provider.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: 'your-client-id',
                client_secret: 'your-client-secret',
                refresh_token: refreshToken
            })
        });

        if (!response.ok) {
            throw new Error('Failed to refresh tokens');
        }

        return response.json();
    }

    private createAuthenticatedUser(userData: any, token: string): AuthenticatedUser<any> {
        return {
            userId: userData.id,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            companyId: userData.companyId,
            companyName: userData.companyName,
            companyType: userData.companyType,
            authData: {
                accessToken: token,
                identityId: userData.identityId,
                accountId: userData.accountId,
                accountType: userData.accountType
            },
            features: {
                instruction: {
                    type: 'instruction',
                    instruction: 'You are a helpful assistant.'
                },
                history: {
                    type: 'history',
                    history: true
                }
            }
        };
    }

    private async startOAuthFlow(event: RequestEvent): Promise<Response> {
        // Redirect to your auth provider's login page
        const authUrl = new URL('https://your-auth-provider.com/oauth/authorize');
        authUrl.searchParams.set('client_id', 'your-client-id');
        authUrl.searchParams.set('redirect_uri', `${event.url.origin}/oauth/callback`);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'openid profile email');

        return redirect(302, authUrl.toString());
    }

    private async handleOAuthCallback(event: RequestEvent): Promise<Response> {
        const code = event.url.searchParams.get('code');
        if (!code) {
            return redirect(302, '/login?error=no_code');
        }

        // Exchange code for tokens
        const tokens = await this.exchangeCodeForTokens(code, event.url.origin);

        // Get user data
        const userData = await this.getUserFromAuthProvider(tokens.access_token);

        // Create authenticated user
        const user = this.createAuthenticatedUser(userData, tokens.access_token);

        // Set auth cookie (framework will handle the rest)
        event.cookies.set('your-auth-token', tokens.access_token, {
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'lax'
        });

        // Redirect to main app
        return redirect(302, '/');
    }

    private async exchangeCodeForTokens(code: string, redirectUri: string): Promise<any> {
        const response = await fetch('https://your-auth-provider.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: 'your-client-id',
                client_secret: 'your-client-secret',
                code,
                redirect_uri: `${redirectUri}/oauth/callback`
            })
        });

        if (!response.ok) {
            throw new Error('Failed to exchange code for tokens');
        }

        return response.json();
    }
}
```

## Framework Integration

The framework automatically:

1. **Loads your custom provider** when no user cookie exists
2. **Calls your `authenticate` method** with the request event for initial authentication
3. **Calls your `validateUser` method** when a user cookie exists to validate/refresh tokens
4. **Handles the responses**:
    - If `authenticate` returns a `Response` (redirect, OAuth flow), it returns that response
    - If `authenticate` returns an `AuthenticatedUser`, it sets cookies and continues
    - If `authenticate` throws `NotAuthenticatedError`, it redirects to login
    - If `validateUser` returns `undefined`, no action is taken
    - If `validateUser` returns an `AuthenticatedUser`, it updates the cookie
    - If `validateUser` throws `ForceUserToReauthenticateError`, it redirects to login
5. **Manages user creation/retrieval** in the chat database
6. **Handles secure cookie storage** with automatic size management

## Token Validation Flow

When a user has an existing cookie, the framework:

1. **Parses the user cookie** to get the current user data
2. **Calls `validateUser(event, user)`** with the current user object
3. **Handles the result**:
    - `undefined` → Continue with existing user (no changes needed)
    - `AuthenticatedUser` → Update cookie with refreshed tokens and continue
    - `ForceUserToReauthenticateError` → Clear cookies and redirect to login

## Example Use Cases

### OAuth Provider Integration

```typescript
// Example: Google OAuth integration with token refresh
export default class GoogleAuthProvider implements CustomAuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any> | Response> {
        const token = event.cookies.get('google-token');
        if (!token) {
            return redirect(302, '/login');
        }

        const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        }).then((r) => r.json());

        return {
            userId: userInfo.id,
            email: userInfo.email,
            firstName: userInfo.given_name,
            lastName: userInfo.family_name
            // ... other required fields
        };
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<any>): Promise<AuthenticatedUser<any> | undefined> {
        const token = user.authData.accessToken;

        try {
            // Check if token is still valid
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.ok) {
                return undefined; // Token is still valid
            }

            // Token expired, try to refresh
            if (user.authData.refreshToken) {
                const newTokens = await this.refreshGoogleTokens(user.authData.refreshToken);
                const updatedUser = { ...user };
                updatedUser.authData = {
                    ...updatedUser.authData,
                    accessToken: newTokens.access_token,
                    refreshToken: newTokens.refresh_token,
                    expiresAt: newTokens.expires_at
                };
                return updatedUser;
            }

            throw new ForceUserToReauthenticateError('Google token expired');
        } catch (error) {
            throw new ForceUserToReauthenticateError('Google token validation failed');
        }
    }
}
```

### SSO Integration

```typescript
// Example: SAML SSO integration
export default class SAMLAuthProvider implements CustomAuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any> | Response> {
        const samlResponse = event.url.searchParams.get('SAMLResponse');
        if (samlResponse) {
            const userData = await this.validateSAMLResponse(samlResponse);
            return this.createUserFromSAML(userData);
        }

        // Check for existing session
        const sessionId = event.cookies.get('saml-session');
        if (sessionId) {
            const userData = await this.getUserFromSession(sessionId);
            return this.createUserFromSAML(userData);
        }

        throw new NotAuthenticatedError('No valid SAML session');
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<any>): Promise<AuthenticatedUser<any> | undefined> {
        // For SAML, you might check if the session is still valid
        const sessionValid = await this.validateSAMLSession(user.authData.sessionId);

        if (sessionValid) {
            return undefined; // Session is still valid
        }

        throw new ForceUserToReauthenticateError('SAML session expired');
    }
}
```

### Custom Token Validation

```typescript
// Example: JWT token validation with refresh
export default class JWTAuthProvider implements CustomAuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any> | Response> {
        const token = event.cookies.get('jwt-token');
        if (!token) {
            return redirect(302, '/login');
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userData = await this.getUserFromDatabase(decoded.userId);
            return this.createUserFromDatabase(userData);
        } catch (error) {
            // Token invalid or expired
            event.cookies.delete('jwt-token');
            throw new NotAuthenticatedError('Invalid or expired JWT token');
        }
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<any>): Promise<AuthenticatedUser<any> | undefined> {
        const token = user.authData.accessToken;

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Check if token is about to expire (within 5 minutes)
            const expiresIn = decoded.exp * 1000 - Date.now();
            if (expiresIn > 5 * 60 * 1000) {
                return undefined; // Token is still valid
            }

            // Token is about to expire, refresh it
            const newToken = await this.refreshJWTToken(user.userId);
            const updatedUser = { ...user };
            updatedUser.authData = {
                ...updatedUser.authData,
                accessToken: newToken
            };
            return updatedUser;
        } catch (error) {
            throw new ForceUserToReauthenticateError('JWT token validation failed');
        }
    }
}
```

## Best Practices

### 1. Error Handling

Always handle authentication errors gracefully:

```typescript
async validateUser(event: RequestEvent, user: AuthenticatedUser<any>): Promise<AuthenticatedUser<any> | undefined> {
    try {
        // Your validation logic
        const isValid = await this.validateToken(user.authData.accessToken);

        if (isValid) {
            return undefined; // No action needed
        }

        // Try to refresh
        if (user.authData.refreshToken) {
            const newTokens = await this.refreshTokens(user.authData.refreshToken);
            return this.updateUserWithNewTokens(user, newTokens);
        }

        throw new ForceUserToReauthenticateError('Token expired and no refresh token');
    } catch (error) {
        if (error instanceof ForceUserToReauthenticateError) {
            throw error;
        }
        // Other errors - force re-authentication
        throw new ForceUserToReauthenticateError('Validation failed');
    }
}
```

### 2. Token Refresh

Implement token refresh logic for long-lived sessions:

```typescript
private async refreshTokenIfNeeded(token: string): Promise<string> {
    if (this.isTokenExpired(token)) {
        const refreshToken = this.getRefreshToken();
        const newTokens = await this.refreshTokens(refreshToken);
        return newTokens.access_token;
    }
    return token;
}
```

### 3. Security

- Always use HTTPS in production
- Implement CSRF protection for auth flows
- Validate all user data from external sources
- Use secure cookie settings
- Implement proper session management

### 4. Testing

Test your authentication provider thoroughly:

```typescript
// Example test
describe('YourAuthProvider', () => {
    it('should validate valid users', async () => {
        const provider = new YourAuthProvider();
        const mockEvent = createMockRequestEvent();
        const mockUser = createMockUser();

        const result = await provider.validateUser(mockEvent, mockUser);
        expect(result).toBeUndefined(); // No action needed
    });
});
```

## Troubleshooting

### Common Issues

1. **Provider not detected**: Ensure your provider is the default export
2. **Type errors**: Make sure your auth data type extends the base interface
3. **Redirect loops**: Check your authentication logic
4. **Cookie issues**: Verify cookie settings and domain configuration

### Debug Mode

Enable debug logging by setting the environment variable:

```bash
DEBUG_AUTH=true
```

This will log authentication flow details to help with troubleshooting.

## Migration from Default Auth

If you're migrating from the default mock authentication:

1. Create your custom auth provider
2. Test thoroughly in development
3. Deploy to staging environment
4. Verify all authentication flows work
5. Deploy to production

The framework will automatically use your custom provider once it's implemented.

## Next Steps

1. **Choose your auth provider** (OAuth, SAML, JWT, etc.)
2. **Implement the CustomAuthProvider interface**
3. **Test your authentication flow**
4. **Deploy and monitor**

For more complex authentication scenarios, consider implementing additional methods in your provider class to handle specific requirements.
