---
title: Session Management
description: Developer guide for session sharing and pinning features
outline: [2, 3]
---

This guide covers the technical aspects of Pika's session sharing and pinning features, including data models and access control logic.

## Session Sharing Architecture

Session sharing enables users to create shareable links for their chat sessions while maintaining enterprise-grade access controls.

### Access Control Logic

Share access follows a hierarchical permission model:

1. **Internal Users**: Always granted access to all shared sessions (for support/admin purposes)
2. **Entity-Based Access**: When entity feature is enabled, users with matching entity ID get access
3. **Global Access**: When entity feature is disabled, all authenticated users get access
4. **Session Owner**: Original session creator always has access

## Session Pinning Architecture

Session pinning allows users to bookmark important sessions for quick sidebar access.

### Data Model

Pinned sessions are stored in a separate table with composite keys:

```js
interface PinnedSession {
  sessionId?: string;    // For pinning own sessions
  shareId?: string;      // For pinning shared sessions
  chatAppId: string;     // Chat app context
  pinnedAt: string;      // Timestamp
}
```

### Storage Pattern

- **Composite Key**: `user_id_chat_app_id` + `session_or_share_id`
- **Flexible Pinning**: Users can pin both their own sessions and shared sessions
- **Entity Scoped**: Pins are associated with user's entity context

## Visit Tracking

When users access shared sessions, visits are recorded for "Recent Shared" functionality:

```js
interface SharedSessionVisitHistory {
  shareId: string;
  chatAppId: string;
  firstVisitedAt: string;
  lastVisitedAt: string;
  visitCount: number;
}
```

### Visit Recording Logic

- **First Visit**: Creates new visit record
- **Subsequent Visits**: Updates `lastVisitedAt` and increments `visitCount`
- **Recent Shared**: Only sessions the user has actually visited appear in navigation

## Frontend Integration

### Share URL Format

Shared sessions are accessed via URL pattern:

```
/chat/{chatAppId}/share/{shareId}
```

The frontend:

1. Validates user access via API call
2. Records the visit automatically
3. Redirects to main chat interface with share context
4. Loads shared session data into chat state

### Navigation Integration

- **Recent Shared**: Populated from visit history, not all available shares
- **Pinned Sessions**: Shows both own and shared pinned sessions with visual indicators
- **Visual Distinction**: Shared sessions display with external link icon

## Entity Feature Integration

Session management integrates with the optional entity feature:

- **Entity Enabled**: Access restricted to users with matching entity ID
- **Entity Disabled**: Global access for all authenticated users
- **Entity Attribute**: Configurable attribute name in user's `customData`

```js
// Entity configuration example
const entityAttributeName = 'accountId'; // or 'departmentId', etc.
const userEntityId = user.customData[entityAttributeName];
```

## Security Considerations

- **Authentication Required**: All endpoints require valid authentication
- **Session Ownership**: Only session owners can create shares
- **Access Validation**: Every share access validates permissions
- **Revocation**: Shares can be revoked immediately across all users
- **Audit Trail**: All visits are logged for compliance and analytics

:::warning[Access Control]
Always ensure proper user type assignment (`internal-user` vs `external-user`) as internal users receive elevated privileges for all shared sessions.
:::

:::tip[Implementation Examples]
See the [Shared Types](/docs/developer/shared-types/) documentation for complete TypeScript interfaces and the [Authentication](/docs/developer/authentication/) guide for user type configuration.
:::
