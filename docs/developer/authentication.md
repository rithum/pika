# Custom Authentication Guide

This guide explains how to implement custom authentication in your Pika project using the authentication customization extension point.

## Overview

Pika Framework provides a flexible authentication system that allows you to implement your own authentication logic while maintaining the framework's user management and chat functionality. Your custom authentication code is protected from framework updates and can handle complex flows like OAuth, SSO, and custom auth providers.

## 🚨 CRITICAL SECURITY WARNING

**⚠️ THE DEFAULT MOCK AUTHENTICATION IS NOT SECURE ⚠️**

### Default Behavior - Development Only

Pika Framework ships with a **default mock authentication provider** located at `apps/pika-chat/src/lib/server/auth/default-provider.ts` that:

- **Hardcodes a single test user** (`userId: '123', firstName: 'Test', lastName: 'User'`)
- **Requires no password or validation** - anyone visiting your site is automatically authenticated
- **Does not assign a `userType`** - this can cause security issues with chat app access control
- **Returns the same mock user for every request**

### Production Deployment Requirements

**🔒 BEFORE DEPLOYING PUBLICLY, YOU MUST:**

1. **Replace the mock provider** with your own authentication implementation
2. **Assign proper `userType` values** (`internal-user` or `external-user`) to all users
3. **Configure `userTypesAllowed`** on all chat apps to control access
4. **Test authentication flows** thoroughly in staging environment

### Security Risk

The mock provider creates a significant security vulnerability:

```typescript
// ❌ CURRENT MOCK PROVIDER - INSECURE
async authenticate(_event: RequestEvent): Promise<AuthenticatedUser<MockAuthData, MockCustomData>> {
    return {
        userId: '123',
        firstName: 'Test',
        lastName: 'User',
        userType: 'internal-user', // marked as internal user for development
        // ⚠️ No actual authentication - anyone can access!
        // ... rest of user data
    };
}
```

**Fix this by implementing a custom provider that:**

- Validates real user credentials
- Assigns appropriate `userType` values
- Implements proper access controls

## Understanding User Data Types

The framework uses a two-tier data structure to separate authentication data from business data:

### `AuthenticatedUser<T, U>`

- **T (Auth Data)**: Sensitive authentication information (tokens, sessions, etc.)
    - Stored securely in encrypted cookies
    - Never saved to database
    - Available server-side only
    - Not sent to agent or tools
    - Auth Data must be of type `Record<string, string>` or undefined
- **U (Custom Data)**: Business-specific user information (company details, account info, etc.)
    - Stored securely in encrypted cookies
    - Saved to chat user database as `customData`
    - Available to agent tools (but NOT the agent itself)
    - Persists across sessions
    - Custom Data must be of type `Record<string, string>` or undefined

### `ChatUser<T>`

- **T (Custom Data)**: Same as the U type in `AuthenticatedUser<T, U>`
    - Contains business-specific user information
    - Core fields: `userId`, `firstName`, `lastName`, `userType`, `role`, `features`
    - Custom fields: stored in the `customData` property

This separation ensures sensitive auth data stays secure while allowing business data to be accessible where needed.

## User Access Control Features

The framework provides two optional access control features you can leverage in your authentication implementation:

### User Types (Internal vs External)

You can distinguish between different types of users by setting the `userType` field:

- **`internal-user`**: Company employees, administrators, internal staff
- **`external-user`**: Customers, partners, external users

**Benefits:**

- Control which chat apps are accessible to which user types
- Implement different UX flows for internal vs external users
- Apply different security policies

**Usage in Chat Apps:**
When defining a `ChatApp`, you can restrict access using `userTypesAllowed`:

```typescript
// Example: Chat app only for internal users
const internalChatApp: ChatApp = {
    chatAppId: 'internal-support',
    title: 'Internal Support Chat',
    userTypesAllowed: ['internal-user'] // Only internal users can access
    // ... other properties
};

// Example: Chat app for all users (default)
const publicChatApp: ChatApp = {
    chatAppId: 'customer-support',
    title: 'Customer Support'
    // userTypesAllowed not specified = all user types allowed
    // ... other properties
};
```

### User Roles and Permissions

You can assign roles to users for advanced access control and administrative capabilities:

**Special Pika Roles:**

- **`pika:content-admin`**: Super-admin role that grants:
    - Ability to act as any other user in view only mode (impersonation)
    - Access to view all chat sessions and messages (debugging)
    - Administrative privileges across the platform

**Custom Roles:**

- You can define custom roles as plain strings for your business logic
- **Important:** Do not create custom roles starting with `pika:` (reserved for framework use)
- Custom roles are not currently used by the framework but will be supported in future versions

**Example Usage:**

