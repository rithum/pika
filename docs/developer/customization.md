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

### Site Features Configuration

**Location:** `pika-config.ts` (root directory)

**Purpose:** Configure site-wide features that affect the behavior of your Pika chat application across all users and chat apps.

**Available Features:**

#### Home Page Configuration

Configure the home page experience including title, welcome message, and chat app links visibility.

**Configuration Example:**

```typescript
export const pikaConfig: PikaConfig = {
    pika: {
        // ... project names configuration
    },
    pikaChat: {
        // ... project names configuration
    },
    siteFeatures: {
        homePage: {
            // Optional: Custom title for the home page
            homePageTitle: 'Welcome to My Company Chat',

            // Optional: Custom welcome message
            welcomeMessage: 'Get started by selecting a chat app below or asking me anything!',

            // Optional: Configure which users see links to which chat apps
            linksToChatApps: {
                userChatAppRules: [
                    // External users can only see links to external chat apps
                    {
                        userTypes: ['external-user'],
                        chatAppUserTypes: ['external-user']
                    },
                    // Internal users can see links to internal and external chat apps
                    {
                        userTypes: ['internal-user'],
                        chatAppUserTypes: ['internal-user', 'external-user']
                    },
                    // Admin users can see all chat apps
                    {
                        userTypes: ['admin'],
                        chatAppUserTypes: ['internal-user', 'external-user', 'admin']
                    }
                ]
            }
        }
    }
};
```

**Key Configuration Options:**

- **`homePageTitle`** (optional): Custom title for the home page. If not provided, a default title will be used.
- **`welcomeMessage`** (optional): Custom welcome message displayed on the home page. If not provided, a default message will be used.
- **`linksToChatApps`** (optional): Configuration for showing chat app links to users
    - **`userChatAppRules`**: Array of rules that define which users can see which chat apps
        - **`userTypes`**: Array of user types that this rule applies to
        - **`chatAppUserTypes`**: Array of chat app user types that users matching this rule can see

**How It Works:**

1. When a user visits the chat app home page, the system checks their user type
2. The system finds all rules where the user's type matches the `userTypes` array
3. For matching rules, the user will see links to chat apps whose user types are listed in `chatAppUserTypes`
4. If no rules match the user, they won't see any chat app links on the home page

**Example Scenarios:**

```typescript
// Scenario 1: Simple home page customization with basic chat app links
siteFeatures: {
    homePage: {
        homePageTitle: "Customer Support Portal",
        welcomeMessage: "Welcome! How can we help you today?",
        linksToChatApps: {
            userChatAppRules: [
                {
                    userTypes: ['external-user'],
                    chatAppUserTypes: ['external-user']
                },
                {
                    userTypes: ['internal-user'],
                    chatAppUserTypes: ['internal-user', 'external-user']
                }
            ]
        }
    }
}

// Scenario 2: Role-based access with custom messaging
siteFeatures: {
    homePage: {
        homePageTitle: "Corporate AI Assistant",
        welcomeMessage: "Select the appropriate assistant for your role below, or ask any general question to get started.",
        linksToChatApps: {
            userChatAppRules: [
                {
                    userTypes: ['customer', 'guest'],
                    chatAppUserTypes: ['public']
                },
                {
                    userTypes: ['employee'],
                    chatAppUserTypes: ['public', 'internal']
                },
                {
                    userTypes: ['manager', 'admin'],
                    chatAppUserTypes: ['public', 'internal', 'admin']
                }
            ]
        }
    }
}

// Scenario 3: Just custom title and message without chat app links
siteFeatures: {
    homePage: {
        homePageTitle: "AI Assistant",
        welcomeMessage: "Ask me anything to get started!"
    }
}
```

**Notes:**

- All home page configuration options are optional
- If `homePageTitle` is not provided, a default title will be used
- If `welcomeMessage` is not provided, a default welcome message will be used
- For chat app links feature:
    - You must have at least one rule to enable showing chat app links
    - User types and chat app user types are defined by your authentication system and chat app configurations
    - Rules are evaluated in order, and a user can match multiple rules (all matching chat app types will be shown)
    - If no rules match the user, they won't see any chat app links on the home page
- This is a site-wide feature - it affects the entire home page experience across your Pika installation

#### User Data Override Configuration

Configure the user data override feature to allow authorized users to act on behalf of different accounts or contexts:

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        userDataOverrides: {
            enabled: true,

            // Optional: Specify which user types can use this feature (defaults to ['internal-user'])
            userTypesAllowed: ['internal-user', 'admin'],

            // Optional: Customize UI text
            menuItemTitle: 'Switch Account Context',
            dialogTitle: 'Account Override',
            dialogDescription: 'Select the account context to use for this chat app.',

            // Optional: Force users to provide overrides if missing required data
            promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing: ['accountId', 'accountType']
        }
    }
};
```

**Key Configuration Options:**

- **`enabled`** (required): Whether to enable the feature
- **`userTypesAllowed`** (optional): Array of user types that can use this feature (defaults to `['internal-user']`)
- **`menuItemTitle`** (optional): Text for the menu item that opens the override dialog
- **`dialogTitle`** (optional): Title of the override dialog
- **`promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing`** (optional): Force override dialog if these custom data attributes are missing

#### Content Admin Configuration

Configure the content admin feature to allow super-admin users to view other users' chat content:

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

**Additional Setup Required:**

- Users must have the `pika:content-admin` role assigned in their user record
- Role assignment can be done manually in DynamoDB or automatically through your authentication provider
- See [Content Admin Guide](./content-admin.md) for detailed setup instructions

**Security Note:** Only assign the `pika:content-admin` role to trusted users who need debugging access to other users' chat data.

#### Traces Configuration

Configure the traces feature to show AI reasoning and tool invocation details:

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        traces: {
            enabled: true,
            userTypes: ['internal-user'],
            detailedTraces: {
                enabled: true,
                userTypes: ['internal-user'],
                userRoles: ['pika:content-admin']
            }
        }
    }
};
```

