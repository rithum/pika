# Pika Framework Customization Guide

This guide explains the different customization areas in your Pika project and how to use them effectively.

## Overview

Pika Framework provides several designated areas where you can add your custom code without worrying about it being overwritten during framework updates. These areas are protected from sync operations and are designed to be your primary extension points.

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

### 2. Custom Web Applications

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

### 3. Custom Services

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

### 4. Stack Definition Files (Protected by Default)

**Locations:**

- `apps/pika-chat/infra/bin/pika-chat.ts` - Chat application AWS CDK stack
- `services/pika/bin/pika.ts` - Service infrastructure AWS CDK stack

**Purpose:** Define your AWS infrastructure and deployment configuration.

**What to customize here:**

- Project names and descriptions
- VPC configurations
- Account IDs and regions
- Custom AWS resources
- Environment-specific settings

**Important:** These files are protected from framework updates by default. If you want to receive framework updates for these files, add them to the `userUnprotectedAreas` array in `.pika-sync.json`.

## Configuration Files

### Environment Configuration

**Files:** `.env`, `.env.local`, `.env.*`

**Purpose:** Store environment-specific configuration like API keys, database URLs, and feature flags.

**Protected:** Yes - these files are never overwritten by sync operations.

### Pika Configuration

**File:** `pika.config.ts`

**Purpose:** Framework-specific configuration for authentication, components, services, and deployment settings.

**Protected:** Yes - this file is never overwritten by sync operations.

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

### 2. Keep Customizations Focused

Each customization area has a specific purpose. Use the appropriate area for your custom code:

- UI components → Custom Components
- New applications → Custom Web Applications
- Backend services → Custom Services
- Infrastructure changes → Stack Definition Files

### 3. Version Control

Initialize git in your project and commit your customizations regularly:

```bash
git init
git add .
git commit -m "Initial commit with customizations"
```

### 4. Test After Updates

After running `pika sync`, always test your customizations to ensure they still work correctly.

### 5. Document Your Changes

Keep documentation of your customizations, especially for complex changes to stack definitions or custom services.

## Framework Updates

When you run `pika sync`, the framework will:

1. Update framework files with the latest changes
2. Preserve all files in protected areas
3. Merge your `userProtectedAreas` with the default protected areas
4. Remove files in `userUnprotectedAreas` from protection

This ensures your customizations are preserved while you receive the latest framework improvements.

## Getting Help

- **Framework Documentation:** https://github.com/rithum/pika
- **AWS CDK Documentation:** https://docs.aws.amazon.com/cdk/
- **SvelteKit Documentation:** https://kit.svelte.dev/
- **Svelte Documentation:** https://svelte.dev/docs

## Next Steps

1. **Explore the sample code** in each customization area to understand the patterns
2. **Start with small customizations** like adding a custom component
3. **Gradually build up** to more complex customizations
4. **Test your changes** thoroughly before deploying to production
5. **Keep your framework updated** with regular sync operations
