---
title: Authentication
description: Complete guide to implementing custom authentication in Pika Framework
outline: [2, 3]
---

This guide explains how to implement custom authentication in your Pika project using the authentication customization extension point.

## Overview

Pika Framework provides a flexible authentication system that allows you to implement your own authentication logic while maintaining the framework's user management and chat functionality. Your custom authentication code is protected from framework updates and can handle complex flows like OAuth, SSO, and custom auth providers.

## Critical Security Warning

:::warning[Critical Security Warning]
**THE DEFAULT MOCK AUTHENTICATION IS NOT SECURE**

Pika Framework ships with a **default mock authentication provider** that:

- **Hardcodes a single test user** (`userId: '123', firstName: 'Test', lastName: 'User'`)
- **Requires no password or validation** - anyone visiting your site is automatically authenticated
- **Does not assign a `userType`** - this can cause security issues with chat app access control
- **Returns the same mock user for every request**
  :::

### Production Deployment Requirements

:::caution[Before Deploying Publicly, You Must]

1. **Replace the mock provider** with your own authentication implementation
2. **Assign proper `userType` values** (`internal-user` or `external-user`) to all users
3. **Configure `userTypesAllowed`** on all chat apps to control access
4. **Test authentication flows** thoroughly in staging environment
   :::

### Security Risk

The mock provider creates a significant security vulnerability:

<Tabs activeName="Insecure Mock">
  <TabPanel name="Insecure Mock">

```js
// CURRENT MOCK PROVIDER - INSECURE
async authenticate(_event: RequestEvent): Promise<AuthenticatedUser<MockAuthData, MockCustomData>> {
    return {
        userId: '123',
        firstName: 'Test',
        lastName: 'User',
        userType: 'internal-user', // marked as internal user for development
        // No actual authentication - anyone can access!
        // ... rest of user data
    };
}
```

  </TabPanel>
  <TabPanel name="Secure Custom">

```js
// SECURE CUSTOM PROVIDER
async authenticate(event: RequestEvent): Promise<AuthenticatedUser<AuthData, CustomData>> {
    const token = this.extractAuthToken(event);
    if (!token) {
        throw new NotAuthenticatedError('No valid token');
    }

    // Validate real user credentials
    const userData = await this.validateTokenWithProvider(token);
    return this.createAuthenticatedUser(userData, token);
}
```

  </TabPanel>
</Tabs>

## Understanding User Data Types

The framework uses a two-tier data structure to separate authentication data from business data:

### AuthenticatedUser&lt;T, U&gt;

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

### ChatUser &lt;T&gt;

- **T (Custom Data)**: Same as the U type in `AuthenticatedUser&lt; T, U&gt;`
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

<Tabs activeName="Internal Only">
  <TabPanel name="Internal Only">

```js
// Chat app only for internal users
const internalChatApp: ChatApp = {
    chatAppId: 'internal-support',
    title: 'Internal Support Chat',
    userTypesAllowed: ['internal-user'] // Only internal users can access
    // ... other properties
};
```

  </TabPanel>
  <TabPanel name="External Only">

```js
// Chat app only for external users
const externalChatApp: ChatApp = {
    chatAppId: 'customer-support',
    title: 'Customer Support',
    userTypesAllowed: ['external-user'] // Only external users can access
    // ... other properties
};
```

  </TabPanel>
  <TabPanel name="Both Types">

```js
// Chat app for all users (explicit configuration)
const publicChatApp: ChatApp = {
    chatAppId: 'general-support',
    title: 'General Support',
    userTypesAllowed: ['internal-user', 'external-user'] // Both can access
    // ... other properties
};
```

  </TabPanel>
</Tabs>

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

### Implementation Examples

Here are practical examples of how to implement user type and role logic in your authentication provider:

<Tabs activeName="User Type Logic">
  <TabPanel name="User Type Logic">

```js
// Example: Determine user type based on email domain
function determineUserType(email: string, userData: any): UserType {
    const companyDomains = ['yourcompany.com', 'corp.yourcompany.com'];
    const emailDomain = email.split('@')[1];

    if (companyDomains.includes(emailDomain)) {
        return 'internal-user';
    }
    return 'external-user';
}
```

  </TabPanel>
  <TabPanel name="Role Extraction">

```js
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
    }

    return roles;
}
```

  </TabPanel>
  <TabPanel name="Complete Example">

