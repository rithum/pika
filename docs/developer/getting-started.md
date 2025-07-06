# Getting Started with Pika Framework

Welcome to Pika Framework! This guide will help you get up and running with your first AI-powered chat application in minutes.

## 🚀 Quick Start

### Prerequisites

Before you begin, make sure you have:

1. **Node.js 22+** installed on your system
2. **pnpm** package manager (required)
3. **Git** for version control

### Install pnpm (if not already installed)

Pika Framework uses pnpm as the required package manager. If you don't have it installed:

```bash
# Install pnpm globally
npm install -g pnpm

# Or using the official installer
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

### Install Pika CLI

Install the Pika CLI globally to create and manage your Pika applications:

```bash
pnpm install -g @pika/cli
```

### Create Your First Application

Create a new Pika application with a single command:

```bash
pika create-app my-chat-app
```

**Important Notes:**

- This creates a **generic framework** for defining multiple chat applications and agents
- You typically only need **one Pika installation per AWS account**
- The framework provides the infrastructure to host and manage multiple chat apps
- You'll define your specific chat apps and agents within this framework

This command will:

- Clone the Pika framework repository
- Set up a complete project structure
- Install all dependencies
- Configure the project for your use case

### Start Development

Navigate to your new project and start the development server:

```bash
cd my-chat-app
pnpm dev
```

Your application will be available at `http://localhost:3000`!

## 🎯 What You Get

When you create a Pika application, you receive a complete, production-ready chat application framework with:

### Core Components

- **Generic Chat Frontend** (`/apps/pika-chat`) - A ready-to-use chat interface that can render any chat app
- **Generic Chat Backend** (`/services/pika`) - Core infrastructure for agent management and tool orchestration
- **Sample Weather Service** (`/services/samples/weather`) - Example of how to define a chat app/agent
- **Sample Web Application** (`/apps/samples/enterprise-site`) - Demo of embedded chat mode

### Key Features

- **Authentication System** - Ready-to-customize authentication in the frontend
- **Custom Message Tags** - Render XML tags from LLM responses with custom UI components
- **AWS CDK Integration** - Infrastructure as Code for easy deployment
- **Sync System** - Keep your customizations while receiving framework updates
- **AI Transparency** - Traces feature shows AI reasoning and tool invocations
- **Quality Assurance** - Verify response feature automatically checks AI response accuracy
- **User Education** - Chat disclaimer notices inform users about AI limitations
- **Feature Overrides** - Customize features per chat app for specialized behavior

## 🚨 CRITICAL: Security and Authentication

**⚠️ DO NOT DEPLOY TO PRODUCTION WITHOUT READING THIS SECTION ⚠️**

### Default Mock Authentication - DEVELOPMENT ONLY

Pika Framework ships with a **mock authentication provider** that:

- **Hardcodes a single test user** with no password requirement
- **Automatically logs in anyone** who visits your site as this test user
- **Provides no real security** - anyone can access your chat applications
- **Is intended for development and testing only**

**🔒 PRODUCTION DEPLOYMENT REQUIREMENTS:**

1. **Implement a custom authentication provider** before deploying publicly
2. **Configure user types and chat app visibility** to prevent unauthorized access
3. **Test your authentication thoroughly** in a staging environment

### Understanding User Types and Chat App Security

Pika Framework uses a **two-tier security model** that you must understand:

#### User Types

- **`internal-user`**: Company employees, administrators, internal staff
- **`external-user`**: Customers, partners, external users
- Users without a defined userType are set to 'internal-user' by default

#### Chat App Visibility

- **Internal-only**: Chat apps accessible only to `internal-user` types
- **External-only**: Chat apps accessible only to `external-user` types
- **Both**: Chat apps accessible to both user types (default if not specified)

#### Security Risk Example

```typescript
const adminChatApp: ChatApp = {
    chatAppId: 'admin-tools',
    title: 'Administrative Tools'
    // No userTypesAllowed means we restrict the app to internal users only
};

// ✅ SECURE - This chat app is restricted to internal users only
const adminChatApp: ChatApp = {
    chatAppId: 'admin-tools',
    title: 'Administrative Tools',
    userTypesAllowed: ['internal-user'] // Only internal users can access
};
```

