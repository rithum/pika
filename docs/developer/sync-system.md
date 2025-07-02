# Sync System

The Pika Framework sync system allows you to receive updates from the main framework repository while preserving your customizations. This guide explains how the sync system works and how to use it effectively.

## 🔄 Overview

Your Pika project is a fork of the Pika framework that you can check into your own source control. The sync system intelligently merges framework updates with your changes, ensuring you can continue to receive improvements while maintaining your customizations.

### 📦 Package.json Special Handling

The sync system includes special handling for `package.json` files to intelligently merge dependencies and scripts:

- **Smart Dependency Merging**: Your added dependencies and scripts are preserved while framework updates are applied
- **Selective Updates**: Only changed values are updated; your additions remain untouched
- **Interactive Confirmation**: You're prompted to confirm each package.json change with detailed information about what will be updated

## 🛡️ How It Works

### The Sync Process

1. **Download Latest Framework**: The sync command downloads the latest Pika framework from GitHub
2. **Compare Changes**: It compares your project with the framework to identify changes
3. **Smart Package.json Merging**: For package.json files, it intelligently merges dependencies and scripts
4. **Apply Updates**: It applies framework updates while preserving your customizations
5. **Handle Conflicts**: It handles conflicts by asking you how to resolve them

### Protection System

The sync system uses multiple layers of protection to preserve your work:

