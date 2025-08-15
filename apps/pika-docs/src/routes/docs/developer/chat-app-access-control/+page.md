---
title: Chat App Access Control
description: Imported from docs/developer/chat-app-access-control.md
outline: [2, 3]
---

This guide explains how chat app access control works in Pika, including all the rules and their precedence order. Understanding these rules is crucial for securing your chat applications and ensuring the right users have access to the right features.

## Overview

Pika uses a **secure-by-default** access control system where:

- **Explicit Configuration Required**: Chat apps and features without explicit access rules deny access to all users
- **Hierarchical Precedence**: Rules are evaluated in a specific order with higher precedence rules overriding lower ones
- **Granular Control**: Fine-tune access based on user types, roles, entities, and specific user IDs
- **Admin Override Power**: Site administrators can override any chat app's access settings

## Core Access Control Principles

### 1. Secure by Default

**Critical Concept:** `enabled: true` does NOT mean users can access the feature. You must also specify `userTypes` or `userRoles`.

```js
// NO ACCESS - enabled: true but no access control
const restrictedApp: ChatApp = {
    chatAppId: 'admin-tools',
    title: 'Admin Tools',
    enabled: true
    // Missing userTypes/userRoles = NO ACCESS TO ANYONE
    // Will show as "disabled" in UI despite enabled: true
};

// ACCESSIBLE - Both enabled and access control specified
const accessibleApp: ChatApp = {
    chatAppId: 'customer-support',
    title: 'Customer Support',
    enabled: true,
    userTypes: ['external-user'] // Only external users can access
};
```

### 2. User Types

- **`internal-user`**: Company employees, administrators, internal staff
- **`external-user`**: Customers, partners, external users
- **Default Assignment**: Users without a `userType` are treated as `external-user`

### 3. User Roles

- **Pika Roles**: `pika:content-admin`, `pika:site-admin` (framework-defined)
- **Custom Roles**: Any string you define for your business logic
- **Multiple Roles**: Users can have multiple roles assigned

## Access Control Rules by Precedence

### Level 1: Chat App Enabled/Disabled

```js
// First check: Is the chat app enabled?
if (!chatApp.enabled) {
    return DENY_ACCESS; // Disabled apps deny all access
}
```

### Access Rule Normalization

Before applying access rules, the system automatically normalizes common configuration patterns:

- **Empty `userRoles` array with populated `userTypes`**: If `userTypes` is set but `userRoles` is an empty array `[]`, the system treats `userRoles` as `undefined` (no role restrictions)
- **Empty `userTypes` array with populated `userRoles`**: If `userRoles` is populated but `userTypes` is undefined or empty, the system treats `userTypes` as `undefined` (no type restrictions)

This prevents common configuration mistakes where an empty array accidentally blocks all access.

### Level 2: Override Rules (If Present)

When a `ChatAppOverride` exists, it takes complete precedence over the base chat app settings.

#### 2a. Override Enabled/Disabled

```js
if (override.enabled === false) {
    return DENY_ACCESS; // Override can disable an enabled app
}
```

#### 2b. Exclusive User ID Control (Highest Priority Override)

```js
if (override.exclusiveUserIdAccessControl?.length > 0) {
    return override.exclusiveUserIdAccessControl.includes(user.userId) ? ALLOW_ACCESS : DENY_ACCESS;
}
```

**Example:**

```js
const betaTestOverride = {
    enabled: true,
    exclusiveUserIdAccessControl: ['user_123', 'user_456', 'user_789']
    // ONLY these 3 users can access this chat app
    // All other rules are ignored
};
```

#### 2c. Exclusive Entity Access Control (Second Priority Override)

```js
// Check entity-based access for the user's type
const userType = user.userType ?? 'external-user';
const accessList = userType === 'internal-user' ? override.exclusiveInternalAccessControl : override.exclusiveExternalAccessControl;

if (accessList?.length > 0) {
    const userEntity = extractEntityFromCustomData(user.customData);
    return accessList.includes(userEntity) ? ALLOW_ACCESS : DENY_ACCESS;
}
```

**Example:**

```js
const enterpriseOverride = {
    enabled: true,
    exclusiveExternalAccessControl: ['enterprise_account_1', 'enterprise_account_2'],
    exclusiveInternalAccessControl: ['customer_success', 'enterprise_support']
    // External users: Only from specified accounts
    // Internal users: Only from specified departments
};
```

#### 2d. Override General Access Rules (Fallback)

If no exclusive rules apply, use the override's `userTypes`, `userRoles`, and `applyRulesAs`.

### Level 3: Base Chat App Rules

If no override exists, use the chat app's base `userTypes`, `userRoles`, and `applyRulesAs`.

### Level 4: General Access Rule Logic