```typescript
// User with admin privileges
const adminUser: AuthenticatedUser<AuthData, CustomData> = {
    userId: 'admin-123',
    firstName: 'John',
    lastName: 'Admin',
    userType: 'internal-user',
    roles: ['pika:content-admin', 'company-admin', 'support-lead']
    // ... other properties
};

// Regular user with custom business roles
const managerUser: AuthenticatedUser<AuthData, CustomData> = {
    userId: 'manager-456',
    firstName: 'Jane',
    lastName: 'Manager',
    userType: 'internal-user',
    roles: ['department-manager', 'budget-approver']
    // ... other properties
};

// External customer (no special roles)
const customerUser: AuthenticatedUser<AuthData, CustomData> = {
    userId: 'customer-789',
    firstName: 'Bob',
    lastName: 'Customer',
    userType: 'external-user'
    // No roles array = no special permissions
    // ... other properties
};
```

### Implementation Examples

Here are practical examples of how to implement user type and role logic in your authentication provider:

```typescript
// Example: Determine user type based on email domain
function determineUserType(email: string, userData: any): UserType {
    const companyDomains = ['yourcompany.com', 'corp.yourcompany.com'];
    const emailDomain = email.split('@')[1];

    if (companyDomains.includes(emailDomain)) {
        return 'internal-user';
    }
    return 'external-user';
}

// Example: Extract roles from your auth provider
function extractUserRoles(userData: any): string[] {
    const roles: string[] = [];

    // Add Pika admin role for super admins
    if (userData.isSuperAdmin) {
        roles.push('pika:content-admin');
    }

    // Add custom business roles
    if (userData.permissions) {
        if (userData.permissions.includes('manage_team')) {
            roles.push('team-manager');
        }
        if (userData.permissions.includes('approve_budgets')) {
            roles.push('budget-approver');
        }
        if (userData.permissions.includes('view_analytics')) {
            roles.push('analytics-viewer');
        }
    }

    return roles;
}

// Example: Enhanced authentication method
private createAuthenticatedUser(userData: any, token: string): AuthenticatedUser<YourCustomAuthData, YourCustomUserData> {
    const userType = this.determineUserType(userData.email, userData);
    const roles = this.extractUserRoles(userData);

    return {
        userId: userData.id,
        firstName: userData.firstName,
        lastName: userData.lastName,
        userType,
        roles,
        customData: {
            email: userData.email,
            department: userData.department,
            companyId: userData.companyId,
            accountId: userData.accountId
        },
        authData: {
            accessToken: token,
            refreshToken: userData.refreshToken,
            expiresAt: userData.expiresAt
        },
        features: {
            instruction: { type: 'instruction', instruction: 'You are a helpful assistant.' },
            history: { type: 'history', history: true }
        }
    };
}
```

### Chat App Access Control

Here's how to configure chat apps with user type restrictions:

```typescript
// Internal-only chat app for employee support
const employeeChatApp: ChatApp = {
    chatAppId: 'employee-support',
    title: 'Employee IT Support',
    userTypesAllowed: ['internal-user'], // Only employees can access
    agentId: 'internal-support-agent',
    mode: 'fullpage',
    enabled: true
    // ... other properties
};

// Customer-facing chat app
const customerChatApp: ChatApp = {
    chatAppId: 'customer-support',
    title: 'Customer Support',
    userTypesAllowed: ['external-user'], // Only customers can access
    agentId: 'customer-support-agent',
    mode: 'embedded',
    enabled: true
    // ... other properties
};

// Admin chat app for debugging (accessible to content admins only)
const adminChatApp: ChatApp = {
    chatAppId: 'admin-debug',
    title: 'Admin Debug Chat',
    // No userTypesAllowed restriction, but features will check for pika:content-admin role
    agentId: 'debug-agent',
    mode: 'fullpage',
    enabled: true
    // ... other properties
};
```

## Quick Reference: Security Essentials

### 🔒 Production Deployment Checklist

**Before deploying to production, ensure:**

| ✅  | Security Requirement                             | Why It Matters                  |
| --- | ------------------------------------------------ | ------------------------------- |
| ✅  | Custom auth provider implemented                 | Mock provider has no security   |
| ✅  | All users have `userType` assigned               | Controls chat app access        |
| ✅  | Chat apps have `userTypesAllowed` configured     | Prevents unauthorized access    |
| ✅  | Internal tools restricted to `['internal-user']` | Protects admin functionality    |
| ✅  | Customer-facing apps restricted appropriately    | Data privacy and access control |

### 👥 User Type Quick Guide

```typescript
// User type assignment in your auth provider
const user: AuthenticatedUser = {
    // ... other fields
    userType: 'internal-user', // Company employees, staff, admins
    // OR
    userType: 'external-user' // Customers, partners, external users
};
```

### 🛡️ Chat App Access Control

