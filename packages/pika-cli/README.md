# Pika CLI

🐦 **A powerful command-line tool for creating and managing Pika Framework chat applications**

Pika CLI simplifies the process of creating AWS-powered chat applications with the Pika Framework. It provides tools for project setup, authentication configuration, custom component management, and framework synchronization.

## 🚀 Quick Start

### Installation

```bash
# Install globally
npm install -g pika-cli

# Or use with npx
npx pika-cli --help
```

### Create Your First App

```bash
# Interactive setup
pika create-app

# Or specify a name
pika create-app my-chat-app

# With options
pika create-app my-app --template default --skip-git
```

### Navigate to Your Project

```bash
cd my-chat-app
pnpm install  # or npm install
pnpm dev      # or npm run dev
```

## 📚 Table of Contents

- [Installation](#installation)
- [Commands](#commands)
- [Project Structure](#project-structure)
- [Authentication](#authentication)
- [Custom Components](#custom-components)
- [Framework Synchronization](#framework-synchronization)
- [Development](#development)
- [Testing](#testing)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

## 🛠 Commands

### `pika create-app [name]`

Creates a new Pika chat application with interactive setup.

**Options:**

- `-t, --template <template>` - Template to use (default, minimal, enterprise)
- `-d, --directory <directory>` - Output directory
- `--skip-install` - Skip installing dependencies
- `--skip-git` - Skip initializing git repository

**Examples:**

```bash
# Interactive setup
pika create-app

# Minimal setup
pika create-app simple-chat --template minimal

# Custom directory
pika create-app --directory ./projects/my-chat-app

# Skip automatic steps
pika create-app --skip-install --skip-git
```

### `pika sync`

Synchronizes your project with the latest Pika Framework updates.

**Options:**

- `--version <version>` - Specific version to sync to (default: latest)
- `--dry-run` - Preview changes without applying them
- `--force` - Force sync even if there are conflicts

**Examples:**

```bash
# Sync to latest version
pika sync

# Preview changes
pika sync --dry-run

# Sync to specific version
pika sync --version 1.2.0

# Force sync with conflicts
pika sync --force
```

### `pika component`

Manages custom markdown components for your chat application.

**Options:**

- `add <name>` - Add a new custom component
- `list` - List all registered components
- `validate` - Validate component registry

**Examples:**

```bash
# Interactive component management
pika component

# Add a new component
pika component add order-status

# List all components
pika component list

# Validate components
pika component validate
```

### `pika auth`

Manages authentication configuration for your project.

**Options:**

- `setup <provider>` - Setup authentication provider
- `status` - Show current authentication status

**Examples:**

```bash
# Interactive auth management
pika auth

# Setup Google OAuth
pika auth setup auth-js

# Setup custom auth
pika auth setup custom

# Check auth status
pika auth status
```

## 🏗 Project Structure

When you create a new Pika project, you get a well-organized structure:

```
my-pika-app/
├── apps/
│   └── pika-chat/                 # Main chat application
│       ├── src/
│       │   ├── auth/             # Authentication system
│       │   │   ├── types.ts      # Auth interfaces
│       │   │   └── providers/    # Auth providers
│       │   │       ├── mock-auth.ts
│       │   │       └── custom-auth.ts
│       │   └── lib/client/features/chat/
│       │       └── markdown-message-renderer/
│       │           ├── markdown-tag-components/      # Built-in components
│       │           └── custom-markdown-tag-components/ # Your custom components
│       │               ├── index.ts                 # Component registry
│       │               └── example.svelte           # Example component
│       └── package.json
├── services/
│   ├── pika/                     # Core framework service
│   ├── samples/                  # Sample implementations
│   │   └── weather/              # Weather demo (optional)
│   └── custom/                   # Your custom services
├── pika.config.json              # Project configuration
├── .pika-sync.json              # Sync configuration
└── package.json
```

### Key Directories

- **`apps/pika-chat/src/auth/providers/`** - Authentication providers (customize here)
- **`apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/`** - Custom components (safe to modify)
- **`services/custom/`** - Your custom services (safe to modify)
- **`services/pika/`** - Core framework (updated by sync)

## 🔐 Authentication

Pika CLI provides a pluggable authentication system with multiple providers:

### Available Providers

1. **Mock** - Simple mock authentication for development
2. **Auth.js** - OAuth providers (Google, GitHub, etc.)
3. **Custom** - Bring your own authentication system
4. **Enterprise SSO** - SAML/OIDC enterprise single sign-on

### Setup Authentication

```bash
# Interactive setup
pika auth

# Setup specific provider
pika auth setup auth-js
```

### Authentication Flow

1. **Choose Provider**: Select the authentication strategy that fits your needs
2. **Configure Settings**: Set up provider-specific configuration
3. **Install Dependencies**: CLI automatically installs required packages
4. **Set Environment Variables**: Configure your auth provider credentials
5. **Test**: Verify authentication works with your application

### Custom Authentication

To implement custom authentication:

1. Run `pika auth setup custom`
2. Edit `apps/pika-chat/src/auth/providers/custom-auth.ts`
3. Implement the required methods:
    - `authenticate()` - Handle user authentication
    - `logout()` - Handle user logout
    - `getCurrentUser()` - Get current user info
    - `isAuthenticated()` - Check if user is authenticated

## 🎨 Custom Components

Pika allows you to create custom markdown components that can be used in chat responses.

### Creating Components

```bash
# Interactive component creation
pika component add

# Direct component creation
pika component add order-status
```

### Component Structure

```typescript
// order-status.svelte
<script lang="ts">
  export let orderId: string;
  export let status: string = 'pending';
  export let customer: string;
</script>

<div class="order-status">
  <h3>Order #{orderId}</h3>
  <p>Customer: {customer}</p>
  <p>Status: <span class="status-{status}">{status}</span></p>
</div>

<style>
  .order-status {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px;
    margin: 8px 0;
  }

  .status-pending { color: #f59e0b; }
  .status-completed { color: #10b981; }
  .status-cancelled { color: #ef4444; }
</style>
```

### Using Components in Chat

Once created, components can be used in chat responses:

```markdown
Here's your order status:

<order-status orderId="12345" status="completed" customer="John Doe">
```

### Component Registry

Components are automatically registered in `custom-markdown-tag-components/index.ts`:

```typescript
export const customComponents = {
    'order-status': OrderStatusComponent,
    'product-card': ProductCardComponent
    // ... more components
};
```

## 🔄 Framework Synchronization

Keep your project updated with the latest Pika Framework improvements:

### Sync Process

1. **Check Version**: CLI checks for framework updates
2. **Analyze Changes**: Identifies what files need updating
3. **Protect Custom Code**: Your customizations are never overwritten
4. **Apply Updates**: Framework files are updated safely
5. **Report Changes**: Shows what was changed

### Protected Areas

These directories are never modified during sync:

- `apps/pika-chat/src/auth/providers/custom-auth.ts`
- `apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/`
- `services/custom/`
- Environment configuration files (`.env*`)
- `pika.config.json`
- `.pika-sync.json`

### Sync Best Practices

```bash
# Always check what will change first
pika sync --dry-run

# Commit your changes before syncing
git add .
git commit -m "Save work before sync"

# Then sync
pika sync

# Test after sync
pnpm dev
```

## 🔧 Development

### Prerequisites

- Node.js 18.0.0 or higher
- Git
- Package manager (pnpm recommended, npm/yarn supported)

### Local Development Setup

```bash
# Clone the repository
git clone <pika-framework-repo>
cd pika/packages/pika-cli

# Install dependencies
pnpm install

# Build the CLI
pnpm build

# Link for local testing
npm link

# Test the CLI
pika --help
```

### Development Commands

```bash
# Start development mode
pnpm dev

# Build for production (uses TypeScript build script)
pnpm build

# Build with TypeScript compiler only
pnpm build:tsc

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Type checking without compilation
pnpm type-check

# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix
```

### Project Structure (CLI)

```
packages/pika-cli/
├── src/
│   ├── commands/          # CLI commands
│   │   ├── create-app.ts  # Project creation
│   │   ├── sync.ts        # Framework sync
│   │   ├── component.ts   # Component management
│   │   └── auth.ts        # Authentication setup
│   ├── utils/             # Utility functions
│   │   ├── logger.ts      # Logging utilities
│   │   ├── file-manager.ts # File operations
│   │   ├── git-manager.ts  # Git operations
│   │   ├── config-manager.ts # Configuration
│   │   └── system-checker.ts # System validation
│   └── index.ts           # CLI entry point
├── templates/             # Project templates
│   └── default/          # Default template
├── scripts/              # Build and utility scripts (TypeScript)
│   ├── build.ts          # Custom build script
│   ├── migration-template.ts # Migration script template
│   └── tsconfig.json     # TypeScript config for scripts
└── README.md             # This file
```

### TypeScript-First Scripts

All build and utility scripts are written in TypeScript for consistency and type safety:

```bash
# The build command uses our custom TypeScript build script
pnpm build  # Runs: tsx scripts/build.ts

# You can also run scripts directly with tsx
tsx scripts/build.ts
tsx scripts/migration-template.ts 1.0.0 1.1.0

# Traditional TypeScript compilation is also available
pnpm build:tsc  # Runs: tsc
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test create-app.test.ts
```

### Test Structure

```
src/
├── commands/
│   ├── create-app.ts
│   └── __tests__/
│       └── create-app.test.ts
├── utils/
│   ├── logger.ts
│   └── __tests__/
│       └── logger.test.ts
```

### Writing Tests

```typescript
// Example test
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { logger } from '../logger';

describe('Logger', () => {
    beforeEach(() => {
        // Setup before each test
    });

    afterEach(() => {
        // Cleanup after each test
    });

    it('should log info messages', () => {
        const consoleSpy = jest.spyOn(console, 'log');
        logger.info('Test message');
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test message'));
    });
});
```

### Integration Tests

```bash
# Test the CLI end-to-end
pnpm test:integration

# Test specific command
pnpm test:integration -- --testNamePattern="create-app"
```

## 🤝 Contributing

We welcome contributions to the Pika CLI! Here's how to get started:

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**
    ```bash
    git checkout -b feature/amazing-feature
    ```
3. **Make your changes**
4. **Add tests** for new functionality
5. **Run the test suite**
    ```bash
    pnpm test
    pnpm lint
    ```
6. **Commit your changes**
    ```bash
    git commit -m "Add amazing feature"
    ```
7. **Push to your branch**
    ```bash
    git push origin feature/amazing-feature
    ```
8. **Create a Pull Request**

### Code Style

- Use TypeScript for all new code
- Follow the existing code style
- Add JSDoc comments for public APIs
- Use meaningful variable and function names
- Keep functions small and focused

### Commit Messages

Use conventional commit format:

```
feat: add new authentication provider
fix: resolve sync conflict resolution
docs: update README with new examples
test: add integration tests for component command
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Command Not Found

```bash
# If you get "pika: command not found"
npm install -g pika-cli

# Or use npx
npx pika-cli --help
```

#### 2. Permission Errors

```bash
# On macOS/Linux, you might need to use sudo
sudo npm install -g pika-cli

# Or use a Node version manager like nvm
```

#### 3. Sync Conflicts

```bash
# If sync fails due to conflicts
pika sync --dry-run  # See what would change
git stash           # Stash your changes
pika sync           # Sync framework
git stash pop       # Restore your changes
```

#### 4. Authentication Setup Issues

```bash
# Check your auth configuration
pika auth status

# Reconfigure if needed
pika auth setup <provider>
```

#### 5. Component Not Found

```bash
# Validate your component registry
pika component validate

# List all components
pika component list
```

### Getting Help

1. **Check the documentation** - Most issues are covered here
2. **Run with debug mode** - Set `DEBUG=pika:*` or `PIKA_DEBUG=true`
3. **Check system requirements** - Ensure Node.js 18+, Git installed
4. **Search existing issues** - Check the GitHub repository
5. **Create an issue** - If you can't find a solution

### Debug Mode

```bash
# Enable debug logging
DEBUG=pika:* pika create-app
# or
PIKA_DEBUG=true pika create-app
```

### System Check

```bash
# Check system requirements
node --version  # Should be 18.0.0+
git --version   # Should be installed
pnpm --version  # Recommended package manager
```

## 📋 System Requirements

- **Node.js**: 18.0.0 or higher
- **Git**: Required for project initialization and sync
- **Package Manager**: npm (included with Node.js), pnpm (recommended), or yarn
- **Operating System**: macOS, Linux, or Windows

## 🔗 Related Links

- [Pika Framework Documentation](https://pika-framework.dev)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [SvelteKit Documentation](https://kit.svelte.dev/)
- [Auth.js Documentation](https://authjs.dev/)

## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on top of AWS Bedrock for AI capabilities
- Uses SvelteKit for the frontend framework
- Inspired by modern CLI tools like Create React App and Vite
- Thanks to all contributors and the open source community

---

**Happy building with Pika! 🐦✨**

For more information, visit our [documentation](https://pika-framework.dev) or join our [community](https://discord.gg/pika-framework).
