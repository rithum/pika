# Project Structure

This guide explains the structure of your Pika application and what each component does.

## 🏗️ Overview

Your Pika application follows a monorepo structure that separates concerns and enables easy customization. Here's the high-level structure:

```
my-pika-app/
├── apps/                   # Frontend web applications stacks
├── services/               # Backend service stacks
├── packages/               # Shared packages
├── docs/                   # Documentation
├── pika-config.ts          # Project configuration
├── .pika-sync.json         # Sync configuration
├── package.json            # Root package.json
└── pnpm-workspace.yaml     # Workspace configuration
```

## 📱 Applications (`/apps`)

The `apps` directory contains all frontend application stacks in your Pika project.

### Main Chat Application (`/apps/pika-chat`)

The core chat interface that can render any chat application in your platform.

**Key Features:**

- Generic chat interface that works with any agent
- Authentication system
- Custom markdown component support
- File upload/download capabilities
- Responsive design

**Structure:**

```
apps/pika-chat/
├── src/
│   ├── lib/
│   │   ├── client/         # Client-side code
│   │   │   └── features/
│   │   │       └── chat/
│   │   │           └── markdown-message-renderer/
│   │   │               └── custom-markdown-tag-components/  # Your custom components
│   │   └── server/         # Server-side code
│   │       └── auth-provider/  # Authentication system
│   ├── routes/             # SvelteKit routes
│   └── app.html            # Main HTML template
├── infra/                  # AWS CDK infrastructure
│   └── lib/
│       └── stacks/
│           └── custom-stack-defs.ts  # Your custom stack configuration
├── static/                 # Static assets
└── package.json
```

**Customization Areas:**

- **Custom Message Tags**: `src/lib/client/features/chat/message-segments/custom-components/`
- **Authentication**: `src/lib/server/auth-provider/`
- **Infrastructure**: `infra/lib/stacks/custom-stack-defs.ts`

### Sample Applications (`/apps/samples`)

Example applications that demonstrate Pika's capabilities.

#### Enterprise Site (`/apps/samples/enterprise-site`)

A sample web application that demonstrates embedded chat mode.

**Purpose:**

- Shows how to embed Pika chat in existing applications
- Demonstrates iframe integration
- Example of a complete web application

## 🔧 Services (`/services`)

The `services` directory contains all backend service stacks.

### Core Pika Service (`/services/pika`)

The main backend service that provides chat app management, agent management, tool orchestration and agent invocation (called from front end).

**Key Features:**

- Chat App and agent management infrastructure
- Tool orchestration
- Knowledge base integration
- AWS Bedrock integration

**Structure:**

```
services/pika/
├── src/                    # Source code
├── lib/                    # Library code
│   └── stacks/
│       └── custom-stack-defs.ts  # Your custom stack configuration
├── bin/                    # CDK app entry points
└── package.json
```

**Customization Areas:**

