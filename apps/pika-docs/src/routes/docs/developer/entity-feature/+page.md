---
title: Entity Feature
description: Imported from docs/developer/entity-feature.md
outline: [2, 3]
---

The Entity feature enables you to associate users with organizational entities (such as accounts, companies, or organizations) throughout the Pika framework. This foundational feature provides the infrastructure for entity-based access control, filtering, and display across various parts of the system.

## Overview

The Entity feature serves as the foundation for several advanced capabilities:

- **Entity-Based Access Control**: Restrict chat app access to specific accounts, companies, or organizations
- **Session Insights Filtering**: Filter session data by entity in the site admin interface
- **User Data Management**: Associate user accounts with their corresponding organizational entities
- **Administrative Controls**: Enable site admins to configure and manage entity-based restrictions

## Core Concepts

### What is an Entity?

An entity represents an organizational unit that users belong to. Common examples include:

- **Customer Accounts**: Individual customer companies or organizations
- **Business Units**: Different divisions within your organization
- **Partners**: External partner organizations
- **Departments**: Internal organizational departments

### Entity Association

Users are associated with entities through their `customData` object, which is populated by your authentication provider. The entity identifier is stored in a configurable field within this data structure.

```js
// Example user with entity association
{
  userId: "user123",
  customData: {
    accountId: "acct-001",        // Entity identifier
    accountName: "Acme Corp",     // Human-readable entity name
    // ... other custom data
  }
}
```

## Configuration

Enable the entity feature in your `pika-config.ts`:

```js
export const pikaConfig: PikaConfig = {
    siteFeatures: {
        entity: {
            enabled: true,
            attributeName: 'accountId', // Field in customData containing entity ID
            searchPlaceholderText: 'Search for an account...',
            displayNameSingular: 'Account', // How to refer to one entity
            displayNamePlural: 'Accounts', // How to refer to multiple entities
            tableColumnHeaderTitle: 'Account ID' // Column header in tables
        }
    }
};
```

### Configuration Options

- **`enabled`**: Whether the entity feature is active site-wide
- **`attributeName`**: The field name in `user.customData` that contains the entity identifier
- **`searchPlaceholderText`**: Placeholder text for entity search inputs
- **`displayNameSingular`**: Singular form of entity name for UI display
- **`displayNamePlural`**: Plural form of entity name for UI display
- **`tableColumnHeaderTitle`**: Header text for entity columns in tables

## Required Implementation

### 1. User Data Structure

Ensure your authentication provider populates user data with the entity identifier in the `customData` object. The field name must match the `attributeName` specified in your entity configuration:

```js
// In your authentication provider's authenticate() method
return {
    authenticatedUser: {
        userId: userData.id,
        firstName: userData.firstName,
        lastName: userData.lastName,
        userType: userData.isEmployee ? 'internal-user' : 'external-user',
        customData: {
            accountId: userData.accountId, // This field name must match entity.attributeName
            email: userData.email
            // ... other custom data
        }
        // ... other user properties
    }
};
```

### 2. Entity Autocomplete Data Source

Implement the entity lookup function in `apps/pika-chat/src/routes/(auth)/api/site-admin/custom-data.ts`:

```js
export async function getValuesForEntityAutoComplete(
    valueProvidedByUser: string,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatAppId?: string
): Promise<SimpleOption[] | undefined> {
    // Your implementation here - typically:
    // 1. Query your entity data source (API, database, etc.)
    // 2. Filter entities based on valueProvidedByUser
    // 3. Return formatted options for the autocomplete UI

    return entities.map((entity) => ({
        value: entity.id, // This gets stored in access control
        label: entity.name // This is displayed to admins
    }));
}
```

## Integration Points

### Site Admin Access Control

When enabled, the entity feature adds entity-based access control options to the site admin interface:

- **Exclusive Entity Access**: Restrict chat apps to specific entities only
- **Entity Autocomplete**: Search and select entities when configuring access
- **Separate Internal/External Controls**: Different entity lists for internal vs external users

### Session Insights

The entity feature enables entity filtering in session insights:

- **Entity Display**: Show which entity each session belongs to
- **Entity Filtering**: Filter session data by specific entities
- **Entity Aggregation**: Group and analyze sessions by entity

### Access Control Precedence

Entity-based access control follows this precedence order:

1. **Disabled Override**: If `enabled: false`, no access regardless of entity
2. **Exclusive User ID Control**: Specific user IDs take precedence over entity rules
3. **Exclusive Entity Control**: Entity-based restrictions
4. **General Access Rules**: Fall back to user type/role checking

## Troubleshooting

### Entity Feature Not Working

- **Verify Configuration**: Ensure `entity.enabled: true` and all required fields are set
- **Check attributeName**: Must match the field name in your user's `customData`
- **Validate User Data**: Confirm users have the entity field populated in their `customData`
- **Test Field Path**: Verify the `attributeName` correctly points to the entity identifier in user data

### Entity Autocomplete Issues

- **Implement Data Source**: Ensure `getValuesForEntityAutoComplete()` is properly implemented
- **Check API Permissions**: Verify the web app has permissions to access your entity data source
- **Validate Response Format**: Confirm the function returns `SimpleOption[]` with `value` and `label` fields

### Access Control Not Working

- **Entity Matching**: Ensure entity values in access control lists exactly match user data
- **Field Path**: Verify the `entity.attributeName` correctly points to the entity field in user data
- **Precedence Rules**: Check if higher precedence rules (user ID, disabled overrides) are interfering

## Related Documentation

- **[Site Admin Feature](/docs/developer/site-admin-feature/)**: How to configure and use entity-based access control
- **[Authentication](/docs/developer/authentication/)**: Setting up entity field mapping in your auth provider
- **[Chat App Access Control](/docs/developer/chat-app-access-control/)**: Understanding access control precedence and rules
- **[Customization](/docs/developer/customization/)**: Overview of all site features including entity integration