```typescript
// Restrict to internal users only (admin tools, employee resources)
const internalApp: ChatApp = {
    chatAppId: 'admin-dashboard',
    title: 'Admin Dashboard',
    userTypesAllowed: ['internal-user'] // Only internal users
};

// Restrict to external users only (customer support, public services)
const externalApp: ChatApp = {
    chatAppId: 'customer-support',
    title: 'Customer Support',
    userTypesAllowed: ['external-user'] // Only external users
};

// Allow both user types (general purpose, shared resources)
const sharedApp: ChatApp = {
    chatAppId: 'general-chat',
    title: 'General Chat'
    // No userTypesAllowed = accessible to both types
};
```

### ⚠️ Common Security Mistakes

```typescript
// ❌ DANGEROUS - Missing userType assignment
const user: AuthenticatedUser = {
    userId: 'user123',
    firstName: 'John',
    lastName: 'Doe'
    // Missing userType = potential security issues
};

// ❌ DANGEROUS - Admin tools accessible to all users
const adminTools: ChatApp = {
    chatAppId: 'admin-tools',
    title: 'Admin Tools'
    // Missing userTypesAllowed = everyone can access admin tools!
};

// ❌ DANGEROUS - Customer data exposed to internal users
const customerApp: ChatApp = {
    chatAppId: 'customer-data',
    title: 'Customer Portal'
    // Missing userTypesAllowed = internal users can see customer data
};
```

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

## Generic Type System

The Pika authentication system uses TypeScript generics to provide type safety while allowing flexibility in your authentication data structure. This ensures your auth data and custom user data are properly typed throughout the system.

### AuthProvider<T, U> Generic Parameters

When creating your authentication provider, you must extend `AuthProvider<T, U>` where:

- **T (Auth Data Type)**: Contains authentication-specific data like tokens, session IDs, etc.

    - Stored securely in encrypted cookies only
    - Never saved to database
    - Available server-side only
    - Not accessible to agents or tools

- **U (Custom Data Type)**: Contains business-specific user information
    - Stored in encrypted cookies AND database (`customData` field)
    - Available to agent tools (but NOT the agent itself)
    - Persists across sessions

### Example Type Definitions

```typescript
// T - Auth data (cookies only, not database)
interface MyAuthData {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
}

// U - Custom data (cookies + database)
interface MyCustomData {
    companyId: string;
    accountType: 'retailer' | 'supplier';
    email: string;
}

// Properly typed provider
export default class MyAuthProvider extends AuthProvider<MyAuthData, MyCustomData> {
    // Methods are automatically typed with your specific types
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<MyAuthData, MyCustomData> | Response> {
        // Implementation
    }
}
```

### Type Safety Benefits

- **Compile-time checking**: TypeScript ensures your auth data structure matches throughout your code
- **IntelliSense support**: IDEs provide accurate autocomplete for your specific auth data fields
- **Refactoring safety**: Changes to your auth data types are caught at compile time
- **Clear contracts**: The generic system makes it explicit what data is available where

## Complete Working Example

A fully functional authentication provider example is included at `apps/pika-chat/src/lib/server/auth-provider/custom-example.ts`. This example demonstrates:

- **Time-based validation** (validates only every 5 minutes for performance)
- **Multi-endpoint fallback** (tries admin and regular endpoints)
- **Comprehensive error handling** and logging
- **Generic, customizable structure** for any HTTP-based auth system
- **Cookie management** and redirect handling

**To use this example:**

1. Copy the contents of `custom-example.ts`
2. Paste into your `index.ts` file
3. Customize the URLs, types, and business logic for your auth provider
4. Update the user lookup mechanism (database or API)

## Implementation Steps

### 1. Create the Custom Auth Provider Directory

The customization directory should already exist, but if not:

```bash
mkdir -p apps/pika-chat/src/lib/server/auth-provider
```

### 2. Define Your Auth and Custom Data Types

Create type definitions for your authentication data and custom user data:

```typescript
// apps/pika-chat/src/lib/server/auth-provider/types.ts

// Auth data - stored securely in cookies, never saved to database
// Available server-side only, not sent to agent or tools
export interface YourCustomAuthData {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    // Add your auth-specific properties here (tokens, session data, etc.)
    // ... any other auth-specific data (no size limit!)
}

// Custom data - saved to database with user record
// Available to agent tools (but NOT the agent itself)
export interface YourCustomUserData {
    companyId?: string;
    companyName?: string;
    companyType?: 'retailer' | 'supplier';
    email?: string;
    accountId?: string;
    // Add your custom user properties here
    // ... any other user-specific data you want to persist
}
```

### 3. Implement Your Auth Provider

Create your main authentication provider. Your provider must extend the generic `AuthProvider<T, U>` class where:

- **T** is your auth data type (stored securely in cookies, not database)
- **U** is your custom user data type (stored in database as `customData`)

**Important:** Use `extends AuthProvider<YourAuthType, YourCustomType>` not `implements AuthProvider`.

