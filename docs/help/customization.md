# Pika Framework Customization Guide

This guide explains the different customization areas in your Pika project and how to use them effectively.

## Overview

Pika Framework provides several designated areas where you can add your custom code without worrying about it being overwritten during framework updates. These areas are protected from sync operations and are designed to be your primary extension points.

## Central Configuration

### Project Configuration

**Location:** `pika-config.ts` (root directory)

**Purpose:** Central configuration file for project names and settings used across your Pika project.

**What to customize here:**

- **Project Names**: Update the project names for both Pika backend and Pika Chat frontend stacks
- **Resource Naming**: All AWS resources will use these names for consistent naming across your infrastructure
- **Stack Descriptions**: Stack descriptions are automatically generated from these names

**Example customization:**

```typescript
export const pikaConfig: PikaConfig = {
    pika: {
        projNameL: 'mycompany', // All lowercase: mycompany
        projNameKebabCase: 'mycompany', // Kebab case: mycompany
        projNameTitleCase: 'MyCompany', // Title case: MyCompany
        projNameCamel: 'mycompany', // Camel case: mycompany
        projNameHuman: 'My Company' // Human readable: My Company
    },
    pikaChat: {
        projNameL: 'mycompanychat', // All lowercase: mycompanychat
        projNameKebabCase: 'mycompany-chat', // Kebab case: mycompany-chat
        projNameTitleCase: 'MyCompanyChat', // Title case: MyCompanyChat
        projNameCamel: 'myCompanyChat', // Camel case: myCompanyChat
        projNameHuman: 'My Company Chat' // Human readable: My Company Chat
    }
};
```

**Important:** This file is protected from framework updates and will never be overwritten when you run `pika sync`. All stack definition files automatically import and use these values.

## Customization Areas

### 1. Custom Components

**Location:** `apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/`

**Purpose:** Add custom markdown components that will be rendered in chat messages.

**What to put here:**

- Custom Svelte components for rendering specific markdown tags
- Components that extend the chat message rendering capabilities
- Custom UI elements that should appear in chat messages

**Example use cases:**

- Custom code syntax highlighting components
- Special formatting for mentions or links
- Custom emoji or reaction components
- Business-specific data visualization components

### 2. Authentication

**Location:** `apps/pika-chat/src/lib/server/auth-provider/`

**Purpose:** Implement custom authentication flows for your specific SSO or auth provider.

**What to put here:**

- Authentication provider implementation
- OAuth flow handlers
- SSO integration logic
- Custom user data types

**Example use cases:**

- Company SSO integration
- Custom OAuth providers
- Multi-tenant authentication
- Role-based access control

**Documentation:** See [Authentication Guide](./authentication.md) for detailed implementation instructions.

### 3. Custom Web Applications

**Location:** `apps/custom/`

**Purpose:** Add entirely new web applications to your Pika project.

**What to put here:**

- Complete SvelteKit applications
- Admin dashboards
- Customer portals
- Any additional web interfaces

**Example use cases:**

- Admin panel for managing users and settings
- Customer dashboard for viewing analytics
- Internal tools and utilities
- Separate applications for different user types

### 4. Custom Services

**Location:** `services/custom/`

**Purpose:** Add new backend services and API endpoints.

**What to put here:**

- New API services
- Background job processors
- Data processing pipelines
- Integration services

**Example use cases:**

- Payment processing services
- Email notification services
- Data analytics services
- Third-party integrations (CRM, marketing tools, etc.)

### 5. Stack Definition Files (Protected by Default)

**Locations:**

- `apps/pika-chat/infra/bin/pika-chat.ts` - Chat application AWS CDK stack
- `services/pika/bin/pika.ts` - Service infrastructure AWS CDK stack

**Purpose:** Define your AWS infrastructure and deployment configuration.

**What to customize here:**

- VPC configurations
- Account IDs and regions
- Custom AWS resources
- Environment-specific settings
- **Note:** Project names are automatically imported from `pika-config.ts`

**Important:** These files are protected from framework updates by default. If you want to receive framework updates for these files, add them to the `userUnprotectedAreas` array in `.pika-sync.json`.

## Configuration Files

### Environment Configuration

**Files:** `.env`, `.env.local`, `.env.*`

**Purpose:** Store environment-specific configuration like API keys, database URLs, and feature flags.

**Protected:** Yes - these files are never overwritten by sync operations.

### Pika Configuration

**File:** `pika-config.ts`

**Purpose:** Central configuration for project names and settings used across all stacks and resources.

**Protected:** Yes - this file is never overwritten by sync operations.

**Key Features:**

- Type-safe configuration with TypeScript
- Centralized project naming for consistent resource naming
- Automatically imported by all stack definition files
- Single source of truth for project identity

## Sync Configuration

### .pika-sync.json

This file tracks your sync status and allows you to customize which files are protected from updates.

**Key sections:**

- `protectedAreas`: Framework-managed list of protected files (don't edit this)
- `userProtectedAreas`: Additional files you want to protect
- `userUnprotectedAreas`: Default protected files you want to allow updates for

**Example configuration:**

```json
{
    "userProtectedAreas": ["my-custom-config.ts", "apps/my-custom-app/"],
    "userUnprotectedAreas": ["apps/pika-chat/infra/bin/pika-chat.ts", "services/pika/bin/pika.ts"]
}
```

## Best Practices

### 1. Use Designated Areas

Always place your custom code in the designated customization areas. Files outside these areas may be overwritten during framework updates.

### 2. Configure Project Names First

Before customizing anything else, update the project names in `pika-config.ts` to match your organization and project requirements. This ensures consistent naming across all AWS resources.

### 3. Keep Customizations Focused

Each customization area has a specific purpose. Use the appropriate area for your custom code:

- Project names and settings → `pika-config.ts`
- UI components → Custom Components
- Authentication logic → Custom Authentication
- New applications → Custom Web Applications
- Backend services → Custom Services
- Infrastructure changes → Stack Definition Files

### 4. Version Control

Initialize git in your project and commit your customizations regularly:

```bash
git init
git add .
git commit -m "Initial commit with customizations"
```

### 5. Test After Updates

After running `pika sync`, always test your customizations to ensure they still work correctly.

### 6. Document Your Changes

Keep documentation of your customizations, especially for complex changes to stack definitions or custom services.

## Framework Updates

When you run `pika sync`, the framework will:

1. Update framework files with the latest changes
2. Preserve all files in protected areas (including `pika-config.ts`)
3. Merge your `userProtectedAreas` with the default protected areas
4. Remove files in `userUnprotectedAreas` from protection

This ensures your customizations are preserved while you receive the latest framework improvements.

## Getting Help

- **Framework Documentation:** https://github.com/rithum/pika
- **AWS CDK Documentation:** https://docs.aws.amazon.com/cdk/
- **SvelteKit Documentation:** https://kit.svelte.dev/
- **Svelte Documentation:** https://svelte.dev/docs

## Next Steps

1. **Update project names** in `pika-config.ts` to match your organization
2. **Explore the sample code** in each customization area to understand the patterns
3. **Start with small customizations** like adding a custom component
4. **Gradually build up** to more complex customizations
5. **Test your changes** thoroughly before deploying to production
6. **Keep your framework updated** with regular sync operations