```js
function checkGeneralAccessRules(user, rules) {
    const { enabled, userTypes, userRoles, applyRulesAs = 'and' } = rules;

    // Feature must be enabled
    if (!enabled) return false;

    // SECURE BY DEFAULT: No rules = no access
    if (!userTypes && !userRoles) return false;

    // Check user type match
    const userTypeMatches = userTypes ? userTypes.includes(user.userType ?? 'external-user') : true;

    // Check user role match
    const userRoleMatches = userRoles ? (user.roles ?? []).some((role) => userRoles.includes(role)) : true;

    // Apply combination logic
    return applyRulesAs === 'and' ? userTypeMatches && userRoleMatches : userTypeMatches || userRoleMatches;
}
```

## Configuration Examples

### 1. Basic User Type Access

```js
// Internal users only
const internalApp: ChatApp = {
    chatAppId: 'employee-portal',
    title: 'Employee Portal',
    enabled: true,
    userTypes: ['internal-user']
};

// External users only
const customerApp: ChatApp = {
    chatAppId: 'customer-support',
    title: 'Customer Support',
    enabled: true,
    userTypes: ['external-user']
};

// Both user types
const sharedApp: ChatApp = {
    chatAppId: 'general-chat',
    title: 'General Chat',
    enabled: true,
    userTypes: ['internal-user', 'external-user']
};
```

### 2. Role-Based Access

```js
// Admin users only
const adminApp: ChatApp = {
    chatAppId: 'admin-dashboard',
    title: 'Admin Dashboard',
    enabled: true,
    userRoles: ['pika:site-admin']
};

// Multiple roles allowed
const supportApp: ChatApp = {
    chatAppId: 'support-tools',
    title: 'Support Tools',
    enabled: true,
    userRoles: ['pika:content-admin', 'customer-support', 'technical-support']
};
```

### 3. Combined User Types and Roles

```js
// Internal users with specific roles
const restrictedApp: ChatApp = {
    chatAppId: 'sensitive-data',
    title: 'Sensitive Data Access',
    enabled: true,
    userTypes: ['internal-user'],
    userRoles: ['data-analyst', 'manager'],
    applyRulesAs: 'and' // Must be internal AND have role
};

// Flexible access
const flexibleApp: ChatApp = {
    chatAppId: 'reporting',
    title: 'Reporting Dashboard',
    enabled: true,
    userTypes: ['internal-user'],
    userRoles: ['external-consultant'],
    applyRulesAs: 'or' // Internal user OR consultant role
};
```

### 4. Entity-Based Access (via Override)

```js
// Site admin creates override for multi-tenant access
const multiTenantOverride = {
    enabled: true,
    exclusiveExternalAccessControl: ['account_enterprise_gold', 'account_premium_tier', 'account_beta_customer'],
    exclusiveInternalAccessControl: ['customer_success_team', 'enterprise_support']
    // External users: Only from specified accounts
    // Internal users: Only from specified teams
};
```

### 5. Beta Testing (via Override)

```js
// Gradual rollout to specific users
const betaOverride = {
    enabled: true,
    exclusiveUserIdAccessControl: ['product_manager_sarah', 'developer_team_lead_mike', 'qa_engineer_alex', 'beta_customer_acme_corp']
    // Only these 4 users can access during beta
};
```

## Home Page Filtering Rules

Separate from chat app access, home page visibility is controlled by `homePageFilterRules`:

```js
// In pika-config.ts
siteFeatures: {
    homePage: {
        linksToChatApps: {
            userChatAppRules: [
                {
                    userTypes: ['internal-user'],
                    chatAppUserTypes: ['internal-user', 'external-user']
                    // Internal users see links to both types of apps
                },
                {
                    userTypes: ['external-user'],
                    chatAppUserTypes: ['external-user']
                    // External users only see external app links
                }
            ];
        }
    }
}
```

## Feature-Level Access Control

Individual features within chat apps also follow the same secure-by-default rules:

```js
// In pika-config.ts - site level feature configuration
siteFeatures: {
    traces: {
        enabled: true,
        userTypes: ['internal-user'], // Only internal users can see traces
        detailedTraces: {
            enabled: true,
            userTypes: ['internal-user'],
            userRoles: ['pika:content-admin'] // Only admins see detailed traces
        }
    }
}

// Chat app can override to be more restrictive
features: {
    traces: {
        featureId: 'traces',
        enabled: true,
        userTypes: ['internal-user'],
        userRoles: ['developer', 'support-lead'], // More restrictive than site level
        applyRulesAs: 'and' // Must be internal AND have specific role
    }
}
```

## Common Security Patterns

### 1. Progressive Access