```typescript
// apps/pika-chat/src/lib/server/auth-provider/index.ts
import type { RequestEvent } from '@sveltejs/kit';
import type { AuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
import { AuthProvider, NotAuthenticatedError, ForceUserToReauthenticateError } from '../auth/types';
import { redirect } from '@sveltejs/kit';
import type { YourCustomAuthData, YourCustomUserData } from './types';

export default class YourAuthProvider extends AuthProvider<YourCustomAuthData, YourCustomUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<YourCustomAuthData, YourCustomUserData> | Response> {
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

    async validateUser(
        event: RequestEvent,
        user: AuthenticatedUser<YourCustomAuthData, YourCustomUserData>
    ): Promise<AuthenticatedUser<YourCustomAuthData, YourCustomUserData> | undefined> {
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

    private createAuthenticatedUser(userData: any, token: string): AuthenticatedUser<YourCustomAuthData, YourCustomUserData> {
        return {
            userId: userData.id,
            firstName: userData.firstName,
            lastName: userData.lastName,
            // User type for access control
            userType: userData.isEmployee ? 'internal-user' : 'external-user',
            // Roles for permissions and admin access
            roles: userData.roles || [], // e.g., ['pika:content-admin', 'support-manager']
            // Custom data - saved to database, available to agent tools
            customData: {
                email: userData.email,
                companyId: userData.companyId,
                companyName: userData.companyName,
                companyType: userData.companyType,
                accountId: userData.accountId
            },
            // Auth data - stored in secure cookie only, never saved to database
            authData: {
                accessToken: token,
                refreshToken: userData.refreshToken,
                expiresAt: userData.expiresAt
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
    - If `authenticate` returns an `AuthenticatedUser<T, U>`, it sets cookies and continues
    - If `authenticate` throws `NotAuthenticatedError`, it redirects to login
    - If `validateUser` returns `undefined`, no action is taken
    - If `validateUser` returns an `AuthenticatedUser<T, U>`, it updates the cookie
    - If `validateUser` throws `ForceUserToReauthenticateError`, it redirects to login
5. **Manages user creation/retrieval** in the chat database
6. **Handles secure cookie storage** with automatic size management

### Data Storage and Access

The framework handles two types of user data:

- **Auth Data (T)**: Stored securely in encrypted cookies, never saved to database. Available server-side only. Contains tokens, session data, etc.
- **Custom Data (U)**: Saved to the chat user database as `customData`. Available to agent tools but NOT the agent itself. Contains business data like company info, account details, etc.

## Token Validation Flow

When a user has an existing cookie, the framework:

1. **Parses the user cookie** to get the current user data (including both auth data and custom data)
2. **Calls `validateUser(event, user)`** with the current `AuthenticatedUser<T, U>` object
3. **Handles the result**:
    - `undefined` → Continue with existing user (no changes needed)
    - `AuthenticatedUser<T, U>` → Update cookie with refreshed auth data and continue
    - `ForceUserToReauthenticateError` → Clear cookies and redirect to login

## Client-Side Authentication Flow

For authentication flows that require client-side processing (such as OAuth popups, social login SDKs, or complex multi-step authentication), the framework provides a dedicated client-side authentication route and helper method.

### Overview

The client-side authentication flow allows your auth provider to:

1. **Detect when client-side processing is needed** in the `authenticate` method
2. **Redirect to a protected client-side route** (`/auth/client-auth`)
3. **Pass data to the client** using the `addValueToLocalsForRoute` method
4. **Handle client-side authentication** in the browser
5. **Return to server-side authentication** once client-side processing is complete

### Protected Client-Side Files

The framework provides protected files that won't be overwritten during sync operations:

**Location:** `apps/pika-chat/src/routes/auth/client-auth/`

- **`+page.server.ts`**: Server-side logic to access data passed from your auth provider
- **`+page.svelte`**: Client-side component for handling authentication UI and logic

### The `addValueToLocalsForRoute` Method

Your auth provider can implement the optional `addValueToLocalsForRoute` method to pass data to the client-side authentication route:

```typescript
async addValueToLocalsForRoute?(
    event: RequestEvent,
    user: AuthenticatedUser<T, U> | undefined
): Promise<Record<string, unknown> | undefined>
```

**Parameters:**

- `event`: The request event (so you can check the path)
- `user`: The authenticated user (if there is one)

**Returns:** An object that will be added to the route's `locals` object under the key `customData`

### Implementation Example

Here's how to implement a client-side authentication flow:

```typescript
// Example: OAuth with client-side popup handling
interface OAuthClientAuthData {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

interface OAuthClientUserData {
    email: string;
    provider: string;
}

export default class OAuthClientAuthProvider extends AuthProvider<OAuthClientAuthData, OAuthClientUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<OAuthClientAuthData, OAuthClientUserData> | Response> {
        // Check if this is a callback from client-side auth
        const authCode = event.url.searchParams.get('auth_code');
        if (authCode) {
            // Exchange code for tokens and create user
            const tokens = await this.exchangeCodeForTokens(authCode);
            const userData = await this.getUserFromProvider(tokens.access_token);
            return this.createAuthenticatedUser(userData, tokens);
        }