```js
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

  </TabPanel>
</Tabs>

### Chat App Access Control

Here's how to configure chat apps with user type restrictions:

<Tabs activeName="Employee Support">
  <TabPanel name="Employee Support">

```js
// Internal-only chat app for employee support
const employeeChatApp: ChatApp = {
    chatAppId: 'employee-support',
    title: 'Employee IT Support',
    userTypesAllowed: ['internal-user'], // Only employees can access
    agentId: 'internal-support-agent',
    mode: 'standalone',
    enabled: true
    // ... other properties
};
```

  </TabPanel>
  <TabPanel name="Customer Support">

```js
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
```

  </TabPanel>
  <TabPanel name="Admin Debug">

```js
// Admin chat app for debugging (accessible to content admins only)
const adminChatApp: ChatApp = {
    chatAppId: 'admin-debug',
    title: 'Admin Debug Chat',
    // No userTypesAllowed restriction, but features will check for pika:content-admin role
    agentId: 'debug-agent',
    mode: 'standalone',
    enabled: true,
    features: {
        traces: {
            featureId: 'traces',
            enabled: true,
            userRoles: ['pika:content-admin'],
            detailedTraces: {
                enabled: true,
                userRoles: ['pika:content-admin']
            }
        }
    }
    // ... other properties
};
```

  </TabPanel>
</Tabs>

:::info[Learn More]
For comprehensive access control information, see the [Chat App Access Control Guide](/docs/developer/chat-app-access-control/) for detailed explanations of all access rules, precedence order, override systems, and troubleshooting.
:::

## Production Deployment Checklist

Before deploying to production, ensure:

|     | Security Requirement                             | Why It Matters                  |
| --- | ------------------------------------------------ | ------------------------------- |
|     | Custom auth provider implemented                 | Mock provider has no security   |
|     | All users have `userType` assigned               | Controls chat app access        |
|     | Chat apps have `userTypesAllowed` configured     | Prevents unauthorized access    |
|     | Internal tools restricted to `['internal-user']` | Protects admin functionality    |
|     | Customer-facing apps restricted appropriately    | Data privacy and access control |

### User Type Quick Guide

<Tabs activeName="Internal User">
  <TabPanel name="Internal User">

```js
// User type assignment for company employees
const user: AuthenticatedUser = {
    // ... other fields
    userType: 'internal-user', // Company employees, staff, admins
};
```

  </TabPanel>
  <TabPanel name="External User">

```js
// User type assignment for customers
const user: AuthenticatedUser = {
    // ... other fields
    userType: 'external-user' // Customers, partners, external users
};
```

  </TabPanel>
</Tabs>

### Chat App Access Control

<Tabs activeName="Internal Only">
  <TabPanel name="Internal Only">

```js
// Restrict to internal users only (admin tools, employee resources)
const internalApp: ChatApp = {
    chatAppId: 'admin-dashboard',
    title: 'Admin Dashboard',
    userTypesAllowed: ['internal-user'] // Only internal users
};
```

  </TabPanel>
  <TabPanel name="External Only">

```js
// Restrict to external users only (customer support, public services)
const externalApp: ChatApp = {
    chatAppId: 'customer-support',
    title: 'Customer Support',
    userTypesAllowed: ['external-user'] // Only external users
};
```

  </TabPanel>
  <TabPanel name="Both Types">

```js
// Allow both user types (general purpose, shared resources)
const sharedApp: ChatApp = {
    chatAppId: 'general-chat',
    title: 'General Chat'
    // No userTypesAllowed = accessible to both types
};
```

  </TabPanel>
</Tabs>

### Common Security Mistakes

Bad Patterns to Avoid

<Tabs activeName="Missing UserType">
  <TabPanel name="Missing UserType">

```js
// Missing userType assignment defaults to internal
const user: AuthenticatedUser = {
    userId: 'user123',
    firstName: 'John',
    lastName: 'Doe'
    // Missing userType = defaults to internal
};
```

  </TabPanel>
  <TabPanel name="Open Admin Tools">

```js
// Admin tools default to only internal users if not specified
const adminTools: ChatApp = {
    chatAppId: 'admin-tools',
    title: 'Admin Tools'
    // Missing userTypesAllowed means only internal users may access (note will still need correct permissions on user account)
};
```

  </TabPanel>
  <TabPanel name="Data Exposure">
  
```js
const customerApp: ChatApp = {
    chatAppId: 'customer-data',
    title: 'Customer Portal'
    // Missing userType = defaults to internal
};
```

  </TabPanel>
</Tabs>

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

The Pika authentication system uses TypeScript generics to provide type safety while allowing flexibility in your authentication data structure.

### AuthProvider&lt;T, U&gt; Generic Parameters

When creating your authentication provider, you must extend `AuthProvider&lt;T, U&gt;` where:

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

<Tabs activeName="Type Definitions">
  <TabPanel name="Type Definitions">

```js
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
```

  </TabPanel>
  <TabPanel name="Provider Implementation">

```js
// Properly typed provider
export default class MyAuthProvider extends AuthProvider<MyAuthData, MyCustomData> {
    // Methods are automatically typed with your specific types
    async authenticate(event: RequestEvent): Promise<AuthenticateResult<MyAuthData, MyCustomData>> {
        // Implementation
    }
}
```

  </TabPanel>
</Tabs>

### Type Safety Benefits

- **Compile-time checking**: TypeScript ensures your auth data structure matches throughout your code
- **IntelliSense support**: IDEs provide accurate autocomplete for your specific auth data fields
- **Refactoring safety**: Changes to your auth data types are caught at compile time
- **Clear contracts**: The generic system makes it explicit what data is available where

## Entity-Based Access Control Integration

### Overview

The Pika framework provides entity-based access control through the dedicated Entity feature. This enables sophisticated access control where specific accounts, companies, or organizations can be granted or denied access to individual chat apps.

### Entity Feature Configuration

Entity-based access control is configured declaratively in your `pika-config.ts`:

```js
export const pikaConfig: PikaConfig = {
    siteFeatures: {
        entity: {
            enabled: true,
            attributeName: 'accountId', // Field in user.customData containing entity identifier
            searchPlaceholderText: 'Search for an account...',
            displayNameSingular: 'Account',
            displayNamePlural: 'Accounts',
            tableColumnHeaderTitle: 'Account ID'
        }
    }
};
```

The `attributeName` field specifies which field in the user's `customData` should be used to match against entity access control lists defined in chat app overrides.

### How Entity Matching Works

1. **Entity Feature Setup**: Configure the `attributeName` in your entity feature settings (e.g., `'accountId'`)
2. **Chat App Override Configuration**: Admins can configure exclusive access lists for chat apps
3. **Access Check**: Framework extracts the entity value from user's `customData` using the configured `attributeName` and checks against allowed entities
4. **Access Granted/Denied**: User gains access only if their entity is in the allowed list

### Implementation Examples

<Tabs activeName="Simple Matching">
  <TabPanel name="Simple Matching">

```js
// Entity feature configuration:
entity: {
    enabled: true,
    attributeName: 'accountId', // Will match against user's customData.accountId
    // ... other config
}

