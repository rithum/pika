# Site Admin Feature

The Site Admin feature provides a web-based interface for users with administrative privileges to manage chat app access control, entity-based restrictions, and override settings. This feature enables fine-grained control over who can access which chat applications without requiring code deployments.

## Overview

When enabled, this feature provides:

- **Chat App Override Management**: Create, modify, and delete access control overrides for individual chat apps
- **Entity-Based Access Control**: Configure which accounts, companies, or organizations can access specific chat apps
- **User ID Access Control**: Grant access to specific individual users by their user ID
- **Home Page Visibility Control**: Configure which chat apps appear on the home page for different user types
- **Access Rule Management**: Fine-tune user type and role-based access rules per chat app
- **Web Interface**: User-friendly interface for non-technical administrators
- **API Access**: REST endpoints for programmatic management

## Use Cases

Common scenarios where this feature is valuable:

- **Multi-Tenant SaaS**: Restricting customer chat apps to specific customer accounts
- **Partner Portals**: Giving different partner tiers access to different functionality
- **Department Restrictions**: Limiting internal tools to specific departments or teams
- **Beta Testing**: Rolling out new features to specific user groups
- **Compliance Requirements**: Meeting regulatory requirements for data access segregation
- **Customer Onboarding**: Gradually enabling features for new customers
- **Emergency Access Control**: Quickly restricting access during security incidents

## Configuration

### 1. Enable the Feature

In your `pika-config.ts`, enable the site admin feature:

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        siteAdmin: {
            websiteEnabled: true
        }
    }
};
```

### 2. Grant Admin Role

Site admin users must have the `pika:site-admin` role assigned. This is done differently depending on your authentication provider:

#### Option A: Database Assignment

Manually add the role in the DynamoDB table:

1. Open the AWS Console and navigate to DynamoDB
2. Find the table named `chat-users-{your-stack-name}`
3. Locate the user record by `userId`
4. Add `pika:site-admin` to the `roles` array field
5. Save the changes

**Example DynamoDB record:**

```json
{
    "userId": "admin_user_123",
    "firstName": "Admin",
    "lastName": "User",
    "userType": "internal-user",
    "roles": ["pika:site-admin", "other-role"],
    "customData": { ... }
}
```

#### Option B: Authentication Provider Assignment

Automatically assign the role in your authentication provider:

```typescript
// In your custom authentication provider
private createAuthenticatedUser(userData: any, token: string): AuthenticatedUser<MyAuthData, MyCustomData> {
    const roles: string[] = [];

    // Add site admin role for specific users
    if (userData.isSiteAdmin || userData.permissions?.includes('site_admin')) {
        roles.push('pika:site-admin');
    }

    // Add other business roles
    roles.push(...userData.businessRoles);

    return {
        userId: userData.id,
        firstName: userData.firstName,
        lastName: userData.lastName,
        userType: userData.isEmployee ? 'internal-user' : 'external-user',
        roles,
        // ... other user data
    };
}
```

### 3. Access the Interface

Once configured and the role is assigned:

1. Log in to your Pika Chat application
2. Users with `pika:site-admin` role will see additional administrative options
3. Navigate to the site admin interface (exact location depends on your UI implementation)

## Access Control System

### Access Control Precedence

The site admin feature implements a sophisticated access control system with the following precedence:

1. **Disabled Override**: If `enabled: false` is set in the override, no access regardless of other rules
2. **Exclusive User ID Control**: If `exclusiveUserIdAccessControl` is configured, only those specific user IDs have access
3. **Exclusive Entity Control**: Based on user type:
    - Internal users: Check against `exclusiveInternalAccessControl` list
    - External users: Check against `exclusiveExternalAccessControl` list
4. **General Access Rules**: Fall back to `userTypes`/`userRoles` checking

### Entity-Based Access Control

Entity-based access control allows you to restrict chat apps to specific accounts, companies, or organizations. This works in conjunction with your authentication provider's entity mapping.

**Setup Requirements:**

1. **Authentication Provider Integration**: Your auth provider must implement `getCustomDataFieldPathToMatchUsersEntity()`
2. **Entity Field Population**: Users must have the entity identifier in their `customData`
3. **Override Configuration**: Site admins configure which entities are allowed

**Example Configuration:**

```typescript
// Authentication provider specifies entity field
async getCustomDataFieldPathToMatchUsersEntity(): Promise<string> {
    return 'accountId'; // or 'company.id', 'organization.externalId', etc.
}

