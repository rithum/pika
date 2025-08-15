---
title: Customization
description: Complete guide to customizing Pika Framework for your specific needs
outline: [2, 3]
---

This guide explains the different customization areas in your Pika project and how to use them effectively.

## Overview

Pika Framework provides several designated areas where you can add your custom code without worrying about it being overwritten during framework updates. These areas are protected from sync operations and are designed to be your primary extension points.

## Central Configuration

### Project Configuration

**Location:** `pika-config.ts` (root directory)

**Purpose:** Central configuration file for project names and settings used across your Pika project.

:::important[Protected Configuration]
This file is protected from framework updates and will never be overwritten when you run `pika sync`. All stack definition files automatically import and use these values.
:::

**What to customize here:**

- **Project Names**: Update the project names for both Pika backend and Pika Chat frontend stacks
- **Resource Naming**: All AWS resources will use these names for consistent naming across your infrastructure
- **Stack Descriptions**: Stack descriptions are automatically generated from these names

**Example customization:**

```js
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

### Site Features Configuration

**Location:** `pika-config.ts` (root directory)

**Purpose:** Configure site-wide features that affect the behavior of your Pika chat application across all users and chat apps.

#### Home Page Configuration

Configure the home page experience including title, welcome message, and chat app links visibility.

**Configuration Example:**

````js
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

```js
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

// Scenario 2: Just custom title and message without chat app links
siteFeatures: {
    homePage: {
        homePageTitle: "AI Assistant",
        welcomeMessage: "Ask me anything to get started!"
    }
}
````

**Notes:**

- All home page configuration options are optional
- If `homePageTitle` is not provided, a default title will be used
- If `welcomeMessage` is not provided, a default welcome message will be used
- For chat app links feature: You must have at least one rule to enable showing chat app links
  :::

#### Chat App Features Configuration

:::important[Site-Level Enablement Required]
All chat app features must be enabled at the site level before individual chat apps can use them. This provides consistent governance and control across your entire deployment.
:::

:::warning[Secure-by-Default Access Control]
Pika uses a **secure-by-default** access control system. Setting `enabled: true` alone does NOT activate a feature for users. You must also specify `userTypes` or `userRoles` to grant access. Features without explicit access control configuration will appear as "disabled" to all users, even when `enabled: true`.
:::

**Configuration Example:**