```js
// Public chat app
const publicApp: ChatApp = {
    chatAppId: 'general-inquiry',
    enabled: true,
    userTypes: ['external-user']
};

// Customer account access (via override)
const accountSpecificOverride = {
    enabled: true,
    exclusiveExternalAccessControl: ['verified_customers_only']
};

// Premium feature access
const premiumApp: ChatApp = {
    chatAppId: 'premium-support',
    enabled: true,
    userTypes: ['external-user'],
    userRoles: ['premium-customer']
};
```

### 2. Department Isolation

```js
// HR department chat
const hrApp: ChatApp = {
    chatAppId: 'hr-assistant',
    enabled: true,
    userTypes: ['internal-user'],
    userRoles: ['hr-team', 'hr-manager']
};

// Finance department chat
const financeApp: ChatApp = {
    chatAppId: 'finance-tools',
    enabled: true,
    userTypes: ['internal-user'],
    userRoles: ['finance-team', 'accountant', 'cfo']
};
```

### 3. Customer Tier Access

```js
// Basic tier
const basicApp: ChatApp = {
    chatAppId: 'basic-support',
    enabled: true,
    userTypes: ['external-user']
    // All external users
};

// Premium tier (via override)
const premiumOverride = {
    enabled: true,
    exclusiveExternalAccessControl: ['premium_tier', 'enterprise_tier']
};

// Enterprise tier (via override)
const enterpriseOverride = {
    enabled: true,
    exclusiveExternalAccessControl: ['enterprise_tier']
};
```

## Debugging Access Issues

### 1. Check Configuration

```js
// Verify chat app configuration
console.log('Chat App Config:', {
    enabled: chatApp.enabled,
    userTypes: chatApp.userTypes,
    userRoles: chatApp.userRoles,
    applyRulesAs: chatApp.applyRulesAs
});

// Check for overrides
console.log('Override Config:', chatApp.override);
```

### 2. Verify User Data

```js
// Check user authentication data
console.log('User Data:', {
    userId: user.userId,
    userType: user.userType,
    roles: user.roles,
    customData: user.customData
});
```

### 3. Test Access Logic

```js
// Manually test access rules
const hasAccess = checkUserAccessToChatApp(user, chatApp);
console.log('Access Result:', hasAccess);
```

## Migration Guide

If you're updating from the previous permissive behavior to secure-by-default:

### 1. Audit Existing Chat Apps

```bash
# Find chat apps without explicit access rules
grep -r "enabled: true" --include="*.ts" | grep -v "userTypes\|userRoles"
```

### 2. Add Explicit Access Rules

```js
// Before (would deny access now)
const oldApp: ChatApp = {
    chatAppId: 'legacy-app',
    enabled: true
    // No userTypes/userRoles = NO ACCESS
};

// After (explicit access granted)
const newApp: ChatApp = {
    chatAppId: 'legacy-app',
    enabled: true,
    userTypes: ['internal-user', 'external-user'] // Explicit access
};
```

### 3. Update Site Features

```js
// Add explicit userTypes to site-level features that need them
siteFeatures: {
    verifyResponse: {
        enabled: true,
        userTypes: ['internal-user', 'external-user'] // Was implicit before
    },
    logout: {
        enabled: true,
        userTypes: ['internal-user', 'external-user'] // Was implicit before
    }
}
```

## Security Best Practices

### 1. Principle of Least Privilege

- **Start Restrictive**: Begin with minimal access and expand as needed
- **Regular Audits**: Periodically review who has access to what
- **Role-Based Design**: Use roles rather than user types when possible

### 2. Configuration Validation

- **Required Fields**: Always specify `userTypes` or `userRoles`
- **Test Access**: Verify access works as expected for all user types
- **Document Decisions**: Comment why specific access rules were chosen

### 3. Override Management

- **Admin Only**: Only trusted users should have `pika:site-admin` role
- **Audit Trail**: Log when overrides are created or modified
- **Regular Review**: Periodically review active overrides

## Troubleshooting

### "No access" Warning in UI

If you see "No access - No user types or roles selected":

1. **Add userTypes**: Specify which user types can access the chat app
2. **Add userRoles**: Or specify which roles can access the chat app
3. **Check overrides**: Verify if an override is blocking access

### User Can't Access Chat App

1. **Check user type**: Verify the user has the correct `userType` assigned
2. **Check user roles**: Verify the user has required roles
3. **Check entity access**: If using entity-based access, verify the user's entity is allowed
4. **Check override precedence**: Higher precedence rules might be blocking access

### Features Not Working

1. **Site-level enabled**: Verify the feature is enabled in `pika-config.ts`
2. **Feature access rules**: Check if the feature has its own access restrictions
3. **Chat app overrides**: Verify the chat app hasn't disabled the feature