// User's customData: { accountId: 'acct_123', email: 'user@company.com' }
// Chat app override allows: ['acct_123', 'acct_456']
// Result: User granted access because 'acct_123' is in the allowed list
```

  </TabPanel>
  <TabPanel name="Nested Fields">

```js
// Entity feature configuration:
entity: {
    enabled: true,
    attributeName: 'company.id', // Will match against user's customData.company.id
    // ... other config
}

// User's customData: { company: { id: 'comp_789', name: 'Acme Corp' }, role: 'admin' }
// Chat app override allows: ['comp_789', 'comp_101']
// Result: User granted access because 'comp_789' is in the allowed list
```

  </TabPanel>
</Tabs>

### Access Control Precedence

When chat app overrides are configured, the system follows this precedence:

1. **Disabled Chat App**: If override sets `enabled: false`, no access regardless of other rules
2. **Exclusive User ID Control**: If `exclusiveUserIdAccessControl` is set, only those specific user IDs have access
3. **Exclusive Entity Control**:
    - For internal users: Check `exclusiveInternalAccessControl` against user's entity
    - For external users: Check `exclusiveExternalAccessControl` against user's entity
4. **General Access Rules**: Fall back to standard `userTypes`/`userRoles` checking

### Complete Implementation Example

```js
interface CompanyAuthData {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

interface CompanyCustomData {
    email: string;
    companyId: string;
    accountId: string;
    department: string;
}

export default class CompanyAuthProvider extends AuthProvider<CompanyAuthData, CompanyCustomData> {
    async authenticate(event: RequestEvent): Promise<AuthenticateResult<CompanyAuthData, CompanyCustomData>> {
        // Your authentication logic here
        const token = this.extractToken(event);
        const userData = await this.getUserData(token);

        return {
            authenticatedUser: {
                userId: userData.id,
                firstName: userData.firstName,
                lastName: userData.lastName,
                userType: userData.isEmployee ? 'internal-user' : 'external-user',
                customData: {
                    email: userData.email,
                    companyId: userData.companyId,
                    accountId: userData.accountId, // This will be used for entity matching when configured in entity.attributeName
                    department: userData.department
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
            }
        };
    }

    // Optional: Display the current account context to users
    async getCustomDataUiRepresentation(user: AuthenticatedUser<CompanyAuthData, CompanyCustomData>, chatAppId?: string): Promise<CustomDataUiRepresentation | undefined> {
        const accountId = user.customData?.accountId;
        if (!accountId) return undefined;

        // Fetch account details for display
        const accountDetails = await this.getAccountDetails(accountId);

        return {
            title: 'Current Account',
            value: `${accountDetails.name} (${accountId})`
        };
    }
}
```

### Use Cases for Entity-Based Access Control

<Tabs activeName="Multi-Tenant SaaS">
  <TabPanel name="Multi-Tenant SaaS">

```js
// Different customers can only access their own support chat
// customData: { customerId: 'customer_123' }
// Chat app override: exclusiveExternalAccessControl: ['customer_123', 'customer_456']
```

  </TabPanel>
  <TabPanel name="Partner Portal">

```js
// Different partners have access to different tools
// customData: { partnerId: 'partner_gold' }
// Chat app override: exclusiveExternalAccessControl: ['partner_gold', 'partner_platinum']
```

  </TabPanel>
  <TabPanel name="Department Tools">

```js
// Internal users from specific departments
// customData: { department: 'engineering', companyId: 'acme_corp' }
// Chat app override: exclusiveInternalAccessControl: ['engineering', 'product']
```

  </TabPanel>
  <TabPanel name="Account Access">

```js
// External users representing specific accounts
// customData: { accountId: 'enterprise_client_1' }
// Chat app override: exclusiveExternalAccessControl: ['enterprise_client_1', 'enterprise_client_2']
```

  </TabPanel>
</Tabs>

### Security Considerations

- **Data Validation**: Always validate that the custom data field exists and contains expected values
- **Field Accessibility**: Ensure the specified field path is always populated for users who need entity-based access
- **Logging**: Log entity matching decisions for audit trails
- **Fallback Behavior**: Consider what happens when entity data is missing or invalid

## Complete Working Example

:::tip[Working Example Available]
A fully functional authentication provider example is included at `apps/pika-chat/src/lib/server/auth-provider/custom-example.ts`. This example demonstrates:

- **Time-based validation** (validates only every 5 minutes for performance)
- **Multi-endpoint fallback** (tries admin and regular endpoints)
- **Comprehensive error handling** and logging
- **Generic, customizable structure** for any HTTP-based auth system
- **Cookie management** and redirect handling

To use this example:

1. Copy the contents of `custom-example.ts`
2. Paste into your `index.ts` file
3. Customize the URLs, types, and business logic for your auth provider
4. Update the user lookup mechanism (database or API)
   :::

## Implementation Steps

### 1. Create the Custom Auth Provider Directory

The customization directory should already exist, but if not:

```bash
mkdir -p apps/pika-chat/src/lib/server/auth-provider
```

### 2. Define Your Auth and Custom Data Types

Create type definitions for your authentication data and custom user data:

```js
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

:::important[Implementation Note]
Use `extends AuthProvider<YourAuthType, YourCustomType>` not `implements AuthProvider`.
:::

```js
// apps/pika-chat/src/lib/server/auth-provider/index.ts
import type { RequestEvent } from '@sveltejs/kit';
import type { AuthenticatedUser } from 'pika-shared/types/chatbot/chatbot-types';
import { AuthProvider, NotAuthenticatedError, ForceUserToReauthenticateError } from '../auth/types';
import { redirect } from '@sveltejs/kit';
import type { YourCustomAuthData, YourCustomUserData } from './types';

export default class YourAuthProvider extends AuthProvider<YourCustomAuthData, YourCustomUserData> {
    async authenticate(event: RequestEvent): Promise<AuthenticateResult<YourCustomAuthData, YourCustomUserData>> {
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
            return { redirectTo: redirect(302, '/login') };
        }

        try {
            // Validate token and get user data
            const userData = await this.getUserFromAuthProvider(authToken);
            const user = this.createAuthenticatedUser(userData, authToken);
            return { authenticatedUser: user };
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

    // Additional helper methods would go here...
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

### The addValueToLocalsForRoute Method

Your auth provider can implement the optional `addValueToLocalsForRoute` method to pass data to the client-side authentication route:

```js
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

<Tabs activeName="OAuth Provider">
  <TabPanel name="OAuth Provider">

```js
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
    async authenticate(event: RequestEvent): Promise<AuthenticateResult<OAuthClientAuthData, OAuthClientUserData>> {
        // Check if this is a callback from client-side auth
        const authCode = event.url.searchParams.get('auth_code');
        if (authCode) {
            const tokens = await this.exchangeCodeForTokens(authCode);
            const userData = await this.getUserFromProvider(tokens.access_token);
            const user = this.createAuthenticatedUser(userData, tokens);
            return { authenticatedUser: user };
        }

        // Check for existing token
        const token = event.cookies.get('oauth-token');
        if (token) {
            try {
                const userData = await this.getUserFromProvider(token);
                const user = this.createAuthenticatedUser(userData, { access_token: token });
                return { authenticatedUser: user };
            } catch (error) {
                event.cookies.delete('oauth-token');
            }
        }

        // No valid token found - redirect to client-side auth
        return { redirectTo: redirect(302, '/auth/client-auth') };
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
}
```