        // Check for existing token
        const token = event.cookies.get('oauth-token');
        if (token) {
            try {
                const userData = await this.getUserFromProvider(token);
                return this.createAuthenticatedUser(userData, { access_token: token });
            } catch (error) {
                // Token invalid, clear it and redirect to client auth
                event.cookies.delete('oauth-token');
            }
        }

        // No valid token found - redirect to client-side auth
        return redirect(302, '/auth/client-auth');
    }

    async addValueToLocalsForRoute(
        event: RequestEvent,
        user: AuthenticatedUser<OAuthClientAuthData, OAuthClientUserData> | undefined
    ): Promise<Record<string, unknown> | undefined> {
        // Only add data for the client-auth route
        if (event.url.pathname === '/auth/client-auth') {
            return {
                oauthClientId: process.env.OAUTH_CLIENT_ID,
                oauthRedirectUri: `${event.url.origin}/auth/callback`,
                oauthScopes: 'openid profile email',
                authProviderUrl: 'https://your-oauth-provider.com/oauth/authorize'
            };
        }
        return undefined;
    }

    private createAuthenticatedUser(userData: any, tokens: any): AuthenticatedUser<OAuthClientAuthData, OAuthClientUserData> {
        return {
            userId: userData.id,
            firstName: userData.firstName,
            lastName: userData.lastName,
            userType: 'external-user',
            customData: {
                email: userData.email,
                provider: 'oauth'
            },
            authData: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: Date.now() + tokens.expires_in * 1000
            },
            features: {
                instruction: { type: 'instruction', instruction: 'You are a helpful assistant.' },
                history: { type: 'history', history: true }
            }
        };
    }
}
```

### Client-Side Implementation

Update the protected client-side files to handle your authentication flow:

**`+page.server.ts`:**

```typescript
import { type RequestEvent } from '@sveltejs/kit';

