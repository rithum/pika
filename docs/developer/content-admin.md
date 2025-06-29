# Content Admin Feature

The Content Admin feature allows designated super-admin users to view chat sessions and messages for any user in the system. This is primarily designed for debugging, troubleshooting, and customer support scenarios where administrators need to understand what users are experiencing.

## Overview

When enabled, this feature provides:

- **User Impersonation (View-Only)**: View chat sessions and messages as if you were another user
- **Cross-User Debugging**: Access any user's chat history for a specific chat app
- **Search Functionality**: Find and select users through a searchable interface
- **Read-Only Access**: View content without the ability to create new sessions or send messages
- **Role-Based Security**: Only users with the `pika:content-admin` role can access this feature
- **Per-Chat App Control**: Select different users for different chat apps independently

## Use Cases

Common scenarios where this feature is valuable:

- **Customer Support**: Support agents helping customers debug issues with their chat experiences
- **Technical Troubleshooting**: Developers investigating reported bugs or unexpected behavior
- **Quality Assurance**: QA teams verifying chat functionality across different user profiles
- **User Experience Research**: Understanding how different users interact with the system
- **Compliance & Auditing**: Reviewing chat interactions for compliance purposes

## Configuration

### 1. Enable the Feature

In your `pika-config.ts`, enable the content admin feature:

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        contentAdmin: {
            enabled: true
        }
    }
};
```

### 2. Grant Admin Role

Content admin users must have the `pika:content-admin` role assigned. This is done differently depending on your authentication provider:

#### Option A: Database Assignment

Manually add the role in the DynamoDB table:

1. Go to the AWS Console → DynamoDB
2. Find the table named `chat-users-${your-stack-name}`
3. Locate the user record
4. Add `pika:content-admin` to the user's `roles` array field (add if missing, it's a string array)

#### Option B: Authentication Provider

Configure your authentication provider to assign the role automatically. See [Authentication Guide](./authentication.md) for details on implementing role assignment logic.

**Example in custom authentication provider:**

```typescript
// In your authentication provider implementation
export async function getUser(event: RequestEvent): Promise<AuthenticatedUser | undefined> {
    const userData = await getLoggedInUserData(event);

    if (!userData) return undefined;

    const roles: string[] = [];

    // Assign content admin role to specific users
    if (userData.email === 'admin@company.com' || userData.department === 'support') {
        roles.push('pika:content-admin');
    }

    return {
        userId: userData.id,
        name: userData.name,
        email: userData.email,
        userType: userData.userType,
        roles: roles
        // ... other user properties
    };
}
```

## Usage

### 1. Accessing Content Admin

Once enabled and the user has the proper role:

1. **Menu Access**: A "Content Admin" option appears in the chat interface menu under the settings icon button
2. **User Selection**: Click to open a dialog where you can search for and select a user
3. **Search Interface**: Type to search for users by user ID or other criteria
4. **View Activation**: Select a user to begin viewing their content for that specific chat app

### 2. Content Admin Interface

The content admin dialog provides:

- **User Search**: Auto-complete search field to find users (search on user ID only, not on name)
- **Current Selection**: Shows which user (if any) you're currently viewing content for
- **Save Changes**: Apply the selection to begin viewing as the selected user
- **Stop Viewing**: Clear the current selection to return to your own content
- **Per-Chat App**: Each chat app maintains independent content admin selections

### 3. User Experience When Viewing Content

When viewing content for another user:

- **Chat History**: See all of the selected user's chat sessions and messages
- **Read-Only Mode**: Cannot create new sessions or send messages
- **Visual Indicators**: The interface shows you're viewing content for another user
- **Limited Actions**: User data override features are disabled while in content admin mode
- **Refresh Required**: Changes take effect after page refresh

## Security Features

### 1. Access Control

- **Role Verification**: Only users with `pika:content-admin` role can access the feature
- **Per-Request Validation**: Each API call verifies admin permissions
- **Feature Toggle**: Can be completely disabled in pika configuration

### 2. Audit Trail

Content admin actions are logged for security and compliance:

```typescript
// Example of audit logging in your implementation
console.log(`Content admin ${user.userId} began viewing content for user ${selectedUser.userId} in chat app ${chatApp.chatAppId}`);
```

### 3. Data Protection

- **Read-Only Access**: Cannot modify or create content as another user
- **Controlled Scope**: Access limited to chat data within the system
- **Session Isolation**: Viewing selections don't affect the target user's experience

### 4. Feature Restrictions

When viewing content for another user:

- **No Message Creation**: Cannot send messages or create new chat sessions
- **No Data Overrides**: User data override features are disabled
- **Limited Actions**: Most administrative actions are restricted

## Error Handling

### 1. Common Issues

**Content Admin Option Not Visible:**

- Verify the feature is enabled in `pika-config.ts`
- Check that user has `pika:content-admin` role assigned
- Confirm user is logged in with proper authentication

**Cannot Find Users in Search:**

- Search is only on user ID
- Search doesn't start until 3 characters are typed

**Changes Not Taking Effect:**

- Remember to refresh the page after making content admin selections
- Check that cookies are being set correctly
- Verify browser isn't blocking cookie updates

## Database Schema

### 1. User Table Structure

The content admin feature relies on user data stored in DynamoDB in the `chat-user-xxx` table. Key fields include:

```typescript
// Example user record structure
{
    "userId": "user123",
    "userType": "internal-user",
    "roles": ["pika:content-admin"], // Required for content admin access
    "customData": { /* ... */ }
}
```

### 2. Content Admin State

Content admin selections are stored in the user's session state:

```typescript
// Example viewingContentFor structure
{
    "viewingContentFor": {
        "chatapp-1": {
            "userId": "target-user-123",
        },
        "chatapp-2": {
            "userId": "another-user-456",
        }
    }
}
```