- **Default Protected Areas**: Core customization directories and config files defined in `.pika-sync.json#protectedAreas` (don't modify protectedAreas)
- **Custom Protection**: Any path segment starting with "custom-" is automatically protected
- **User Protected Areas**: Additional files you specify in `.pika-sync.json#userProtectedAreas`
- **User Unprotected Areas**: Files you explicitly allow to sync that are in protectedAreas and that you add to `.pika-sync.json#userUnprotectedAreas`

#### Protection Pattern Types

The protection system supports three types of patterns:

1. **Directory Patterns** (ending with `/`): Protects entire directories and all contents

    - Example: `services/custom/` protects all files in the directory and subdirectories

2. **Exact Path Patterns** (containing `/`): Protects specific files at exact locations

    - Example: `apps/pika-chat/my-file.ts` protects only that specific file

3. **Filename Patterns** (no `/`): Protects files with that name anywhere in the project (gitignore-style)
    - Example: `cdk.context.json` protects any file named `cdk.context.json` regardless of location
    - Example: `.env` protects all `.env` files at any directory level

#### Pattern Matching Examples

Here's how different patterns work in practice:

| Pattern               | Type       | Matches                                                                         | Doesn't Match                                          |
| --------------------- | ---------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `services/custom/`    | Directory  | `services/custom/api.ts`<br>`services/custom/auth/config.ts`                    | `services/custom-api/`                                 |
| `pika-config.ts`      | Filename   | `pika-config.ts`<br>`apps/chat/pika-config.ts`<br>`services/api/pika-config.ts` | `pika-config.backup.ts`                                |
| `apps/chat/config.ts` | Exact Path | `apps/chat/config.ts`                                                           | `apps/chat/auth/config.ts`<br>`services/api/config.ts` |
| `.env`                | Filename   | `.env`<br>`apps/chat/.env`<br>`services/api/.env`                               | `.env.local`<br>`my.env`                               |
| `.env.*`              | Filename   | `.env.local`<br>`apps/chat/.env.production`                                     | `.env`<br>`custom.env.local`                           |

## ⚙️ Configuration

### Sync Configuration File (`.pika-sync.json`)

The `.pika-sync.json` file tracks your sync status and allows you to customize sync behavior:

```json
{
    "pikaVersion": "1.0.0",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "lastSync": "2024-01-01T00:00:00.000Z",
    "protectedAreas": [
        "apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/",
        "apps/pika-chat/src/lib/server/auth-provider/",
        "services/custom/",
        "apps/custom/",
        ".env",
        ".env.local",
        ".env.*",
        "pika-config.ts",
        ".pika-sync.json",
        ".gitignore",
        "package.json",
        "pnpm-lock.yaml"
    ],
    "userProtectedAreas": ["my-custom-file.ts", "apps/my-custom-app/"],
    "userUnprotectedAreas": ["package.json"],
    "initialConfiguration": {
        "createdAt": "2024-01-01T00:00:00.000Z"
    }
}
```

### Key Configuration Sections

#### `protectedAreas`

Framework-managed list of protected files. **Don't edit this section** - it's managed by the framework.

#### `userProtectedAreas`

Additional files you want to protect from framework updates. Supports all three pattern types:

```json
"userProtectedAreas": [
    "my-custom-config.ts",           // Filename pattern - protects anywhere
    "apps/my-custom-app/",           // Directory pattern - protects entire directory
    "services/api/my-service.ts",    // Exact path pattern - protects specific file
    "Dockerfile",                    // Filename pattern - protects all Dockerfiles
    ".env.production"                // Filename pattern - protects anywhere
]
```

#### `userUnprotectedAreas`

Default protected files you want to allow updates for. Also supports all three pattern types:

```json
"userUnprotectedAreas": [
    "package.json",                  // Filename pattern - allows updates to all package.json files
    "pnpm-lock.yaml",               // Filename pattern - allows updates anywhere
    "apps/pika-chat/specific.ts"    // Exact path pattern - allows updates to specific file only
]
```

## 🔒 Default Protected Areas

The following areas are automatically protected from framework updates:

### Core Customization Areas

- `apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/`
- `apps/pika-chat/src/lib/server/auth-provider/`
- `services/custom/`
- `apps/custom/`

### Configuration Files

- `.env`, `.env.local`, `.env.*`
- `pika-config.ts`
- `.pika-sync.json`
- `.gitignore`, `package.json`, `pnpm-lock.yaml`

### Automatic Protection

Any path segment starting with "custom-" is automatically protected:

- `custom-components/` - directory anywhere in project
- `custom-services/` - directory anywhere in project
- `custom-file.ts` - file anywhere in project
- `apps/my-app/custom-config/` - subdirectory with custom- prefix
- `services/api/custom-middleware.ts` - file with custom- prefix

## 📦 Package.json Special Handling

The sync system includes intelligent handling for `package.json` files that goes beyond simple file comparison.

### How Package.json Merging Works

When a `package.json` file differs between your fork and the framework, the sync system:

1. **Compares Top-Level Attributes**: Analyzes each attribute (name, version, description, etc.)
2. **Preserves Your Additions**: If you have attributes the framework doesn't have, they're kept
3. **Adds Framework Additions**: If the framework has attributes you don't have, they're added
4. **Smart Dependency Handling**: For `scripts`, `dependencies`, and `devDependencies`:
    - **Your additions are preserved**: If you add a script or dependency, it stays
    - **Framework additions are added**: If the framework adds new scripts/dependencies, they're added
    - **Conflicts are resolved**: If both have the same key with different values, framework wins

### Example Package.json Sync

**Your package.json:**

```json
{
    "name": "my-project",
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "my-custom-script": "echo 'custom'"
    },
    "dependencies": {
        "react": "^18.0.0",
        "my-custom-package": "^1.0.0"
    }
}
```

**Framework package.json:**

```json
{
    "name": "pika-project",
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "test": "vitest"
    },
    "dependencies": {
        "react": "^18.0.0",
        "vite": "^5.0.0"
    }
}
```

**Result after sync:**

```json
{
    "name": "pika-project", // Framework wins (modified)
    "scripts": {
        "dev": "vite", // Same, no change
        "build": "vite build", // Same, no change
        "test": "vitest", // Added from framework
        "my-custom-script": "echo 'custom'" // Preserved from fork
    },
    "dependencies": {
        "react": "^18.0.0", // Same, no change
        "vite": "^5.0.0", // Added from framework
        "my-custom-package": "^1.0.0" // Preserved from fork
    }
}
```

### Interactive Confirmation

For each package.json file that has changes, you'll see:

```
📦 Package.json changes detected in apps/pika-chat/package.json:
   • Modified attributes: name
   • Added scripts: test
   • Added dependencies: vite
   • Your additions will be preserved: my-custom-script, my-custom-package

Apply package.json changes to apps/pika-chat/package.json? (Y/n)
```

## 📁 Sample Directory Handling

The sync system handles sample applications intelligently:

### Sample Applications

- `services/samples/weather` and `apps/samples/enterprise-site` are sample applications
- They will be synced automatically if you haven't modified them
- If you modify a sample, your changes will be preserved during sync
- If you delete a sample, it won't be restored (you can remove samples you don't want)

### Learning from Samples

This allows you to:

- Learn from samples while keeping your modifications
- Remove samples you don't need
- Customize samples for your use case

## 🔧 Using the Sync Command

### Basic Sync

```bash
# Sync with the latest framework version
pika sync
```

### Sync Options

```bash
# Show what would be updated without applying changes
pika sync --dry-run

# Show diffs for changed files
pika sync --diff

# Open diffs in your IDE visually (Cursor or VS Code)
pika sync --visual-diff

# Enable detailed debug logging
pika sync --debug

# Sync from a specific branch
pika sync --branch develop

# Get help with sync options
pika sync --help
```

### Sync Workflow

1. **Check Current Status**:

    ```bash
    pika sync --dry-run
    ```