export async function load(event: RequestEvent): Promise<{ customData: Record<string, unknown> | undefined }> {
    return { customData: event.locals.customData };
}
```

**`+page.svelte`:**

```svelte
<script lang="ts">
    import { page } from '$app/stores';
    import { onMount } from 'svelte';

    const { data } = $page.data;
    const customData = data.customData;

    onMount(() => {
        if (customData) {
            // Start OAuth flow with data from server
            startOAuthFlow(customData);
        }
    });

    function startOAuthFlow(authData: any) {
        const authUrl = new URL(authData.authProviderUrl);
        authUrl.searchParams.set('client_id', authData.oauthClientId);
        authUrl.searchParams.set('redirect_uri', authData.oauthRedirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', authData.oauthScopes);
        authUrl.searchParams.set('state', generateRandomState());

        // Open popup or redirect
        window.location.href = authUrl.toString();
    }

    function generateRandomState(): string {
        return Math.random().toString(36).substring(2, 15);
    }
</script>

<div class="auth-container">
    <h2>Authenticating...</h2>
    <p>Please wait while we redirect you to complete authentication.</p>

    {#if customData}
        <div class="auth-info">
            <p>Connecting to: {customData.authProviderUrl}</p>
        </div>
    {/if}
</div>

<style>
    .auth-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 300px;
        text-align: center;
    }

    .auth-info {
        margin-top: 20px;
        padding: 10px;
        background: #f5f5f5;
        border-radius: 4px;
    }
</style>
```

### Callback Handling

Create a callback route to handle the return from client-side authentication:

**`apps/pika-chat/src/routes/auth/callback/+page.server.ts`:**

```typescript
import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export async function load(event: RequestEvent) {
    // Extract auth code from URL
    const authCode = event.url.searchParams.get('code');
    const state = event.url.searchParams.get('state');

    if (authCode) {
        // Redirect back to main app with auth code
        // The authenticate method will pick up the auth_code parameter
        return redirect(302, `/?auth_code=${authCode}`);
    }

    // No auth code - redirect to login
    return redirect(302, '/auth/client-auth');
}
```

### Flow Sequence

1. **User visits protected page** → Framework calls `authenticate()`
2. **No valid token found** → `authenticate()` returns redirect to `/auth/client-auth`
3. **Framework calls `addValueToLocalsForRoute()`** → Passes OAuth configuration data
4. **User sees client-side auth page** → JavaScript starts OAuth flow
5. **User completes OAuth** → Redirects to `/auth/callback`
6. **Callback redirects to main app** → With `auth_code` parameter
7. **Framework calls `authenticate()` again** → Now with `auth_code` parameter
8. **Authentication completes** → User is authenticated and redirected to original page

### Use Cases

This pattern is ideal for:

- **OAuth providers** that require popup windows or complex client-side flows
- **Social login SDKs** (Facebook, Google, etc.) that need client-side initialization
- **Multi-step authentication** flows that require user interaction
- **CAPTCHA or 2FA** that needs to be handled in the browser
- **Custom authentication widgets** that require client-side processing

### Security Considerations

- **Validate all data** passed from client to server
- **Use secure redirect URIs** and validate them on the server
- **Implement proper state parameter** validation for OAuth flows
- **Set appropriate cookie security** settings for your domain
- **Handle authentication errors** gracefully on both client and server

## Example Use Cases

**💡 TIP:** Before reviewing these examples, check out the complete working example at `apps/pika-chat/src/lib/server/auth-provider/custom-example.ts` which includes time-based validation and multi-endpoint fallback patterns you can copy directly.

### OAuth Provider Integration

```typescript
// Example: Google OAuth integration with token refresh
interface GoogleAuthData {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

interface GoogleUserData {
    email: string;
    domain?: string;
}

export default class GoogleAuthProvider extends AuthProvider<GoogleAuthData, GoogleUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<GoogleAuthData, GoogleUserData> | Response> {
        const token = event.cookies.get('google-token');
        if (!token) {
            return redirect(302, '/login');
        }

        const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        }).then((r) => r.json());

        return {
            userId: userInfo.id,
            firstName: userInfo.given_name,
            lastName: userInfo.family_name,
            // Determine user type based on Google Workspace domain
            userType: userInfo.hd === 'yourcompany.com' ? 'internal-user' : 'external-user',
            // Extract roles from Google groups or custom claims
            roles: this.extractRolesFromGoogleUser(userInfo),
            customData: {
                email: userInfo.email,
                domain: userInfo.hd // Google Workspace domain
            },
            authData: {
                accessToken: token,
                refreshToken: userInfo.refresh_token,
                expiresAt: Date.now() + 3600000 // 1 hour
            },
            features: {
                instruction: { type: 'instruction', instruction: 'You are a helpful assistant.' },
                history: { type: 'history', history: true }
            }
        };
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<GoogleAuthData, GoogleUserData>): Promise<AuthenticatedUser<GoogleAuthData, GoogleUserData> | undefined> {
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
interface SAMLAuthData {
    sessionId: string;
    assertion: string;
    expiresAt: number;
}

interface SAMLUserData {
    email: string;
    department?: string;
    organization?: string;
}

export default class SAMLAuthProvider extends AuthProvider<SAMLAuthData, SAMLUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<SAMLAuthData, SAMLUserData> | Response> {
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

    async validateUser(event: RequestEvent, user: AuthenticatedUser<SAMLAuthData, SAMLUserData>): Promise<AuthenticatedUser<SAMLAuthData, SAMLUserData> | undefined> {
        // For SAML, you might check if the session is still valid
        const sessionValid = await this.validateSAMLSession(user.authData.sessionId);

        if (sessionValid) {
            return undefined; // Session is still valid
        }

        throw new ForceUserToReauthenticateError('SAML session expired');
    }

    private createUserFromSAML(userData: any): AuthenticatedUser<SAMLAuthData, SAMLUserData> {
        return {
            userId: userData.nameId,
            firstName: userData.firstName,
            lastName: userData.lastName,
            customData: {
                email: userData.email,
                department: userData.department,
                organization: userData.organization
            },
            authData: {
                sessionId: userData.sessionId,
                assertion: userData.assertion,
                expiresAt: userData.expiresAt
            },
            features: {
                instruction: { type: 'instruction', instruction: 'You are a helpful assistant.' },
                history: { type: 'history', history: true }
            }
        };
    }
}
```

### Custom Token Validation

```typescript
// Example: JWT token validation with refresh
interface JWTAuthData {
    accessToken: string;
    refreshToken?: string;
    tokenType: string;
    expiresAt: number;
}

interface JWTUserData {
    email: string;
    scope: string[];
    accountId: string;
}

export default class JWTAuthProvider extends AuthProvider<JWTAuthData, JWTUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<JWTAuthData, JWTUserData> | Response> {
        const token = event.cookies.get('jwt-token');
        if (!token) {
            return redirect(302, '/login');
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userData = await this.getUserFromDatabase(decoded.userId);
            return this.createUserFromDatabase(userData, token);
        } catch (error) {
            // Token invalid or expired
            event.cookies.delete('jwt-token');
            throw new NotAuthenticatedError('Invalid or expired JWT token');
        }
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<JWTAuthData, JWTUserData>): Promise<AuthenticatedUser<JWTAuthData, JWTUserData> | undefined> {
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

    private createUserFromDatabase(userData: any, token: string): AuthenticatedUser<JWTAuthData, JWTUserData> {
        return {
            userId: userData.id,
            firstName: userData.firstName,
            lastName: userData.lastName,
            customData: {
                email: userData.email,
                scope: userData.scope,
                accountId: userData.accountId
            },
            authData: {
                accessToken: token,
                refreshToken: userData.refreshToken,
                tokenType: 'Bearer',
                expiresAt: userData.tokenExpiresAt
            },
            features: {
                instruction: { type: 'instruction', instruction: 'You are a helpful assistant.' },
                history: { type: 'history', history: true }
            }
        };
    }
}
```

### Multi-Tenant Authentication

```typescript
// Example: Multi-tenant authentication with organization switching
interface MultiTenantAuthData {
    accessToken: string;
    currentOrgId: string;
    availableOrgs: Array<{ id: string; name: string }>;
    userRole: string;
}

interface MultiTenantUserData {
    email: string;
    companyId: string;
    companyName: string;
    companyType: string;
}

export default class MultiTenantAuthProvider extends AuthProvider<MultiTenantAuthData, MultiTenantUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<MultiTenantAuthData, MultiTenantUserData> | Response> {
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

    async validateUser(
        event: RequestEvent,
        user: AuthenticatedUser<MultiTenantAuthData, MultiTenantUserData>
    ): Promise<AuthenticatedUser<MultiTenantAuthData, MultiTenantUserData> | undefined> {
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

    private createMultiTenantUser(userData: any, orgId: string): AuthenticatedUser<MultiTenantAuthData, MultiTenantUserData> {
        const org = userData.organizations.find((o) => o.id === orgId);
        return {
            userId: userData.id,
            firstName: userData.firstName,
            lastName: userData.lastName,
            customData: {
                email: userData.email,
                companyId: org.id,
                companyName: org.name,
                companyType: org.type
            },
            authData: {
                accessToken: userData.accessToken,
                currentOrgId: orgId,
                availableOrgs: userData.organizations.map((o) => ({ id: o.id, name: o.name })),
                userRole: org.role
            },
            features: {
                instruction: { type: 'instruction', instruction: 'You are a helpful assistant.' },
                history: { type: 'history', history: true }
            }
        };
    }
}
```

### API Key Authentication

```typescript
// Example: API key authentication for service-to-service communication
interface APIKeyAuthData {
    apiKey: string;
    serviceId: string;
    permissions: string[];
    rateLimit: number;
}

interface ServiceUserData {
    email: string;
    companyId: string;
    companyName: string;
    companyType: string;
}

export default class APIKeyAuthProvider extends AuthProvider<APIKeyAuthData, ServiceUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<APIKeyAuthData, ServiceUserData> | Response> {
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

    async validateUser(event: RequestEvent, user: AuthenticatedUser<APIKeyAuthData, ServiceUserData>): Promise<AuthenticatedUser<APIKeyAuthData, ServiceUserData> | undefined> {
        // For API keys, check if the key is still valid and not revoked
        const isValid = await this.validateAPIKey(user.authData.apiKey);

        if (!isValid) {
            throw new ForceUserToReauthenticateError('API key revoked or expired');
        }

        return undefined; // API key still valid
    }

    private createServiceUser(serviceData: any, apiKey: string): AuthenticatedUser<APIKeyAuthData, ServiceUserData> {
        return {
            userId: `service_${serviceData.id}`,
            firstName: serviceData.name,
            lastName: '',
            customData: {
                email: serviceData.email,
                companyId: serviceData.organizationId,
                companyName: serviceData.organizationName,
                companyType: 'service'
            },
            authData: {
                apiKey,
                serviceId: serviceData.id,
                permissions: serviceData.permissions,
                rateLimit: serviceData.rateLimit
            },
            features: {
                instruction: { type: 'instruction', instruction: 'You are a helpful assistant.' },
                history: { type: 'history', history: true }
            }
        };
    }
}
```

### Session-Based Authentication

```typescript
// Example: Traditional session-based authentication with Redis
interface SessionAuthData {
    sessionId: string;
    expiresAt: number;
}

interface SessionUserData {
    email: string;
    lastLogin: number;
}

export default class SessionAuthProvider extends AuthProvider<SessionAuthData, SessionUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<SessionAuthData, SessionUserData> | Response> {
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

    async validateUser(event: RequestEvent, user: AuthenticatedUser<SessionAuthData, SessionUserData>): Promise<AuthenticatedUser<SessionAuthData, SessionUserData> | undefined> {
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
interface OAuth2PKCEAuthData {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    codeVerifier: string;
}

interface OAuth2PKCEUserData {
    email: string;
    scope: string[];
}

export default class OAuth2PKCEProvider extends AuthProvider<OAuth2PKCEAuthData, OAuth2PKCEUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<OAuth2PKCEAuthData, OAuth2PKCEUserData> | Response> {
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

    async validateUser(
        event: RequestEvent,
        user: AuthenticatedUser<OAuth2PKCEAuthData, OAuth2PKCEUserData>
    ): Promise<AuthenticatedUser<OAuth2PKCEAuthData, OAuth2PKCEUserData> | undefined> {
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
interface RBACAuthData {
    accessToken: string;
    roles: string[];
    permissions: string[];
    lastRoleCheck: number;
}

interface RBACUserData {
    email: string;
    companyId: string;
    companyName: string;
    companyType: string;
}

export default class RBACAuthProvider extends AuthProvider<RBACAuthData, RBACUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<RBACAuthData, RBACUserData> | Response> {
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

    async validateUser(event: RequestEvent, user: AuthenticatedUser<RBACAuthData, RBACUserData>): Promise<AuthenticatedUser<RBACAuthData, RBACUserData> | undefined> {
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

    private createRBACUser(userData: any, token: string): AuthenticatedUser<RBACAuthData, RBACUserData> {
        return {
            userId: userData.id,
            firstName: userData.firstName,
            lastName: userData.lastName,
            customData: {
                email: userData.email,
                companyId: userData.organizationId,
                companyName: userData.organizationName,
                companyType: userData.organizationType
            },
            authData: {
                accessToken: token,
                roles: userData.roles,
                permissions: userData.permissions,
                lastRoleCheck: Date.now()
            },
            features: {
                instruction: { type: 'instruction', instruction: 'You are a helpful assistant.' },
                history: { type: 'history', history: true }
            }
        };
    }
}
```

### Two-Factor Authentication (2FA)

```typescript
// Example: Authentication with 2FA support
interface TwoFactorAuthData {
    accessToken: string;
    twoFactorToken?: string;
    twoFactorEnabled: boolean;
}

interface TwoFactorUserData {
    email: string;
    phoneNumber: string;
}

export default class TwoFactorAuthProvider extends AuthProvider<TwoFactorAuthData, TwoFactorUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<TwoFactorAuthData, TwoFactorUserData> | Response> {
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

    async validateUser(
        event: RequestEvent,
        user: AuthenticatedUser<TwoFactorAuthData, TwoFactorUserData>
    ): Promise<AuthenticatedUser<TwoFactorAuthData, TwoFactorUserData> | undefined> {
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
interface WebhookAuthData {
    webhookId: string;
    signature: string;
    timestamp: number;
}

interface WebhookUserData {
    sourceSystem: string;
    accountId: string;
}

export default class WebhookAuthProvider extends AuthProvider<WebhookAuthData, WebhookUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticatedUser<WebhookAuthData, WebhookUserData> | Response> {
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

    async validateUser(event: RequestEvent, user: AuthenticatedUser<WebhookAuthData, WebhookUserData>): Promise<AuthenticatedUser<WebhookAuthData, WebhookUserData> | undefined> {
        // For webhook-based auth, check if the webhook session is still valid
        const isValid = await this.validateWebhookSession(user.authData.webhookId);

        if (!isValid) {
            throw new ForceUserToReauthenticateError('Webhook session expired');
        }

        return undefined; // Webhook session still valid
    }
}
```

### Best Practices for Access Control

**User Types:**

- Use clear, consistent logic to determine user types (e.g., email domain, explicit user properties)
- Document your user type assignment rules for your team
- Consider edge cases (e.g., contractors, partners) and how they should be classified
- Test access restrictions thoroughly for both user types

**Roles:**

- Only assign `pika:content-admin` to trusted administrators who need debugging access
- Use descriptive names for custom roles that clearly indicate their purpose
- Avoid roles starting with `pika:` for custom business logic
- Consider implementing role hierarchies in your business logic
- Document what each custom role represents for future development

**Security Considerations:**

- Validate user types and roles from your auth provider rather than trusting client data
- Implement proper authorization checks on the server side
- Log role assignments and changes for audit purposes
- Regularly review and audit admin role assignments

## Best Practices

### 1. Error Handling

Always handle authentication errors gracefully. When extending `AuthProvider<T, U>`, your methods are already properly typed:

```typescript
async validateUser(event: RequestEvent, user: AuthenticatedUser<T, U>): Promise<AuthenticatedUser<T, U> | undefined> {
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
2. **Type errors with generics**: Common mistake - do NOT declare your own generic parameters:

    ```typescript
    // ❌ WRONG - Don't redeclare generics
    export default class MyProvider<MyAuthData, MyCustomData> extends AuthProvider {

    // ✅ CORRECT - Use your concrete types
    export default class MyProvider extends AuthProvider<MyAuthData, MyCustomData> {
    ```

3. **Type errors**: Make sure your auth data types match your interface definitions
4. **Redirect loops**: Check your authentication logic
5. **Cookie issues**: Verify cookie settings and domain configuration

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