- **Infrastructure**: `lib/stacks/custom-stack-defs.ts`; use if need to add resources to the stack (shouldn't be needed in default cases)

### Custom Services (`/services/custom`)

Your custom backend services and API endpoints.

**Purpose:**

- Add new API services
- Background job processors
- Data processing pipelines
- Integration services

**Example Use Cases:**

- Payment processing services
- Email notification services
- Data analytics services
- Third-party integrations (CRM, marketing tools, etc.)

### Sample Services (`/services/samples`)

Example services that demonstrate how to build agents and tools.

#### Weather Service (`/services/samples/weather`)

A complete example of how to define a chat application and agent.

**What it demonstrates:**

- Agent definition with instructions
- Tool implementation (weather API integration)
- AWS CDK stack for deployment
- Complete chat application lifecycle

**Structure:**

```
services/samples/weather/
├── src/                    # Source code
├── lambda/                 # Lambda function code
├── lib/                    # Library code
├── bin/                    # CDK app entry points
└── package.json
```

## 📦 Shared Packages (`/packages`)

The `packages` directory contains shared code and utilities used across multiple applications and services.

**Common packages:**

- **Type definitions** - Shared TypeScript interfaces
- **Utility functions** - Common helper functions
- **Configuration** - Shared configuration utilities
- **Testing utilities** - Common test helpers

## ⚙️ Configuration Files

### Project Configuration (`pika-config.ts`)

The central configuration file for your entire Pika project.

**Purpose:**

- Define project names for all stacks and resources
- Centralized configuration management
- Type-safe configuration with TypeScript

**Example:**

```typescript
export const pikaConfig: PikaConfig = {
    pika: {
        projNameL: 'mycompany',
        projNameKebabCase: 'mycompany',
        projNameTitleCase: 'MyCompany',
        projNameCamel: 'mycompany',
        projNameHuman: 'My Company'
    },
    pikaChat: {
        projNameL: 'mycompanychat',
        projNameKebabCase: 'mycompany-chat',
        projNameTitleCase: 'MyCompanyChat',
        projNameCamel: 'myCompanyChat',
        projNameHuman: 'My Company Chat'
    }
};
```

**Important:** This file is protected from framework updates and will never be overwritten.

### Sync Configuration (`.pika-sync.json`)

Tracks sync status and allows you to customize which files are protected from framework updates.

**Key sections:**

- `protectedAreas` - Framework-managed list of protected files
- `userProtectedAreas` - Additional files you want to protect
- `userUnprotectedAreas` - Default protected files you want to allow updates for

**Example:**

```json
{
    "userProtectedAreas": ["my-custom-config.ts", "apps/my-custom-app/"],
    "userUnprotectedAreas": ["apps/pika-chat/infra/bin/pika-chat.ts"]
}
```

### Workspace Configuration (`pnpm-workspace.yaml`)

Defines the monorepo workspace structure for pnpm.

**Content:**

```yaml
packages:
    - 'apps/*'
    - 'services/*'
    - 'packages/*'
```

## 🔒 Protected Areas

Pika Framework automatically protects certain areas from being overwritten during sync operations:

### Default Protected Areas

- `apps/pika-chat/src/lib/client/features/chat/message-segments/custom-components/`
- `apps/pika-chat/src/lib/server/auth-provider/`
- `services/custom/`
- `apps/custom/`
- `.env`, `.env.local`, `.env.*`
- `pika-config.ts`
- `.pika-sync.json`
- `.gitignore`, `package.json`, `pnpm-lock.yaml`
- Any path that starts with `custom-` whether a file or directory

### Custom Protection

You can add additional protected areas by editing `.pika-sync.json`:

```json
{
    "userProtectedAreas": ["my-custom-file.ts", "apps/my-custom-app/", "services/my-custom-service/"]
}
```

## 🎯 Key Customization Points

### 1. Project Configuration

**File:** `pika-config.ts`
**Purpose:** Update project names and settings
**Protected:** Yes

### 2. Custom Message Tags

**Location:** `apps/pika-chat/src/lib/client/features/chat/message-segments/custom-components/`
**Purpose:** Add custom renderers for XML tags in LLM responses and metadata handlers
**Protected:** Yes

### 3. Authentication

**Location:** `apps/pika-chat/src/lib/server/auth-provider/`
**Purpose:** Implement custom authentication flows
**Protected:** Yes

### 4. Custom Applications

**Location:** `apps/custom/`
**Purpose:** Add new web applications
**Protected:** Yes

### 5. Custom Services

**Location:** `services/custom/`
**Purpose:** Add new backend services
**Protected:** Yes

### 6. Infrastructure Customization

**Locations:**

- `apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts`
- `services/pika/lib/stacks/custom-stack-defs.ts`

**Purpose:** Customize AWS infrastructure
**Protected:** Yes (by default)

## 📚 Next Steps

Now that you understand the project structure:

1. **Configure your project** - Update `pika-config.ts` with your project names
2. **Learn about customization** - Read the [Customization Guide](./customization.md)
3. **Set up authentication** - Follow the [Authentication Setup](./authentication.md)
4. **Deploy your services** - Check out [Local Development](./local-development.md) or [AWS Deployment](./aws-deployment.md)

---

**Ready to start customizing?** Check out the [Customization Guide](./customization.md) to learn how to add your own features!
