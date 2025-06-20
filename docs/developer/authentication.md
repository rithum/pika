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
import type { AuthProvider, NotAuthenticatedError, ForceUserToReauthenticateError } from '../auth/types';
import { redirect } from '@sveltejs/kit';

export default class YourAuthProvider implements AuthProvider {
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
export default class GoogleAuthProvider implements AuthProvider {
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
export default class SAMLAuthProvider implements AuthProvider {
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
export default class JWTAuthProvider implements AuthProvider {
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

### Multi-Tenant Authentication

```typescript
// Example: Multi-tenant authentication with organization switching
export default class MultiTenantAuthProvider implements AuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any> | Response> {
        // Check for organization context in URL or headers
        const orgId = event.url.searchParams.get('org') || event.request.headers.get('x-organization-id') || event.cookies.get('current-org');

        const token = event.cookies.get('auth-token');
        if (!token) {
            return redirect(302, '/login');
        }

        try {
            const userData = await this.getUserWithOrganizations(token);

            // If no org specified, use the user's default org
            const targetOrgId = orgId || userData.defaultOrgId;

            // Verify user has access to this organization
            const hasAccess = userData.organizations.some((org) => org.id === targetOrgId);
            if (!hasAccess) {
                throw new NotAuthenticatedError('Access denied to organization');
            }

            return this.createMultiTenantUser(userData, targetOrgId);
        } catch (error) {
            throw new NotAuthenticatedError('Multi-tenant authentication failed');
        }
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<any>): Promise<AuthenticatedUser<any> | undefined> {
        // Check if user still has access to current organization
        const hasAccess = await this.validateOrgAccess(user.userId, user.authData.currentOrgId);

        if (!hasAccess) {
            // User lost access to current org, try to switch to another accessible org
            const accessibleOrgs = await this.getUserOrganizations(user.userId);
            if (accessibleOrgs.length > 0) {
                const newOrgId = accessibleOrgs[0].id;
                return this.createMultiTenantUser(user, newOrgId);
            }
            throw new ForceUserToReauthenticateError('No accessible organizations');
        }

        return undefined; // Access still valid
    }

    private createMultiTenantUser(userData: any, orgId: string): AuthenticatedUser<any> {
        const org = userData.organizations.find((o) => o.id === orgId);
        return {
            userId: userData.id,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            companyId: org.id,
            companyName: org.name,
            companyType: org.type,
            authData: {
                accessToken: userData.accessToken,
                currentOrgId: orgId,
                availableOrgs: userData.organizations.map((o) => ({ id: o.id, name: o.name })),
                userRole: org.role
            }
        };
    }
}
```

### API Key Authentication

```typescript
// Example: API key authentication for service-to-service communication
export default class APIKeyAuthProvider implements AuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any> | Response> {
        const apiKey = event.request.headers.get('x-api-key') || event.cookies.get('api-key');

        if (!apiKey) {
            throw new NotAuthenticatedError('API key required');
        }

        try {
            const serviceData = await this.validateAPIKey(apiKey);
            return this.createServiceUser(serviceData, apiKey);
        } catch (error) {
            throw new NotAuthenticatedError('Invalid API key');
        }
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<any>): Promise<AuthenticatedUser<any> | undefined> {
        // For API keys, check if the key is still valid and not revoked
        const isValid = await this.validateAPIKey(user.authData.apiKey);

        if (!isValid) {
            throw new ForceUserToReauthenticateError('API key revoked or expired');
        }

        return undefined; // API key still valid
    }

    private createServiceUser(serviceData: any, apiKey: string): AuthenticatedUser<any> {
        return {
            userId: `service_${serviceData.id}`,
            email: serviceData.email,
            firstName: serviceData.name,
            lastName: '',
            companyId: serviceData.organizationId,
            companyName: serviceData.organizationName,
            companyType: 'service',
            authData: {
                apiKey,
                serviceId: serviceData.id,
                permissions: serviceData.permissions,
                rateLimit: serviceData.rateLimit
            }
        };
    }
}
```

### Session-Based Authentication

```typescript
// Example: Traditional session-based authentication with Redis
export default class SessionAuthProvider implements AuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any> | Response> {
        const sessionId = event.cookies.get('session-id');

        if (!sessionId) {
            return redirect(302, '/login');
        }

        try {
            const sessionData = await this.getSessionFromRedis(sessionId);
            if (!sessionData) {
                throw new NotAuthenticatedError('Session not found');
            }

            // Check if session is expired
            if (sessionData.expiresAt < Date.now()) {
                await this.deleteSessionFromRedis(sessionId);
                throw new NotAuthenticatedError('Session expired');
            }

            return this.createUserFromSession(sessionData);
        } catch (error) {
            event.cookies.delete('session-id');
            throw new NotAuthenticatedError('Invalid session');
        }
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<any>): Promise<AuthenticatedUser<any> | undefined> {
        const sessionId = user.authData.sessionId;

        // Check if session still exists and is valid
        const sessionData = await this.getSessionFromRedis(sessionId);

        if (!sessionData) {
            throw new ForceUserToReauthenticateError('Session not found');
        }

        if (sessionData.expiresAt < Date.now()) {
            await this.deleteSessionFromRedis(sessionId);
            throw new ForceUserToReauthenticateError('Session expired');
        }

        // Extend session if it's about to expire
        const timeUntilExpiry = sessionData.expiresAt - Date.now();
        if (timeUntilExpiry < 30 * 60 * 1000) {
            // Less than 30 minutes
            const extendedSession = await this.extendSession(sessionId);
            return this.createUserFromSession(extendedSession);
        }

        return undefined; // Session still valid
    }
}
```

### OAuth2 with PKCE (Public Key Code Exchange)

```typescript
// Example: OAuth2 with PKCE for enhanced security
export default class OAuth2PKCEProvider implements AuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any> | Response> {
        const code = event.url.searchParams.get('code');
        const state = event.url.searchParams.get('state');
        const codeVerifier = event.cookies.get('code_verifier');

        if (code && state && codeVerifier) {
            // OAuth callback - exchange code for tokens
            return this.handleOAuthCallback(event, code, state, codeVerifier);
        }

        // Check for existing access token
        const accessToken = event.cookies.get('access_token');
        if (accessToken) {
            try {
                const userData = await this.getUserWithToken(accessToken);
                return this.createUserFromOAuth(userData, accessToken);
            } catch (error) {
                // Token invalid, clear cookies and redirect to login
                event.cookies.delete('access_token');
                event.cookies.delete('refresh_token');
                return this.startOAuthFlow(event);
            }
        }

        // No tokens found, start OAuth flow
        return this.startOAuthFlow(event);
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<any>): Promise<AuthenticatedUser<any> | undefined> {
        const accessToken = user.authData.accessToken;
        const refreshToken = user.authData.refreshToken;

        try {
            // Check if access token is still valid
            const isValid = await this.validateAccessToken(accessToken);

            if (isValid) {
                return undefined; // Token still valid
            }

            // Access token expired, try to refresh
            if (refreshToken) {
                const newTokens = await this.refreshAccessToken(refreshToken);
                const updatedUser = { ...user };
                updatedUser.authData = {
                    ...updatedUser.authData,
                    accessToken: newTokens.access_token,
                    refreshToken: newTokens.refresh_token,
                    expiresAt: Date.now() + newTokens.expires_in * 1000
                };
                return updatedUser;
            }

            throw new ForceUserToReauthenticateError('Access token expired and no refresh token');
        } catch (error) {
            throw new ForceUserToReauthenticateError('OAuth token validation failed');
        }
    }

    private async startOAuthFlow(event: RequestEvent): Promise<Response> {
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);
        const state = this.generateState();

        // Store PKCE parameters in cookies
        event.cookies.set('code_verifier', codeVerifier, { httpOnly: true, secure: true });
        event.cookies.set('oauth_state', state, { httpOnly: true, secure: true });

        const authUrl = new URL('https://your-oauth-provider.com/oauth/authorize');
        authUrl.searchParams.set('client_id', process.env.OAUTH_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', `${event.url.origin}/oauth/callback`);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'openid profile email');
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('state', state);

        return redirect(302, authUrl.toString());
    }
}
```

### Role-Based Access Control (RBAC)

```typescript
// Example: Authentication with role-based access control
export default class RBACAuthProvider implements AuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any> | Response> {
        const token = event.cookies.get('auth-token');
        if (!token) {
            return redirect(302, '/login');
        }

        try {
            const userData = await this.getUserWithRoles(token);
            return this.createRBACUser(userData, token);
        } catch (error) {
            throw new NotAuthenticatedError('RBAC authentication failed');
        }
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<any>): Promise<AuthenticatedUser<any> | undefined> {
        // Check if user's roles have changed
        const currentRoles = await this.getUserRoles(user.userId);
        const hasRoleChanges = this.hasRoleChanges(user.authData.roles, currentRoles);

        if (hasRoleChanges) {
            // User's roles have changed, update the user object
            const updatedUser = { ...user };
            updatedUser.authData = {
                ...updatedUser.authData,
                roles: currentRoles,
                permissions: await this.getPermissionsForRoles(currentRoles)
            };
            return updatedUser;
        }

        return undefined; // No changes needed
    }

    private createRBACUser(userData: any, token: string): AuthenticatedUser<any> {
        return {
            userId: userData.id,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            companyId: userData.organizationId,
            companyName: userData.organizationName,
            companyType: userData.organizationType,
            authData: {
                accessToken: token,
                roles: userData.roles,
                permissions: userData.permissions,
                lastRoleCheck: Date.now()
            }
        };
    }
}
```

### Two-Factor Authentication (2FA)

```typescript
// Example: Authentication with 2FA support
export default class TwoFactorAuthProvider implements AuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any> | Response> {
        const token = event.cookies.get('auth-token');
        const twoFactorToken = event.cookies.get('2fa-token');

        if (!token) {
            return redirect(302, '/login');
        }

        try {
            const userData = await this.getUserData(token);

            // Check if user has 2FA enabled
            if (userData.twoFactorEnabled && !twoFactorToken) {
                // User needs to complete 2FA
                return redirect(302, '/2fa/verify');
            }

            // Validate 2FA if required
            if (userData.twoFactorEnabled && twoFactorToken) {
                const isValid2FA = await this.validateTwoFactorToken(userData.id, twoFactorToken);
                if (!isValid2FA) {
                    event.cookies.delete('2fa-token');
                    return redirect(302, '/2fa/verify');
                }
            }

            return this.createTwoFactorUser(userData, token, twoFactorToken);
        } catch (error) {
            throw new NotAuthenticatedError('Two-factor authentication failed');
        }
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<any>): Promise<AuthenticatedUser<any> | undefined> {
        // Check if 2FA token is still valid
        if (user.authData.twoFactorToken) {
            const isValid2FA = await this.validateTwoFactorToken(user.userId, user.authData.twoFactorToken);
            if (!isValid2FA) {
                throw new ForceUserToReauthenticateError('Two-factor authentication expired');
            }
        }

        return undefined; // 2FA still valid
    }
}
```

### Webhook Authentication

```typescript
// Example: Webhook authentication for external service integration
export default class WebhookAuthProvider implements AuthProvider {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<any> | Response> {
        // Verify webhook signature
        const signature = event.request.headers.get('x-webhook-signature');
        const payload = await event.request.text();

        if (!this.verifyWebhookSignature(payload, signature)) {
            throw new NotAuthenticatedError('Invalid webhook signature');
        }

        const webhookData = JSON.parse(payload);

        // Extract user information from webhook payload
        const userData = await this.processWebhookData(webhookData);
        return this.createWebhookUser(userData);
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<any>): Promise<AuthenticatedUser<any> | undefined> {
        // For webhook-based auth, check if the webhook session is still valid
        const isValid = await this.validateWebhookSession(user.authData.webhookId);

        if (!isValid) {
            throw new ForceUserToReauthenticateError('Webhook session expired');
        }

        return undefined; // Webhook session still valid
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
2. **Implement the AuthProvider interface**
3. **Test your authentication flow**
4. **Deploy and monitor**

For more complex authentication scenarios, consider implementing additional methods in your provider class to handle specific requirements.