  </TabPanel>
  <TabPanel name="Client Page Server">

```js
// +page.server.ts
import { type RequestEvent } from '@sveltejs/kit';

export async function load(event: RequestEvent): Promise<{ customData: Record<string, unknown> | undefined }> {
    return { customData: event.locals.customData };
}
```

  </TabPanel>
  <TabPanel name="Client Page Component">

```js title="+page.svelte"
&lt;script lang="ts"&gt;
    import { page } from '$app/stores';
    import { onMount } from 'svelte';

    const { data } = $page.data;
    const customData = data.customData;

    onMount(() => {
        if (customData) {
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

        window.location.href = authUrl.toString();
    }

    function generateRandomState(): string {
        return Math.random().toString(36).substring(2, 15);
    }
&lt;/script&gt;

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

  </TabPanel>
</Tabs>

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

:::tip[Working Example Reference]
Before reviewing these examples, check out the complete working example at `apps/pika-chat/src/lib/server/auth-provider/custom-example.ts` which includes time-based validation and multi-endpoint fallback patterns you can copy directly.
:::

<Expansion title="OAuth Provider Integration">

```js
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
    async authenticate(event: RequestEvent): Promise<AuthenticateResult<GoogleAuthData, GoogleUserData>> {
        const token = event.cookies.get('google-token');
        if (!token) {
            return { redirectTo: redirect(302, '/login') };
        }

        const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        }).then((r) => r.json());

