---
title: Session Management
description: Developer guide for session sharing and pinning features
outline: [2, 3]
---

This guide covers the technical aspects of Pika's session sharing and pinning features, including data models and access control logic.

## Session Sharing Architecture

Session sharing enables users to create shareable links for their chat sessions while maintaining enterprise-grade access controls.

### Access Control Semantics

Pika's shared session access control operates through a sophisticated permission system that considers user type, entity configuration, and chat app settings. The system evaluates multiple layers of configuration to determine whether a user can access a specific shared session.

<Tabs activeName="External Users">

<TabPanel name="External Users">

External users represent your customers, clients, or end-users who belong to specific organizations or accounts. The access control system determines their permissions based on entity scoping and chat app configuration.

Pika requires authentication by default. So, `global` access referred to below is in the context of both an authenticated user and a user who has been granted access to a specific chat app.

**Site-Wide Entity Feature**

The entity feature serves as the foundational layer for organizational separation. When administrators enable the entity feature site-wide, your auth provider associates each user with a specific entity such as a company, account, department, or organizational unit. This entity relationship comes from a configurable attribute in the user's custom data, typically something like `accountId`, `companyId`, or `departmentId`.

Note that all chat sessions exist in the context of the chat app in which they were created.

When the site-wide entity feature is enabled, Pika stamps every new chat session with an entity ID that matches the session creator's entity. This creates natural boundaries between different organizations using your chat application.

**Chat App Entity Override**

Individual chat apps can override the site-wide entity feature by explicitly disabling it. When a chat app disables the entity feature through its configuration, that chat app operates in `global` mode regardless of the site-wide setting, meaning there is no need for a logical separation of users of that chat app by organization (of course, users still have to be authenticated and have been granted access to the chat app). Sessions created in these chat apps receive the special entity ID `chat-app-global` instead of the user's actual entity ID.

**Session Access Determination**

External users with permision to access a given chat app can access a shared session in that chat app when any of these conditions apply:

The user owns the original session, granting them perpetual access regardless of other restrictions.

The session carries the `chat-app-global` entity ID, indicating it was created in a chat app with entity features disabled. These sessions are accessible to any authenticated user who can access the parent chat app.

The session's entity ID matches the user's entity ID, meaning both the session creator and the accessing user belong to the same organization or account.

**Entity ID Resolution**

The system resolves a user's entity ID by examining their custom data using the configured entity attribute name. If the site-wide entity feature specifies `accountId` as the entity attribute, the system looks for `user.customData.accountId` to determine the user's entity membership. Users without this attribute or with empty values cannot access entity-scoped shared sessions.

</TabPanel>

<TabPanel name="Internal Users">

Internal users typically represent your support staff, administrators, or employees who need to access customer sessions for debugging, support, or administrative purposes. These users don't naturally belong to any specific customer entity, creating unique access control requirements.

**Default Entity Assignment**

Internal users have no inherent entity membership since they're not customers of your system. When they attempt to access shared sessions in chat apps with entity features enabled, the system must determine their effective entity ID through alternative means.

**User Override Mechanism**

Pika provides a user override system that allows internal users to temporarily assume an entity identity. When an internal user sets override data for a specific chat app, they can specify which entity they want to act as. This override data takes precedence over their default custom data when determining their effective entity ID.

The override mechanism operates on a per-chat-app basis, meaning an internal user might assume the identity of `acme-corp` when accessing one chat app while maintaining a different identity for another chat app.

**Access Without Override Data**

When internal users access shared sessions in entity-enabled chat apps without providing override data, the system faces an ambiguous situation. The current implementation grants broad access to these users, allowing them to view entity-scoped sessions regardless of the session's entity ID. This behavior prioritizes support access over strict entity boundaries.

**Access With Override Data**

When internal users provide override data that specifies an entity ID, the system treats them similarly to external users. They can access shared sessions where their assumed entity ID matches the session's entity ID, plus any sessions marked as globally accessible in the given chat app.

**Global Chat App Access**

In chat apps where the entity feature is disabled, internal users receive the same global chat app access as external users. The override system becomes irrelevant since all sessions in these chat apps carry the `chat-app-global` entity ID.

**Override Data Requirements**

When the entity feature is enabled, the Pika platform requires internal users provide override data before accessing entity-enabled chat apps. This requirement ensures that internal users explicitly choose which entity context they want to operate in, preventing accidental cross-entity data exposure. When this requirement is active, internal users without appropriate override data are redirected to provide the necessary information before accessing shared sessions.

</TabPanel>

</Tabs>

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