2. **Review Changes**:

    ```bash
    pika sync --diff
    ```

3. **Apply Updates**:
    ```bash
    pika sync
    ```

## 🎯 User Modification Handling

When you modify files outside protected areas, the sync command will:

### Detection

- Detect your modifications and show you what files are affected
- Compare your changes with the framework version

### Resolution Options

For each modified file, you'll be asked what to do:

1. **Overwrite**: Use the framework version (lose your changes)
2. **Protect**: Add the file to `userProtectedAreas` in `.pika-sync.json`
3. **Skip**: Skip this file for now (will be overwritten in future syncs)
4. **Cancel**: Cancel the sync operation

### Example Interaction

```
File 'apps/pika-chat/src/routes/+page.svelte' has been modified.
What would you like to do?

1. Overwrite with framework version
2. Protect this file (add to userProtectedAreas)
3. Skip this file for now
4. Cancel sync

Enter your choice (1-4): 2
```

## 📋 Best Practices

### 1. Use Designated Areas

Always place your custom code in the designated customization areas:

- `apps/custom/` for custom applications
- `services/custom/` for custom services
- `custom-markdown-tag-components/` for custom UI components
- `auth-provider/` for authentication
- `custom-stack-defs.ts` to customize stack resources

### 2. Configure Project Names First

Update `pika-config.ts` with your project names before making other changes.

### 3. Manage Dependencies Intelligently

- **Add custom dependencies**: Add them to your package.json files - they'll be preserved during sync
- **Add custom scripts**: Add them to your package.json files - they'll be preserved during sync
- **Don't modify framework dependencies**: Let the framework manage its own dependencies
- **Review package.json changes**: Always review what the sync system proposes to change

### 4. Test After Sync

Always test your application after each sync to ensure everything works correctly.

### 5. Commit Before Syncing

Commit your changes to source control before running sync operations.

### 6. Review Changes

Use `--dry-run` and `--diff` options to review changes before applying them.

### 7. Protect Important Files

Add important custom files to `userProtectedAreas` if they're not in default protected areas.

## 🔄 Source Control Integration

### Your Project is Standalone

- Your project is a complete, standalone repository
- You can commit it to your own Git repository
- The sync system works independently of your source control

### Framework Updates

- Framework updates are applied to your local working directory
- You control when and how to commit framework updates
- You can review changes before committing

### Recommended Workflow

```bash
# Before syncing
git add .
git commit -m "Save current state before sync"

# Run sync
pika sync

# Review changes
git diff

# Commit framework updates
git add .
git commit -m "Sync framework updates"
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Sync Fails

**Symptoms**: Sync command fails with network or GitHub errors

**Solutions**:

- Use `--debug` for detailed information

#### 2. Unexpected File Overwrites

**Symptoms**: Files you expected to be protected were overwritten

**Solutions**:

- Check `.pika-sync.json` configuration
- Add files to `userProtectedAreas`
- Review the file path matches exactly

#### 3. Merge Conflicts

**Symptoms**: Sync stops due to merge conflicts

**Solutions**:

- Resolve conflicts manually
- Use `--diff` to see what changed
- Consider protecting the file if it's custom

### Getting Help

If you encounter sync issues:

1. **Use debug mode**: `pika sync --debug`
2. **Check your configuration**: Review `.pika-sync.json`
3. **Review recent changes**: Use `git log` to see recent commits
4. **Search existing issues**: Check the [GitHub repository](https://github.com/rithum/pika)
5. **Create a new issue**: Provide detailed error information

## 📚 Learn More

- **Framework documentation**: [https://github.com/rithum/pika](https://github.com/rithum/pika)
- **Customization guide**: [Customization Guide](./customization.md)
- **Run sync help**: `pika sync --help`

## 🎯 Quick Reference

### Essential Commands

```bash
# Check what would be updated
pika sync --dry-run

# Sync with latest framework
pika sync

# Get help
pika sync --help
```

### Key Files

- `.pika-sync.json` - Sync configuration
- `pika-config.ts` - Project configuration (protected)
- `apps/custom/` - Custom applications (protected)
- `services/custom/` - Custom services (protected)

### Protection Rules

- Files in `custom-*` directories are automatically protected
- Configuration files are protected by default
- Add files to `userProtectedAreas` for additional protection
- Use `userUnprotectedAreas` to allow updates to default protected files

### Package.json Rules

- Your added dependencies and scripts are automatically preserved
- Framework updates to existing dependencies are applied
- New framework dependencies and scripts are added
- You're prompted to confirm each package.json change

---

**Ready to sync?** Start with `pika sync --dry-run` to see what updates are available!