        const user = {
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

        return { authenticatedUser: user };
    }

    async validateUser(event: RequestEvent, user: AuthenticatedUser<GoogleAuthData, GoogleUserData>): Promise<AuthenticateResult<GoogleAuthData, GoogleUserData> | undefined> {
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

</Expansion>

<Expansion title="SAML SSO Integration">

```js
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
    async authenticate(event: RequestEvent): Promise<AuthenticateResult<SAMLAuthData, SAMLUserData>> {
        const samlResponse = event.url.searchParams.get('SAMLResponse');
        if (samlResponse) {
            const userData = await this.validateSAMLResponse(samlResponse);
            const user = this.createUserFromSAML(userData);
            return { authenticatedUser: user };
        }

        // Check for existing session
        const sessionId = event.cookies.get('saml-session');
        if (sessionId) {
            const userData = await this.getUserFromSession(sessionId);
            const user = this.createUserFromSAML(userData);
            return { authenticatedUser: user };
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

</Expansion>

<Expansion title="JWT Token Validation">

```js
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
    async authenticate(event: RequestEvent): Promise<AuthenticateResult<JWTAuthData, JWTUserData>> {
        const token = event.cookies.get('jwt-token');
        if (!token) {
            return { redirectTo: redirect(302, '/login') };
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userData = await this.getUserFromDatabase(decoded.userId);
            const user = this.createUserFromDatabase(userData, token);
            return { authenticatedUser: user };
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

</Expansion>

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

```js
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

```js
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

```js
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

<Tabs activeName="Correct">
  <TabPanel name="Correct">

```js
// CORRECT - Use your concrete types
export default class MyProvider extends AuthProvider<MyAuthData, MyCustomData> {
```

  </TabPanel>
  <TabPanel name="Wrong">

```js
// WRONG - Don't redeclare generics
export default class MyProvider<MyAuthData, MyCustomData> extends AuthProvider {
```

  </TabPanel>
</Tabs>

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