// User's customData contains the entity identifier
{
    userId: 'user_123',
    customData: {
        accountId: 'enterprise_account_1',
        email: 'user@enterprise.com'
    }
}

// Site admin configures override
{
    enabled: true,
    exclusiveExternalAccessControl: [
        'enterprise_account_1',
        'enterprise_account_2',
        'premium_account_5'
    ]
}
```

## Chat App Override Management

### Override Types

The site admin interface supports several types of access control overrides:

#### 1. Enable/Disable Override

```typescript
// Completely disable a chat app
{
    enabled: false;
}

// Re-enable a disabled chat app
{
    enabled: true;
}
```

#### 2. User ID Access Control

```typescript
// Restrict to specific user IDs (overrides all other rules)
{
    enabled: true,
    exclusiveUserIdAccessControl: [
        'beta_tester_1',
        'beta_tester_2',
        'product_manager_123'
    ]
}
```

#### 3. Entity-Based Access Control

```typescript
// Restrict external users to specific entities
{
    enabled: true,
    exclusiveExternalAccessControl: [
        'customer_account_1',
        'customer_account_2'
    ],
    exclusiveInternalAccessControl: [
        'support_department',
        'customer_success_team'
    ]
}
```

#### 4. Enhanced User Type/Role Rules

```typescript
// Override default access rules
{
    enabled: true,
    userTypes: ['internal-user'],
    userRoles: ['admin', 'support-agent'],
    applyRulesAs: 'or' // User needs userType OR userRole
}
```

#### 5. Home Page Visibility Control

```typescript
// Control home page visibility separately from access
{
    enabled: true,
    userTypes: ['internal-user', 'external-user'],
    homePageFilterRules: [
        {
            userTypes: ['internal-user'],
            chatAppUserTypes: ['internal-user'] // Only show to internal users on home page
        }
    ]
}
```

### Common Override Scenarios

#### Scenario 1: Customer-Specific Chat App

```typescript
// A chat app that should only be accessible to specific customer accounts
const customerSupportOverride = {
    enabled: true,
    exclusiveExternalAccessControl: ['enterprise_customer_1', 'enterprise_customer_2', 'premium_customer_gold'],
    exclusiveInternalAccessControl: ['customer_success', 'enterprise_support']
};
```

#### Scenario 2: Beta Feature Rollout

```typescript
// A new feature being tested with specific users
const betaFeatureOverride = {
    enabled: true,
    exclusiveUserIdAccessControl: ['user_product_manager', 'user_lead_developer', 'user_qa_lead', 'user_beta_customer_1']
};
```

#### Scenario 3: Department-Specific Tool

```typescript
// An internal tool only for specific departments
const hrToolOverride = {
    enabled: true,
    userTypes: ['internal-user'],
    exclusiveInternalAccessControl: ['human_resources', 'executive_team'],
    homePageFilterRules: [
        {
            userTypes: ['internal-user'],
            chatAppUserTypes: ['internal-user']
        }
    ]
};
```

## Troubleshooting

### Common Issues

**Site Admin Interface Not Visible:**

- Verify the feature is enabled in `pika-config.ts`
- Check that user has `pika:site-admin` role assigned
- Confirm user is logged in with proper authentication

**Entity-Based Access Not Working:**

- Verify authentication provider implements `getCustomDataFieldPathToMatchUsersEntity()`
- Check that users have the entity field populated in `customData`
- Ensure entity values in override match exactly with user data

**Overrides Not Taking Effect:**

- Check override precedence rules (user ID > entity > general rules)
- Verify override is properly saved to database
- Test with different users to isolate the issue

## Related Features

- **[Authentication Guide](./authentication.md)**: How to implement entity-based access control in your auth provider
- **[User Data Override Feature](./overriding-user-data.md)**: Allows users to override their own data for testing
- **[Content Admin Feature](./content-admin.md)**: Allows admins to view other users' chat content
- **[Overriding Features Guide](./overriding-features.md)**: How individual chat apps can override site-level features

---

**Need more help?** Check the [Troubleshooting Guide](./troubleshooting.md) or review the [Customization Guide](./customization.md) for advanced configuration options.