**Key Configuration Options:**

- **`enabled`** (required): Whether to enable the traces feature
- **`userTypes`** (optional): User types that can see traces
- **`userRoles`** (optional): User roles that can see traces
- **`detailedTraces`** (optional): Additional access rules for detailed parameter traces

#### Verify Response Configuration

Configure the verify response feature to automatically check AI response accuracy:

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        verifyResponse: {
            enabled: true,
            autoRepromptThreshold: VerifyResponseClassification.AccurateWithUnstatedAssumptions, // 'C'
            userTypes: ['internal-user', 'external-user']
        }
    }
};
```

**Key Configuration Options:**

- **`enabled`** (required): Whether to enable response verification
- **`autoRepromptThreshold`** (optional): Grade threshold for automatic retries (B, C, or F)
- **`userTypes`** (optional): User types that can use verified responses
- **`userRoles`** (optional): User roles that can use verified responses

#### Chat Disclaimer Notice Configuration

Configure disclaimer notices to inform users about AI limitations:

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        chatDisclaimerNotice: {
            notice: "This AI-powered chat is here to help, but it may not always be accurate. For urgent or complex issues, please contact customer support. The company isn't liable for problems caused by relying solely on this chat."
        }
    }
};
```

**Key Configuration Options:**

- **`notice`** (required): The disclaimer text to display to users

## Customization Areas

### 1. Custom Message Tag Renderers

**Location:** `apps/pika-chat/src/lib/client/features/chat/message-segments/custom-components/`

**Purpose:** Add custom renderers for XML tags in LLM responses for inline visual components and metadata handlers for processing non-visual tags.

**What to put here:**

- Custom Svelte components for rendering XML tags (e.g., `<order>`, `<dialog>`, `<code>`)
- Metadata handlers for processing XML tags that don't render visually (e.g., `<some-command>`)
- TypeScript files with supporting logic
- Custom UI components for displaying structured data from LLMs

**Example use cases:**

- Custom data visualization components (charts, graphs, tables)
- Interactive widgets (forms, buttons, controls)
- File display components (PDFs, documents, media)
- Business-specific data renderers (customer cards, product displays, interactive elements)
- Analytics and telemetry handlers

**Documentation:** See [Custom Message Tags Guide](./custom-message-tags.md) for detailed implementation instructions.

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

### User Data Override Feature

**Purpose:** Allow authorized users to override their authentication-provided data for specific chat apps.

**Use Case:** Internal users acting on behalf of different accounts, companies, or customer contexts without requiring separate authentication sessions.

**Configuration:** Enable in `pika-config.ts` siteFeatures and implement custom UI and server logic.

**Documentation:** See [User Data Override Guide](./overriding-user-data.md) for complete implementation details.

### Content Admin Feature

**Purpose:** Allow designated super-admin users to view chat sessions and messages for any user in the system for debugging and support.

**Use Case:** Customer support agents, developers troubleshooting issues, and QA teams verifying functionality across different user profiles.

**Configuration:** Enable in `pika-config.ts` siteFeatures and assign `pika:content-admin` role to authorized users.

**Documentation:** See [Content Admin Guide](./content-admin.md) for complete setup and usage instructions.

### Traces Feature

**Purpose:** Provide visibility into AI reasoning processes, tool invocations, and execution details for debugging and transparency.

**Use Case:** Developers understanding agent behavior, support teams debugging issues, and users gaining insight into AI decision-making.

**Configuration:** Enable in `pika-config.ts` siteFeatures with access control for different user types and roles.

**Documentation:** See [Traces Feature Guide](./traces-feature.md) for complete configuration and usage instructions.

### Verify Response Feature

**Purpose:** Automatically evaluate AI response accuracy and quality, with optional auto-reprompting for improved responses.

**Use Case:** Ensuring high-quality AI responses in critical applications, meeting accuracy requirements, and building user trust.

**Configuration:** Enable in `pika-config.ts` siteFeatures with configurable quality thresholds and access rules.

**Documentation:** See [Verify Response Feature Guide](./verify-response-feature.md) for complete setup and configuration instructions.

### Chat Disclaimer Notice Feature

**Purpose:** Display disclaimer messages to users about AI limitations and appropriate usage expectations.

**Use Case:** Legal protection, user education, regulatory compliance, and setting appropriate expectations for AI interactions.

**Configuration:** Configure in `pika-config.ts` siteFeatures with customizable disclaimer text per site or chat app.

**Documentation:** See [Chat Disclaimer Notice Feature Guide](./chat-disclaimer-notice-feature.md) for configuration examples and best practices.

### Feature Override System

**Purpose:** Allow individual chat apps to customize site-level feature configurations for specialized behavior.

**Use Case:** Different feature requirements for customer-facing vs. internal chat apps, specialized compliance needs, or app-specific user experience requirements.

**Configuration:** Configure in individual chat app definitions to override site-level settings.

**Documentation:** See [Overriding Features Guide](./overriding-features.md) for complete override system documentation.

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
