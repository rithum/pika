---
title: Session Management
description: Share and organize chat sessions with advanced session management features
outline: [2, 3]
---

Pika's session management features enable users to share important conversations with colleagues and organize their most valuable sessions through pinning functionality. These capabilities make collaboration and knowledge sharing seamless in enterprise environments.

## Session Sharing

Share valuable chat sessions with other users through secure share links. When you create a share link, others can access the complete conversation history while maintaining proper access controls based on your organization's configuration.

### Key Features

- **Secure Access Control**: Share links only work for authenticated users of your Pika instance
- **Entity-Based Permissions**: Access automatically granted to users within the same organizational entity (when entity feature is enabled)
- **Internal User Privileges**: Internal users (employees) can access all shared sessions for support and management purposes
- **Revocable Links**: Session owners can revoke and restore access to shared sessions at any time
- **Visit Tracking**: Track who accessed shared sessions through the "Recent Shared" navigation

### How It Works

1. **Create Share Link**: Click the share button on any chat session to generate a unique share link
2. **Controlled Access**: Recipients must be authenticated users with appropriate permissions
3. **Automatic Discovery**: Shared sessions appear in "Recent Shared" only after being accessed
4. **Flexible Management**: Revoke or restore access as needed through simple controls

## Session Pinning

Pin your most important sessions—both your own conversations and shared sessions from others—for quick access through the sidebar navigation.

### Key Features

- **Personal Organization**: Pin your most valuable conversations for instant access
- **Shared Session Pinning**: Pin important shared sessions from colleagues
- **Persistent Storage**: Pinned sessions remain accessible across browser sessions
- **Visual Indicators**: Clear visual distinction between your own sessions and shared content

### Use Cases

- **Quick Reference**: Keep frequently referenced conversations at your fingertips
- **Important Collaborations**: Pin shared sessions containing critical information
- **Project Management**: Organize sessions by importance or current priorities
- **Knowledge Base**: Build a personal collection of valuable AI interactions

## Access Control

Session management respects your organization's user and entity configuration:

- **Entity-Based Access**: When the entity feature is enabled, users automatically share access with others in their organization/department
- **Global Access**: Without entity configuration, any authenticated user can access shared sessions
- **Internal User Override**: Internal users always have access to all shared sessions for administrative purposes
- **Secure by Default**: All features require authentication and respect configured access controls

## Enterprise Benefits

- **Knowledge Sharing**: Distribute valuable AI conversations across teams
- **Collaboration**: Work together on complex problems by sharing session history
- **Support**: Internal users can access shared sessions for troubleshooting
- **Organization**: Keep important conversations accessible through pinning
- **Compliance**: All access is tracked and auditable through visit history

:::tip[Implementation Details]
Ready to implement session management? See the [Developer Guide](/docs/developer/session-management/) for technical details and configuration options.
:::
