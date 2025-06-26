# Installation Guide

This guide provides detailed instructions for installing and setting up Pika Framework on your system.

## 📋 Prerequisites

### System Requirements

- **Operating System**: macOS, Linux, or Windows
- **Node.js**: Version 22.0.0 or higher
- **Git**: For version control and cloning repositories
- **Internet Connection**: For downloading packages and cloning repositories

### Required Software

#### 1. Node.js

Pika Framework requires Node.js version 22.0.0 or higher. To check your current version:

```bash
node --version
```

If you need to install or update Node.js:

**macOS (using Homebrew):**

```bash
brew install node
```

**Linux (using NodeSource):**

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows:**
Download and install from [nodejs.org](https://nodejs.org/)

#### 2. pnpm Package Manager

Pika Framework uses pnpm as the required package manager (haven't used it before? try it out, it's just like npm but better)

**Check if pnpm is installed:**

```bash
pnpm --version
```

**Install pnpm globally:**

```bash
# Using npm
npm install -g pnpm

# Using the official installer (recommended)
curl -fsSL https://get.pnpm.io/install.sh | sh -

# On Windows (PowerShell)
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

#### 3. Git

Git is required for version control and cloning the Pika framework repository.

**Check if Git is installed:**

```bash
git --version
```

**Install Git:**

**macOS:**

```bash
brew install git
```

**Linux:**

```bash
sudo apt-get install git  # Ubuntu/Debian
sudo yum install git      # CentOS/RHEL
```

**Windows:**
Download and install from [git-scm.com](https://git-scm.com/)

## 🚀 Installing Pika CLI

### Global Installation

Install the Pika CLI globally to access it from anywhere on your system:

```bash
pnpm install -g @pika/cli
```

### Verify Installation

Check that the CLI was installed correctly:

```bash
pika --version
```

You should see the version number of the Pika CLI.

## 🚨 IMPORTANT: Security Notice for Production

**⚠️ READ THIS BEFORE DEPLOYING TO PRODUCTION ⚠️**

Pika Framework includes a **mock authentication provider** for development that:

- **Automatically authenticates anyone** who visits your site as a test user
- **Provides no real security** - no passwords or validation required
- **Is designed for development only** - not suitable for production use

**Before deploying to production:**

1. **Implement a custom authentication provider** (see [Authentication Guide](./authentication.md))
2. **Configure user types** (`internal-user` vs `external-user`) properly
3. **Set chat app access controls** using `userTypesAllowed`
4. **Test your authentication** thoroughly in staging

**Security risk example:**

```typescript
// Accessible by internal users only
const adminTools: ChatApp = {
    chatAppId: 'admin-tools',
    title: 'Admin Tools'
    // No userTypesAllowed means defaults to internal-user
};

// Accessible by internal users only
const adminTools: ChatApp = {
    chatAppId: 'admin-tools',
    title: 'Admin Tools',
    userTypesAllowed: ['internal-user']
};
```

👉 **Learn more:** [Getting Started Security Guide](./getting-started.md#critical-security-and-authentication)

### CLI Commands

Once installed, you'll have access to these commands:

- `pika create-app <name>` - Create a new Pika application
- `pika sync` - Sync framework updates
- `pika sync --help` - Get help with the sync system

## 🔧 Development Environment Setup

### IDE Recommendations

For the best development experience, we recommend:

- **VS Code** or **Cursor** with the following extensions:

    - **Svelte for VS Code** (`svelte.svelte-vscode`) - Svelte language support and IntelliSense
    - **Draw.io Integration** (`hediet.vscode-drawio`) - Edit .drawio files directly in VS Code
    - **Markdown All in One** (`yzhang.markdown-all-in-one`) - Enhanced Markdown support
    - **Markdown Preview Enhanced** (`shd101wyy.markdown-preview-enhanced`) - Advanced Markdown preview
    - **Prettier - Code formatter** (`esbenp.prettier-vscode`) - Automatic code formatting

- **Cursor** (AI-powered editor based on VS Code)

#### Installing Recommended Extensions

**Option 1: Install from VS Code/Cursor (Recommended)**

1. Open VS Code or Cursor
2. Go to the Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for each extension by name and install them

**Option 2: Install from Command Line**

```bash
# Install all recommended extensions at once
code --install-extension svelte.svelte-vscode
code --install-extension hediet.vscode-drawio
code --install-extension yzhang.markdown-all-in-one
code --install-extension shd101wyy.markdown-preview-enhanced
code --install-extension esbenp.prettier-vscode
```

**Option 3: Auto-install from Project**

If you open the Pika project in VS Code/Cursor, you'll see a notification asking if you want to install the recommended extensions. Click "Install" to install all of them at once.

### AWS CLI (Optional)

If you haven't already, you should probably install the awscli

**macOS:**

```bash
brew install awscli
```

**Linux:**

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**Windows:**
Download and install from [aws.amazon.com/cli](https://aws.amazon.com/cli/)

### AWS CDK (Optional)

For AWS deployment, you may well also need the AWS CDK CLI:

```bash
pnpm install -g aws-cdk
```

## 🐛 Troubleshooting Installation

### Common Issues

#### 1. Node.js Version Issues

If you get version-related errors:

```bash
# Check your Node.js version
node --version

# If it's below 22.0.0, update Node.js
# On macOS with Homebrew:
brew upgrade node

# On Linux, reinstall from NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Consider using Node Version Manager (nvm):**

If you haven't already, consider installing [nvm](https://github.com/nvm-sh/nvm) to easily switch between Node.js versions. This is especially useful if you work on multiple projects with different Node.js requirements.

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart your terminal or run:
source ~/.bashrc

# Install and use Node.js 22
nvm install 22
nvm use 22
nvm alias default 22
```

#### 2. pnpm Installation Issues

If pnpm installation fails:

```bash
# Try the official installer
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

### Getting Help

If you're still experiencing issues:

1. **Check the troubleshooting guide** for more specific solutions
2. **Search existing issues** on the [GitHub repository](https://github.com/rithum/pika)
3. **Create a new issue** with details about your environment and error messages

## ✅ Verification

After installation, verify everything is working:

```bash
# Check all tools are available
node --version
pnpm --version
git --version
pika --version

# Create a test application
pika create-app test-app
cd test-app
pnpm build
pnpm dev
```

If all commands work and you can access your application at `http://localhost:3000`, your installation is complete!

## 📚 Next Steps

Now that you have Pika Framework installed:

1. **Create your first application** - Follow the [Getting Started Guide](./getting-started.md)
2. **Learn about project structure** - Read [Project Structure](./project-structure.md)
3. **Start customizing** - Check out the [Customization Guide](./customization.md)

---

**Ready to create your first Pika application?** Head to the [Getting Started Guide](./getting-started.md)!