````js
export const pikaConfig: PikaConfig = {
    // ... project names configuration
    siteFeatures: {
        // ... home page configuration

        // Show AI reasoning traces to users
        traces: {
            featureId: 'traces',
            enabled: true,
            userTypes: ['internal-user'], // Only show to internal users
            detailedTraces: {
                enabled: true,
                userTypes: ['internal-user'],
                userRoles: ['pika:content-admin'] // Only admins see detailed traces
            }
        },

        // Verify and improve AI response quality
        verifyResponse: {
            featureId: 'verifyResponse',
            enabled: true,
            autoRepromptThreshold: 'C', // Automatically improve responses graded C or lower
            userTypes: ['internal-user', 'external-user'] // REQUIRED: Must specify access
        },

        // Display disclaimer notices to users
        chatDisclaimerNotice: {
            featureId: 'chatDisclaimerNotice',
            enabled: true,
            notice: 'This AI-powered chat is here to help, but it may not always be accurate. For urgent or complex issues, please contact customer support.'
        },

  </TabPanel>
  <TabPanel name="UI Features">
    ```js
    siteFeatures: {
        // Enable logout functionality
        logout: {
            featureId: 'logout',
            enabled: true,
            userTypes: ['internal-user', 'external-user'] // REQUIRED: Must specify access
        },

        // Enable file upload capabilities
        fileUpload: {
            featureId: 'fileUpload',
            enabled: true,
            mimeTypesAllowed: ['image/*', 'application/pdf', 'text/plain', '.docx', '.xlsx']
        },

        // Enable chat suggestions
        suggestions: {
            featureId: 'suggestions',
            enabled: true,
            suggestions: [], // Empty means chat apps define their own
            maxToShow: 5,
            randomize: false,
            randomizeAfter: 0
        },

        // Enable input field labels
        promptInputFieldLabel: {
            featureId: 'promptInputFieldLabel',
            enabled: true,
            promptInputFieldLabel: 'Ready to chat'
        },

        // Enable UI customizations
        uiCustomization: {
            featureId: 'uiCustomization',
            enabled: true,
            showUserRegionInLeftNav: false,
            showChatHistoryInStandaloneMode: true
        }
    }
};
````

**Feature Overview:**

| Feature                 | Purpose                                | Can Chat Apps Override?          |
| ----------------------- | -------------------------------------- | -------------------------------- |
| `traces`                | Show AI reasoning and tool invocations | ✅ Access rules                  |
| `verifyResponse`        | Verify and improve AI response quality | ✅ Quality thresholds and access |
| `chatDisclaimerNotice`  | Display disclaimer text to users       | ✅ Custom disclaimer text        |
| `logout`                | Enable logout functionality            | ✅ Custom text and access rules  |
| `fileUpload`            | Allow file uploads to chat             | ✅ Restrict file types           |
| `suggestions`           | Show suggested prompts to users        | ✅ Custom suggestions            |
| `promptInputFieldLabel` | Label above chat input field           | ✅ Custom label text             |
| `uiCustomization`       | UI display customizations              | ✅ Display settings              |
| `userDataOverride`      | User data override UI availability     | ✅ Can disable per chat app      |

**Key Principles:**

- **Site-Level Enablement**: Features disabled here cannot be enabled by chat apps or admin overrides
- **Chat App Restrictions**: Chat apps can only make features more restrictive than site level and override feature settings
- **Admin Override Power**: Admin overrides can completely replace chat app settings (but not enable site-disabled features)
- **Feature Hierarchy**: Site → Chat App → Admin Override → User access control flow

:::info[Complete Override Documentation]
See [Overriding Features Guide](/docs/developer/overriding-features/) for complete details on the override system.
:::

**Access Control:**

- **User Types**: `internal-user` (employees) vs `external-user` (customers)
- **User Roles**: Fine-grained permissions like `pika:content-admin`, `pika:site-admin`
- **Access Rules**: Use `userTypes`, `userRoles`, and `applyRulesAs` for precise control

:::info[Complete Access Control Guide]
For detailed information about chat app access rules, precedence order, override systems, and troubleshooting, see the [Chat App Access Control Guide](/docs/developer/chat-app-access-control/).
:::

#### Advanced Features Configuration

<Expansion title="User Data Override Configuration">

Configure the user data override feature to allow authorized users to act on behalf of different accounts or contexts:

```js
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

Chat apps can choose to disable this feature per app using an override:

```js
// In the chat app definition
features: {
    userDataOverride: {
        featureId: 'userDataOverride',
        enabled: false // Disable for this chat app
    }
}
```

See the [Overriding Features Guide](/docs/developer/overriding-features/#9-user-data-override-feature) for override rules and precedence.

</Expansion>

<Expansion title="Content Admin Configuration">

Configure the content admin feature to allow super-admin users to view other users' chat content:

```js
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
- See [Content Admin Guide](/docs/developer/content-admin/) for detailed setup instructions

**Security Note:** Only assign the `pika:content-admin` role to trusted users who need debugging access to other users' chat data.

</Expansion>

<Expansion title="Site Admin Configuration">

Configure the site admin feature to provide a web interface for managing chat app access control:

```js
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        siteAdmin: {
            websiteEnabled: true
        }
    }
};
```

**Additional Setup Required:**

- Users must have the `pika:site-admin` role assigned in their user record
- Role assignment can be done manually in DynamoDB or automatically through your authentication provider
- The site admin interface provides tools for managing chat app overrides and access control

**What the Site Admin Feature Provides:**

- **Chat App Override Management**: Create and modify access control overrides for individual chat apps
- **Entity-Based Access Control**: Configure which accounts, companies, or organizations can access specific chat apps
- **User ID Access Control**: Grant access to specific individual users
- **Home Page Visibility Control**: Configure which chat apps appear on the home page for different user types
- **Access Rule Management**: Fine-tune user type and role-based access rules per chat app

**Security Note:** Only assign the `pika:site-admin` role to trusted administrators who need to manage chat app access control settings.

</Expansion>

<Expansion title="Chat App Override System">

**Purpose:** Provide fine-grained access control for individual chat apps through administrative overrides that can restrict access based on user IDs, entities, or enhanced access rules.

**Configuration:** Managed through the Site Admin interface or APIs by users with `pika:site-admin` role.

**Key Features:**

- **Entity-Based Access Control**: Restrict access to specific accounts, companies, or organizations
- **User ID Access Control**: Grant access to specific individual users by user ID
- **Enhanced Access Rules**: Override default user type and role restrictions per chat app
- **Home Page Visibility**: Control which chat apps appear on the home page for different users
- **Access Precedence**: Sophisticated precedence rules for combining different access control methods

**Access Control Precedence:**

The system follows this order when determining chat app access:

1. **Disabled Override**: If `enabled: false` is set in the override, no access regardless of other rules
2. **Exclusive User ID Control**: If `exclusiveUserIdAccessControl` is configured, only those specific user IDs have access
3. **Exclusive Entity Control**: Based on user type:
    - Internal users: Check against `exclusiveInternalAccessControl` list
    - External users: Check against `exclusiveExternalAccessControl` list
4. **General Access Rules**: Fall back to `userTypes`/`userRoles` checking

**Entity-Based Access Control Example:**

This functionality requires the Entity feature to be enabled and configured. See the [Entity Feature Guide](/docs/developer/entity-feature/) for complete setup instructions.

```js
// First, enable the entity feature in pika-config.ts
siteFeatures: {
    entity: {
        enabled: true,
        attributeName: "accountId",
        searchPlaceholderText: "Search for an account...",
        displayNameSingular: "Account",
        displayNamePlural: "Accounts",
        tableColumnHeaderTitle: "Account ID"
    }
}

// Example: Restrict a chat app to specific customer accounts
const customerSupportOverride = {
    enabled: true,
    exclusiveExternalAccessControl: ['account_enterprise_1', 'account_enterprise_2', 'account_premium_gold'],
    exclusiveInternalAccessControl: ['support_department', 'customer_success']
};
```

**Use Cases:**

- **Multi-Tenant SaaS**: Different customers access only their specific chat apps
- **Partner Portals**: Different partner tiers get access to different functionality
- **Department Restrictions**: Internal tools restricted to specific departments
- **Beta Testing**: New features rolled out to specific user groups
- **Compliance**: Regulatory requirements for data access segregation

</Expansion>

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

:::info[Documentation]
See [Custom Message Tags Guide](/docs/developer/custom-message-tags/) for detailed implementation instructions.
:::

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

:::info[Documentation]
See [Authentication Guide](/docs/developer/authentication/) for detailed implementation instructions.
:::

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

### 5. Stack Definition Files

**Locations:**

- `apps/pika-chat/infra/bin/pika-chat.ts` - Chat application AWS CDK stack
- `services/pika/bin/pika.ts` - Service infrastructure AWS CDK stack

**Purpose:** Define your AWS infrastructure and deployment configuration.

**What to customize here:**

- VPC configurations
- Account IDs and regions
- Custom AWS resources
- Environment-specific settings

:::note[Project Name Integration]
Project names are automatically imported from `pika-config.ts`
:::

:::important[Protected by Default]
These files are protected from framework updates by default. If you want to receive framework updates for these files, add them to the `userUnprotectedAreas` array in `.pika-sync.json`.
:::

### Advanced Features

<Expansion title="Entity Feature">

**Purpose:** Associate users with organizational entities (accounts, companies, organizations) to enable entity-based access control, filtering, and display throughout the system.

**Use Case:** Multi-tenant applications, customer support systems, partner portals, and any scenario where users belong to specific organizational entities.

**Configuration:** Enable in `pika-config.ts` siteFeatures with entity display names, field mapping, and implement the autocomplete data source.

**Documentation:** See [Entity Feature Guide](/docs/developer/entity-feature/) for complete configuration and implementation details.

</Expansion>

<Expansion title="User Data Override Feature">

**Purpose:** Allow authorized users to override their authentication-provided data for specific chat apps.

**Use Case:** Internal users acting on behalf of different accounts, companies, or customer contexts without requiring separate authentication sessions.

**Configuration:** Enable in `pika-config.ts` siteFeatures and implement custom UI and server logic.

**Documentation:** See [User Data Override Guide](/docs/developer/overriding-user-data/) for complete implementation details.

</Expansion>

<Expansion title="Content Admin Feature">

**Purpose:** Allow designated super-admin users to view chat sessions and messages for any user in the system for debugging and support.

**Use Case:** Customer support agents, developers troubleshooting issues, and QA teams verifying functionality across different user profiles.

**Configuration:** Enable in `pika-config.ts` siteFeatures and assign `pika:content-admin` role to authorized users.

**Documentation:** See [Content Admin Guide](/docs/developer/content-admin/) for complete setup and usage instructions.

</Expansion>

<Expansion title="Traces Feature">

**Purpose:** Provide visibility into AI reasoning processes, tool invocations, and execution details for debugging and transparency.

**Use Case:** Developers understanding agent behavior, support teams debugging issues, and users gaining insight into AI decision-making.

**Configuration:** Enable in `pika-config.ts` siteFeatures with access control for different user types and roles.

**Documentation:** See [Traces Feature Guide](/docs/developer/traces-feature/) for complete configuration and usage instructions.

</Expansion>

<Expansion title="Verify Response Feature">

**Purpose:** Automatically evaluate AI response accuracy and quality, with optional auto-reprompting for improved responses.

**Use Case:** Ensuring high-quality AI responses in critical applications, meeting accuracy requirements, and building user trust.

**Configuration:** Enable in `pika-config.ts` siteFeatures with configurable quality thresholds and access rules.

**Documentation:** See [Verify Response Feature Guide](/docs/developer/verify-response-feature/) for complete setup and configuration instructions.

</Expansion>

<Expansion title="Chat Disclaimer Notice Feature">

**Purpose:** Display disclaimer messages to users about AI limitations and appropriate usage expectations.

**Use Case:** Legal protection, user education, regulatory compliance, and setting appropriate expectations for AI interactions.

**Configuration:** Configure in `pika-config.ts` siteFeatures with customizable disclaimer text per site or chat app.

**Documentation:** See [Chat Disclaimer Notice Feature Guide](/docs/developer/chat-disclaimer-notice-feature/) for configuration examples and best practices.

</Expansion>

## Configuration Files

### Environment Configuration

**Files:** `.env`, `.env.local`, `.env.*`

**Purpose:** Store environment-specific configuration like API keys, database URLs, and feature flags.

:::important[Protected Files]
These files are never overwritten by sync operations.
:::

### Pika Configuration

**File:** `pika-config.ts`

**Purpose:** Central configuration for project names and settings used across all stacks and resources.

:::important[Protected Configuration]
This file is never overwritten by sync operations.
:::

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