**📖 Next Steps for Production:**

1. Read the [Authentication Guide](./authentication.md) to implement your auth provider
2. Review [Chat App Security](#) to configure proper access controls
3. Test your setup in a staging environment before going live

## 🏗️ Project Structure

Your Pika application follows a monorepo structure:

```
my-chat-app/
├── apps/
│   ├── pika-chat/          # Main chat frontend application
│   └── samples/            # Sample applications
├── services/
│   ├── pika/              # Core backend service
│   ├── custom/            # Your custom chat app stacks (see Stack Management below)
│   └── samples/           # Sample services
├── packages/              # Shared packages
├── pika-config.ts         # Project configuration
└── .pika-sync.json        # Sync configuration
```

## 🏢 Stack Management Best Practices

### Understanding the Framework Architecture

Pika Framework is designed to be a **single installation per AWS account** that can host multiple chat applications and agents. Here's how to think about it:

#### **One Framework, Many Chat Apps**

- The core Pika service (`/services/pika`) provides the infrastructure for all your chat apps
- Each chat app you create becomes a separate stack that registers with the core service
- You can have multiple chat apps (weather, customer service, data analysis, etc.) all running from the same framework

#### **Recommended Approach: Separate Repositories**

**Best Practice**: Create your own separate Git repository and copy the necessary components from the weather sample stack to define your chat app and agent:

1. **Create a new repository** for your chat app stack
2. **Copy the weather sample structure** (`/services/samples/weather`) to your new repository
3. **Modify the copied stack** with your specific agent definitions, tools, and knowledge bases
4. **Deploy your stack** alongside the core Pika service

**Benefits of this approach:**

- Clean separation from the framework code
- Independent development and deployment cycles
- Better version control and Git history
- Team autonomy for different chat apps
- Easier maintenance and reusability

#### **Alternative Approach: Custom Stacks in Monorepo**

You can also create new stacks in `/services/custom/`:

- **Use this approach** if you don't have existing repositories to modify
- **Use this approach** if your chat app is simple and doesn't warrant a separate repo
- **Use this approach** for rapid prototyping before creating separate repos
- **Use this approach** if your team prefers to keep everything in one repository

**Note**: The weather sample is provided as a reference - copy from it rather than modifying it directly. This keeps the framework clean and your chat app code separate.

### Stack Organization Examples

```
services/
├── pika/                    # Core framework (deploy once)
├── samples/
│   └── weather/            # Sample chat app (modify for your needs)
└── custom/                 # Your custom stacks (optional)
    ├── customer-service/   # Custom customer service chat app
    ├── data-analytics/     # Custom data analysis chat app
    └── sales-assistant/    # Custom sales assistant chat app
```

## 🔧 Next Steps

After creating your application, you'll want to:

1. **Configure Your Project** - Update project names used for AWS stack/resources names in `pika-config.ts`
2. **Choose Your Stack Approach** - Decide whether to modify existing stacks or create custom ones
3. **Define Your First Chat App** - Modify the weather sample or create a new stack for your first chat app
4. **Configure Site Features** - Set up site-wide features like home page chat app links for different user types
5. **Customize Authentication** - Set up your authentication provider
6. **Add Custom Message Tags** - Create custom renderers for XML tags in LLM responses
7. **Deploy Your Services** - Deploy to AWS or run locally

## 📚 Learn More

- **Installation Guide** - Detailed setup instructions
- **Project Structure** - Understanding your Pika project
- **Customization Guide** - How to customize Pika for your needs
- **Local Development** - Running Pika locally
- **AWS Deployment** - Deploying to AWS

## 🆘 Need Help?

- Check the [Troubleshooting Guide](./troubleshooting.md) for common issues
- Visit the [GitHub repository](https://github.com/rithum/pika) for issues and discussions
- Review the [conceptual documentation](../concepts/) to understand the framework philosophy

---

**Ready to dive deeper?** Check out the [Installation Guide](./installation.md) for detailed setup instructions, or jump straight to [Customization](./customization.md) to start building your custom features!
