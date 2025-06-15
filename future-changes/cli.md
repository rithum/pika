# Pika CLI Tool - Complete Implementation Plan

## Overview

The `pika-cli` package provides the `pika` command-line tool for creating and managing Pika projects. Users install globally via `npm install -g pika-cli`, then use commands like `pika create-app` and `pika sync`.

**Key Features:**

- **Project Creation**: `pika create-app` copies the complete framework and sets up customization areas
- **Framework Sync**: `pika sync` intelligently updates framework code while preserving user customizations
- **Version Tracking**: `.pika-sync.json` tracks the initial framework version to enable proper synchronization

## 1. CLI Package Structure

```
/packages/pika-cli/
├── package.json                     # CLI package definition
├── bin/
│   └── pika.js                     # CLI entry point
├── src/
│   ├── index.ts                    # Main CLI logic and command routing
│   ├── commands/
│   │   ├── create-app.ts           # Create new Pika project command
│   │   └── sync.ts                 # Sync framework updates command
│   ├── prompts.ts                  # Interactive setup questions
│   ├── template-generator.ts       # Template creation logic
│   ├── file-operations.ts          # File copying and manipulation
│   ├── git-operations.ts           # Git initialization and setup
│   └── config-generator.ts         # Generate pika.config.ts
├── templates/
│   ├── auth/
│   │   └── custom-auth.ts.template # Custom auth template
│   ├── components/
│   │   ├── index.ts.template       # Component registry template
│   │   └── example-order.svelte    # Example custom component
│   ├── config/
│   │   └── pika.config.ts.template # Config file template
│   └── package-json-additions.json # Package.json additions
└── utils/
    └── version-utils.ts            # Version tracking and comparison utilities
```

## 2. CLI Entry Point (`bin/pika.js`)

```javascript
#!/usr/bin/env node

const { runCli } = require('../dist/index.js');

runCli().catch((error) => {
    console.error('Pika CLI error:', error);
    process.exit(1);
});
```

## 3. Main CLI Logic (`src/index.ts`)

```typescript
import { program } from 'commander';
import { createAppCommand } from './commands/create-app';
import { syncCommand } from './commands/sync';

export async function runCli() {
    program.name('pika').description('Pika framework CLI tool').version('1.0.0');

    // Create app command
    program
        .command('create-app')
        .description('Create a new Pika project')
        .argument('[project-name]', 'Name of the project directory')
        .option('--no-install', 'Skip dependency installation')
        .option('--no-git', 'Skip git initialization')
        .action(createAppCommand);

    // Sync command
    program
        .command('sync')
        .description('Sync framework updates from upstream Pika')
        .option('--version <version>', 'Specific version to sync to', 'latest')
        .option('--dry-run', 'Preview changes without applying them')
        .action(syncCommand);

    program.parse();
}
```

## 4. Create App Command (`src/commands/create-app.ts`)

### Strategy: Clone-and-Clean Approach

The create-app command uses a **clone-and-clean strategy** rather than complex templating:

1. **Clone the complete Pika monorepo** from GitHub
2. **Clean up repository artifacts** (remove .git, GitHub workflows, etc.)
3. **Remove CLI package** (users don't need pika-cli source)
4. **Initialize as new repository** for the user's project
5. **Install dependencies** and show setup instructions

### Implementation Flow

```typescript
export async function createAppCommand(projectName?: string, options?: any) {
    try {
        console.log('🚀 Creating new Pika project...\n');

        // 1. Get project configuration (minimal prompts for now)
        const config = await getBasicProjectConfig(projectName, options);

        // 2. Clone Pika repository
        await clonePikaRepository(config.projectPath);

        // 3. Clean up repository artifacts
        await cleanupRepositoryArtifacts(config.projectPath);

        // 4. Remove CLI package (users don't need it)
        await removeCLIPackage(config.projectPath);

        // 5. Update package.json with user's project name
        await updateProjectMetadata(config);

        // 6. Initialize new git repository
        if (!options.skipGit) {
            await initializeNewGitRepository(config.projectPath);
        }

        // 7. Install dependencies
        if (!options.skipInstall) {
            await installDependencies(config.projectPath);
        }

        // 8. Show success message and next steps
        showSuccessMessage(config);
    } catch (error) {
        console.error('Failed to create Pika app:', error);
        process.exit(1);
    }
}

// Core implementation functions
async function clonePikaRepository(targetPath: string): Promise<void> {
    console.log('📥 Cloning Pika framework repository...');
    
    // Clone the repository (shallow clone for speed)
    await execAsync(`git clone --depth 1 https://github.com/yourusername/pika.git ${targetPath}`);
    
    console.log('✅ Repository cloned successfully');
}

async function cleanupRepositoryArtifacts(projectPath: string): Promise<void> {
    console.log('🧹 Cleaning up repository artifacts...');
    
    const artifactsToRemove = [
        '.git',                    // Remove original git history
        '.github',                 // Remove GitHub workflows/templates
        'future-changes',          // Remove planning documents
        '.gitignore'               // We'll create a new one
    ];
    
    for (const artifact of artifactsToRemove) {
        const artifactPath = path.join(projectPath, artifact);
        if (await fileManager.exists(artifactPath)) {
            await fileManager.removeDirectory(artifactPath);
            console.log(`  ✅ Removed ${artifact}`);
        }
    }
    
    // Create new .gitignore appropriate for user projects
    await createUserGitignore(projectPath);
}

async function removeCLIPackage(projectPath: string): Promise<void> {
    console.log('🗑️  Removing CLI package (not needed in user projects)...');
    
    const cliPackagePath = path.join(projectPath, 'packages/pika-cli');
    if (await fileManager.exists(cliPackagePath)) {
        await fileManager.removeDirectory(cliPackagePath);
        console.log('  ✅ CLI package removed');
    }
    
    // Update root package.json to remove CLI workspace reference
    await updateRootPackageJson(projectPath);
}

async function updateProjectMetadata(config: ProjectConfig): Promise<void> {
    console.log('📝 Updating project metadata...');
    
    // Update root package.json
    const rootPackageJsonPath = path.join(config.projectPath, 'package.json');
    const rootPackageJson = JSON.parse(await fileManager.readFile(rootPackageJsonPath));
    
    rootPackageJson.name = config.projectName;
    rootPackageJson.description = config.description || `A chat application built with Pika Framework`;
    
    // Remove CLI from workspaces
    if (rootPackageJson.workspaces) {
        rootPackageJson.workspaces = rootPackageJson.workspaces.filter(
            (workspace: string) => !workspace.includes('pika-cli')
        );
    }
    
    await fileManager.writeFile(rootPackageJsonPath, JSON.stringify(rootPackageJson, null, 2));
    
    // Update individual app package.json files if needed
    await updateAppPackageJson(config);
}

async function createUserGitignore(projectPath: string): Promise<void> {
    const gitignoreContent = `# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
.turbo/
.svelte-kit/
cdk.out/

# Environment variables
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Temporary files
*.tmp
*.temp

# Custom services (if using external organization)
# Uncomment if you plan to keep services in separate repos:
# services/custom/
`;
    
    await fileManager.writeFile(path.join(projectPath, '.gitignore'), gitignoreContent);
}

async function initializeNewGitRepository(projectPath: string): Promise<void> {
    console.log('🔧 Initializing new git repository...');
    
    await gitManager.initRepository(projectPath);
    await gitManager.addAll(projectPath);
    await gitManager.commit('Initial commit: Pika project created', projectPath);
    
    console.log('✅ New git repository initialized');
}

function showSuccessMessage(config: ProjectConfig) {
    console.log(`
🎉 Successfully created ${config.projectName}!

Next steps:
  cd ${config.projectName}
  pnpm dev

To customize your app:
  • Auth: Edit /apps/pika-chat/src/auth/providers/custom-auth.ts
  • Components: Add to /apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/
  • Services: Add to /services/custom/

To sync with upstream Pika updates:
  pika sync                    # Sync to latest version
  pika sync --version v2.1.0   # Sync to specific version
  pika sync --dry-run          # Preview changes

Documentation: https://github.com/yourusername/pika#readme
  `);
}
```

## 5. Sync Command (`src/commands/sync.ts`)

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { downloadPikaFramework, identifyChanges, applyChanges } from '../utils/version-utils';

export async function syncCommand(options: { version?: string; dryRun?: boolean }) {
    try {
        console.log('🔄 Syncing Pika framework updates...');

        // Ensure we're in a Pika project directory
        const syncConfigPath = path.join(process.cwd(), '.pika-sync.json');
        if (!(await fileExists(syncConfigPath))) {
            console.error('❌ Not in a Pika project directory (no .pika-sync.json found)');
            process.exit(1);
        }

        // Read sync configuration
        const syncConfig = JSON.parse(await fs.readFile(syncConfigPath, 'utf8'));

        // Determine target version
        const targetVersion = options.version || 'latest';

        if (options.dryRun) {
            console.log('🔍 Dry run mode - showing what would be updated...');
        }

        // Download latest Pika framework
        const tempDir = await downloadPikaFramework(targetVersion);

        // Compare files and identify changes
        const changes = await identifyChanges(tempDir, process.cwd(), syncConfig.protectedAreas);

        if (changes.length === 0) {
            console.log('✅ No updates available');
            return;
        }

        // Show changes
        console.log(`\n📋 Found ${changes.length} files to update:`);
        changes.forEach((change) => {
            console.log(`  ${change.type}: ${change.path}`);
        });

        if (options.dryRun) {
            console.log('\n🔍 Dry run complete - no changes applied');
            return;
        }

        // Apply changes
        await applyChanges(changes, tempDir, process.cwd());

        // Update sync config
        syncConfig.lastSync = new Date().toISOString();
        syncConfig.pikaVersion = targetVersion;
        await fs.writeFile(syncConfigPath, JSON.stringify(syncConfig, null, 2));

        // Create git commit if in a git repository
        try {
            execSync('git add .', { stdio: 'ignore' });
            execSync(`git commit -m "sync: Update Pika framework to ${targetVersion}"`, { stdio: 'ignore' });
            console.log('✅ Changes committed to git');
        } catch (error) {
            console.log('⚠️  Not in git repository or commit failed - you may need to commit manually');
        }

        console.log('✅ Sync complete!');
    } catch (error) {
        console.error('❌ Sync failed:', error.message);
        process.exit(1);
    }
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}
```

## 6. Interactive Setup (`src/prompts.ts`)

```typescript
import { input, select, confirm } from '@inquirer/prompts';
import path from 'path';

export interface ProjectConfig {
    projectName: string;
    projectPath: string;
    authStrategy: 'mock' | 'auth-js' | 'custom' | 'enterprise';
    includeWeatherSample: boolean;
    serviceOrganization: 'monorepo' | 'external';
}

export async function setupProject(projectName?: string, options?: any): Promise<ProjectConfig> {
    // Get project name with validation
    const name =
        projectName ||
        (await input({
            message: 'What is your project name?',
            default: 'my-pika-app',
            validate: (input) => {
                const trimmed = input.trim();
                if (!trimmed) return 'Project name is required';

                // Must start with a letter
                if (!/^[a-zA-Z]/.test(trimmed)) {
                    return 'Project name must start with a letter';
                }

                // Only letters, numbers, dashes, and underscores
                if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(trimmed)) {
                    return 'Project name may only contain letters, numbers, dashes, and underscores';
                }

                return true;
            }
        }));

    // Project path defaults to name in current directory
    const projectPath = path.resolve(process.cwd(), name);

    // Check if directory exists
    if (await directoryExists(projectPath)) {
        const overwrite = await confirm({
            message: `Directory ${name} already exists. Overwrite?`,
            default: false
        });
        if (!overwrite) {
            throw new Error('Project creation cancelled');
        }
    }

    // Authentication strategy
    const authStrategy = await select({
        message: 'Choose authentication strategy:',
        choices: [
            { name: 'Mock (for development)', value: 'mock' },
            { name: 'Auth.js (OAuth providers)', value: 'auth-js' },
            { name: "Custom (I'll implement my own)", value: 'custom' },
            { name: 'Enterprise SSO', value: 'enterprise' }
        ],
        default: 'mock'
    });

    // Weather sample application
    const includeWeatherSample = await confirm({
        message: 'Include sample weather application?',
        default: true
    });

    // Service organization
    const serviceOrganization = await select({
        message: 'How will you organize your services?',
        choices: [
            { name: 'Monorepo (embed services in this project)', value: 'monorepo' },
            { name: 'External (separate microservice repositories)', value: 'external' }
        ],
        default: 'monorepo'
    });

    return {
        projectName: name,
        projectPath,
        authStrategy,
        includeWeatherSample,
        serviceOrganization
    };
}

async function directoryExists(path: string): Promise<boolean> {
    try {
        const { access } = await import('fs/promises');
        await access(path);
        return true;
    } catch {
        return false;
    }
}
```

## 7. Template Generation (`src/template-generator.ts`)

```typescript
import { ProjectConfig } from './prompts';
import { copyFrameworkFiles, createUserCustomizationAreas, generateConfigFiles } from './file-operations';
import { createSyncConfiguration } from './config-generator';
import path from 'path';
import { promises as fs } from 'fs';

export async function generateTemplate(config: ProjectConfig): Promise<void> {
    console.log(`Creating ${config.projectName}...`);

    // 1. Copy complete Pika framework codebase
    await copyFrameworkFiles(config);

    // 2. Create user customization areas
    await createUserCustomizationAreas(config);

    // 3. Generate configuration files
    await generateConfigFiles(config);

    // 4. Create sync configuration (.pika-sync.json)
    await createSyncConfiguration(config);

    // 5. Update package.json with user-specific settings
    await updatePackageJson(config);

    // 6. Create initial .env file
    await createEnvironmentFile(config);

    console.log('✅ Template generation complete');
}

async function updatePackageJson(config: ProjectConfig): Promise<void> {
    const packageJsonPath = path.join(config.projectPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

    // Update name
    packageJson.name = config.projectName;

    // Add development script variations based on weather sample
    if (config.includeWeatherSample) {
        packageJson.scripts['dev:weather'] = 'turbo run dev --filter=weather --filter=pika-chat';
    }

    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

async function createEnvironmentFile(config: ProjectConfig): Promise<void> {
    const envPath = path.join(config.projectPath, '.env.example');

    let envContent = `# Pika Configuration
PIKA_ENVIRONMENT=development
PIKA_LOG_LEVEL=info

# Authentication
`;

    switch (config.authStrategy) {
        case 'auth-js':
            envContent += `NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000
`;
            break;
        case 'custom':
            envContent += `CUSTOM_AUTH_SECRET=your-secret-here
CUSTOM_AUTH_PROVIDER_URL=https://your-auth-provider.com
`;
            break;
        case 'enterprise':
            envContent += `ENTERPRISE_SSO_URL=https://your-sso-provider.com
ENTERPRISE_SSO_CLIENT_ID=your-client-id
ENTERPRISE_SSO_CLIENT_SECRET=your-client-secret
`;
            break;
    }

    envContent += `
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Database
DATABASE_URL=your-database-url

# Bedrock
BEDROCK_REGION=us-east-1
`;

    await fs.writeFile(envPath, envContent);
}
```

## 8. Configuration Generator (`src/config-generator.ts`)

```typescript
import { ProjectConfig } from './prompts';
import path from 'path';
import { promises as fs } from 'fs';

export async function createSyncConfiguration(config: ProjectConfig): Promise<void> {
    console.log('🔄 Creating sync configuration...');

    // Create .pika-sync.json with initial version tracking
    // This is CRITICAL - we need to know what version they started with
    // so we can properly sync updates later
    const syncConfig = {
        // Track the Pika framework version used to create this project
        pikaVersion: '1.0.0', // This should be the actual CLI version or framework version

        // When the project was created and last synced
        createdAt: new Date().toISOString(),
        lastSync: new Date().toISOString(),

        // Protected areas that sync will never modify
        protectedAreas: [
            'apps/pika-chat/src/auth/providers/custom-auth.ts',
            'apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/',
            'services/custom/',
            '.env*',
            'pika.config.ts',
            '.pika-sync.json'
        ],

        // Track user's initial configuration choices for intelligent sync decisions
        initialConfiguration: {
            auth: config.authStrategy,
            includeWeatherSample: config.includeWeatherSample,
            serviceOrganization: config.serviceOrganization
        }
    };

    const syncConfigPath = path.join(config.projectPath, '.pika-sync.json');
    await fs.writeFile(syncConfigPath, JSON.stringify(syncConfig, null, 2));
}

export async function generateConfigFiles(config: ProjectConfig): Promise<void> {
    console.log('⚙️  Generating configuration files...');

    // Generate pika.config.ts
    const configTemplatePath = path.resolve(__dirname, '../templates/config/pika.config.ts.template');
    const configTemplate = await fs.readFile(configTemplatePath, 'utf8');

    const configContent = configTemplate.replace('{{AUTH_PROVIDER}}', config.authStrategy).replace('{{SERVICE_ORGANIZATION}}', config.serviceOrganization);

    const configPath = path.join(config.projectPath, 'pika.config.ts');
    await fs.writeFile(configPath, configContent);
}
```

## 9. File Operations (`src/file-operations.ts`)

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { ProjectConfig } from './prompts';

export async function copyFrameworkFiles(config: ProjectConfig): Promise<void> {
    console.log('📁 Copying framework files...');

    // Get the path to the source Pika framework
    // When published as npm package, we need to find the framework source
    const sourcePath = await findPikaFrameworkSource();

    // Copy entire framework structure
    await copyDirectory(sourcePath, config.projectPath, {
        exclude: [
            'node_modules',
            '.git',
            '.turbo',
            'dist',
            'build',
            '.svelte-kit',
            'cdk.out',
            'packages/pika-cli', // Don't copy the CLI tool itself
            'services/capabilities', // Don't copy example custom service
            'future-changes' // Don't copy planning docs
        ]
    });

    // Remove weather sample if not requested
    if (!config.includeWeatherSample) {
        await removeDirectory(path.join(config.projectPath, 'services/samples/weather'));
    }

    // Always remove enterprise-site for now (could be made configurable later)
    await removeDirectory(path.join(config.projectPath, 'apps/enterprise-site'));
}

async function findPikaFrameworkSource(): Promise<string> {
    // In development, CLI is in packages/pika-cli, so framework is ../../../
    // When published, we might bundle framework files or download them

    // For now, assume development structure
    return path.resolve(__dirname, '../../../../');
}

export async function createUserCustomizationAreas(config: ProjectConfig): Promise<void> {
    console.log('🔧 Setting up customization areas...');

    const basePath = config.projectPath;

    // 1. Create auth customization area
    const authDir = path.join(basePath, 'apps/pika-chat/src/auth/providers');
    await ensureDirectory(authDir);

    // Copy custom auth template
    const authTemplatePath = path.resolve(__dirname, '../templates/auth/custom-auth.ts.template');
    const customAuthPath = path.join(authDir, 'custom-auth.ts');
    await copyFile(authTemplatePath, customAuthPath);

    // 2. Create custom components area
    const componentsDir = path.join(basePath, 'apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components');
    await ensureDirectory(componentsDir);

    // Copy component templates
    const componentTemplateDir = path.resolve(__dirname, '../templates/components');
    await copyDirectory(componentTemplateDir, componentsDir);

    // 3. Create custom services area
    const servicesDir = path.join(basePath, 'services/custom');
    await ensureDirectory(servicesDir);
    await writeFile(path.join(servicesDir, '.gitkeep'), '# Place your custom services here\n');
}

export async function installDependencies(projectPath: string): Promise<void> {
    console.log('📦 Installing dependencies...');

    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
        const child = spawn('pnpm', ['install'], {
            cwd: projectPath,
            stdio: 'inherit'
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`pnpm install failed with code ${code}`));
            }
        });
    });
}

// Utility functions
async function copyDirectory(src: string, dest: string, options: { exclude?: string[] } = {}): Promise<void> {
    const { exclude = [] } = options;

    await ensureDirectory(dest);
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        if (exclude.includes(entry.name)) continue;

        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath, options);
        } else {
            await copyFile(srcPath, destPath);
        }
    }
}

async function ensureDirectory(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

async function copyFile(src: string, dest: string): Promise<void> {
    await fs.copyFile(src, dest);
}

async function removeDirectory(dirPath: string): Promise<void> {
    try {
        await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
        // Ignore if directory doesn't exist
    }
}

async function writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf8');
}
```

## 10. Version Utilities (`src/utils/version-utils.ts`)

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export async function downloadPikaFramework(version: string): Promise<string> {
    console.log(`📥 Downloading Pika framework ${version}...`);

    const tempDir = path.join(process.cwd(), '.pika-temp');

    // Remove existing temp directory
    try {
        await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
        // Ignore if doesn't exist
    }

    // Clone or download framework
    if (version === 'latest') {
        execSync(`git clone --depth 1 https://github.com/yourusername/pika.git ${tempDir}`);
    } else {
        execSync(`git clone --depth 1 --branch ${version} https://github.com/yourusername/pika.git ${tempDir}`);
    }

    return tempDir;
}

export async function identifyChanges(sourcePath: string, targetPath: string, protectedAreas: string[]): Promise<any[]> {
    const changes: any[] = [];

    // Compare framework files recursively
    await compareDirectories(sourcePath, targetPath, '', protectedAreas, changes);

    return changes;
}

async function compareDirectories(sourcePath: string, targetPath: string, relativePath: string, protectedAreas: string[], changes: any[]): Promise<void> {
    const sourceFiles = await fs.readdir(path.join(sourcePath, relativePath), { withFileTypes: true });

    for (const file of sourceFiles) {
        const relativeFilePath = path.join(relativePath, file.name);
        const sourceFilePath = path.join(sourcePath, relativeFilePath);
        const targetFilePath = path.join(targetPath, relativeFilePath);

        // Skip protected areas
        if (isProtectedArea(relativeFilePath, protectedAreas)) {
            continue;
        }

        // Skip directories we don't want to sync
        if (file.isDirectory() && shouldSkipDirectory(file.name)) {
            continue;
        }

        // Skip optional sample directories if user removed them
        if (file.isDirectory() && isOptionalSampleDirectory(relativeFilePath)) {
            const targetExists = await fileExists(targetFilePath);
            if (!targetExists) {
                console.log(`  ⏭️  Skipping ${relativeFilePath} (user removed)`);
                console.log(`     To restore: mkdir -p ${relativeFilePath} && pika sync`);
                continue; // User deleted it, don't restore
            }
        }

        if (file.isDirectory()) {
            await compareDirectories(sourcePath, targetPath, relativeFilePath, protectedAreas, changes);
        } else {
            // Compare file content
            const hasChanged = await fileHasChanged(sourceFilePath, targetFilePath);
            if (hasChanged) {
                const exists = await fileExists(targetFilePath);
                changes.push({
                    type: exists ? 'modified' : 'added',
                    path: relativeFilePath,
                    sourcePath: sourceFilePath,
                    targetPath: targetFilePath
                });
            }
        }
    }
}

function isProtectedArea(filePath: string, protectedAreas: string[]): boolean {
    return protectedAreas.some((area) => {
        if (area.endsWith('/')) {
            return filePath.startsWith(area);
        }
        return filePath === area;
    });
}

function shouldSkipDirectory(dirName: string): boolean {
    return ['node_modules', '.git', '.turbo', 'dist', 'build', '.svelte-kit', 'cdk.out', 'packages/pika-cli', 'future-changes', '.pika-temp'].includes(dirName);
}

function isOptionalSampleDirectory(filePath: string): boolean {
    const optionalDirs = [
        'services/samples/weather',
        'apps/samples/enterprise-site'
    ];
    return optionalDirs.includes(filePath);
}

async function fileHasChanged(sourcePath: string, targetPath: string): Promise<boolean> {
    try {
        const sourceContent = await fs.readFile(sourcePath, 'utf8');
        const targetContent = await fs.readFile(targetPath, 'utf8');
        return sourceContent !== targetContent;
    } catch (error) {
        // File doesn't exist in target, so it's new
        return true;
    }
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function applyChanges(changes: any[], sourcePath: string, targetPath: string): Promise<void> {
    console.log('\\n🔄 Applying changes...');

    for (const change of changes) {
        console.log(`  ${change.type}: ${change.path}`);

        // Ensure target directory exists
        const targetDir = path.dirname(change.targetPath);
        await fs.mkdir(targetDir, { recursive: true });

        // Copy file
        await fs.copyFile(change.sourcePath, change.targetPath);
    }
}
```

## 11. Template Files

### Config Template (`templates/config/pika.config.ts.template`)

```typescript
import type { PikaConfig } from '@pika/types';

export default {
    auth: {
        provider: '{{AUTH_PROVIDER}}',
        options: {
            // Add provider-specific configuration here
        }
    },
    components: {
        customDirectory: './apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components',
        autoDiscovery: true
    },
    services: {
        organization: '{{SERVICE_ORGANIZATION}}',
        customDirectory: './services/custom'
    }
} satisfies PikaConfig;
```

### Auth Template (`templates/auth/custom-auth.ts.template`)

```typescript
import type { AuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
import type { UserAuthData } from '$lib/shared-types';

/**
 * Custom authentication implementation
 *
 * Replace this with your company's authentication logic.
 * This could integrate with:
 * - OAuth providers (Google, Microsoft, etc.)
 * - SAML/SSO providers
 * - Custom API endpoints
 * - Database user validation
 */

export async function authenticateUser(email: string, password: string): Promise<AuthenticatedUser<UserAuthData> | null> {
    // TODO: Implement your authentication logic here
    // Example integrations:

    // 1. OAuth with Google
    // const googleUser = await authenticateWithGoogle(email, password);

    // 2. Custom API call
    // const response = await fetch('https://your-auth-api.com/login', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email, password })
    // });

    // 3. Database lookup
    // const user = await db.user.findUnique({ where: { email } });

    // For now, return null (authentication fails)
    return null;
}

export async function refreshUserToken(refreshToken: string): Promise<UserAuthData | null> {
    // TODO: Implement token refresh logic
    // This should validate the refresh token and return new auth data

    return null;
}

export async function validateUserSession(accessToken: string): Promise<boolean> {
    // TODO: Implement session validation
    // This should verify the access token is still valid

    return false;
}
```

### Component Template (`templates/components/index.ts.template`)

```typescript
/**
 * Custom Markdown Component Registry
 *
 * Export your custom components here so they can be discovered
 * by the markdown renderer. Components will be available to the
 * LLM as markdown tags.
 *
 * Example: If you export a component named "order", the LLM can use:
 * <order id="12345" status="pending">Order details here</order>
 */

// Import your custom components
import OrderComponent from './order.svelte';
// import InvoiceComponent from './invoice.svelte';
// import ProductCardComponent from './product-card.svelte';

// Export component map
export const customComponents = {
    order: OrderComponent
    // invoice: InvoiceComponent,
    // 'product-card': ProductCardComponent,
};

// Type definitions for component props (optional but recommended)
export interface OrderProps {
    id: string;
    status: 'pending' | 'processing' | 'shipped' | 'delivered';
    customer?: string;
}

// Component documentation for LLM context (optional)
export const componentDocs = {
    order: {
        description: 'Displays order information and status',
        props: {
            id: 'Order ID (required)',
            status: 'Order status: pending, processing, shipped, delivered',
            customer: 'Customer name (optional)'
        },
        example: '<order id="12345" status="pending" customer="John Doe">Order details</order>'
    }
};
```

## 12. Package.json for CLI

```json
{
    "name": "pika-cli",
    "version": "1.0.0",
    "description": "Pika framework CLI tool",
    "bin": {
        "pika": "./bin/pika.js"
    },
    "files": ["bin", "dist", "templates", "utils"],
    "scripts": {
        "build": "tsc",
        "dev": "tsc --watch",
        "prepublishOnly": "pnpm build"
    },
    "dependencies": {
        "@inquirer/prompts": "^3.0.0",
        "commander": "^11.0.0"
    },
    "devDependencies": {
        "@types/node": "^20.0.0",
        "typescript": "^5.0.0"
    },
    "engines": {
        "node": ">=18"
    },
    "keywords": ["pika", "chat", "ai", "chatbot", "framework", "cli"]
}
```

## 13. Key Design Points

### Version Tracking Strategy

The `.pika-sync.json` file is **critical** and tracks:

- **Initial framework version** used to create the project
- **User's configuration choices** to make intelligent sync decisions
- **Protected areas** that sync will never modify
- **Creation and sync timestamps**

### Protected Areas

The sync system will **never** modify:

- `apps/pika-chat/src/auth/providers/custom-auth.ts`
- `apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/`
- `services/custom/`
- `.env*` files
- `pika.config.ts`
- `.pika-sync.json` itself

### Installation and Usage

```bash
# Install CLI globally
npm install -g pika-cli

# Create new project
pika create-app my-awesome-chat
cd my-awesome-chat
pnpm dev

# Sync framework updates (from within project directory)
pika sync
pika sync --version v2.1.0
pika sync --dry-run
```

## 14. Implementation Priority

1. **Phase 1: Basic Project Creation**

    - Set up `/packages/pika-cli/` structure
    - Implement `pika create-app` command
    - Create template files and file copying logic
    - Test basic project creation

2. **Phase 2: Sync Foundation**

    - Implement `.pika-sync.json` version tracking
    - Create `pika sync` command structure
    - Add protected area detection

3. **Phase 3: Full Sync Implementation**

    - Implement framework download/comparison logic
    - Add intelligent change detection
    - Test sync scenarios

4. **Phase 4: Polish and Publish**
    - Add comprehensive error handling
    - Improve user experience and messaging
    - Prepare for npm publication

This provides a complete, implementable roadmap for the Pika CLI tool with proper version tracking and sync capabilities.

## 15. Local Development Process

### Initial Setup (One Time)

```bash
# Navigate to CLI package
cd packages/pika-cli

# Build TypeScript to dist/
pnpm build

# Create global symlink to your local version
pnpm link --global
```

After linking, you can use `pika` commands anywhere on your system during development.

### Package.json Development Scripts

Add these scripts to `/packages/pika-cli/package.json`:

```json
{
    "scripts": {
        "build": "tsc",
        "dev": "NODE_ENV=development tsc --watch",
        "link": "pnpm build && pnpm link --global",
        "unlink": "pnpm unlink --global",
        "test-local": "mkdir -p ../../temp && cd ../../temp && pika create-app cli-test",
        "prepublishOnly": "pnpm build"
    }
}
```

### Daily Development Workflow

**Terminal 1: Keep TypeScript compiling**

```bash
cd packages/pika-cli
pnpm dev                # Runs tsc --watch with NODE_ENV=development
```

**Terminal 2: Test CLI commands**

```bash
# Create test area outside monorepo
mkdir -p ~/pika-cli-testing
cd ~/pika-cli-testing

# Test project creation
pika create-app test1
pika create-app test2 --no-git --no-install

# Test that created project works
cd test1
pnpm dev
```

**Test sync functionality:**

```bash
# In your test project
cd ~/pika-cli-testing/test1
pika sync --dry-run
pika sync --version latest
```

### Development Environment Detection

In your CLI code, detect development environment:

```typescript
// In file-operations.ts
async function findPikaFrameworkSource(): Promise<string> {
    // During development, CLI is in packages/pika-cli
    if (process.env.NODE_ENV === 'development') {
        return path.resolve(__dirname, '../../../../');
    }

    // When published, download or use bundled framework
    return await downloadLatestFramework();
}
```

### Testing Strategy

**Create dedicated test directory:**

```bash
# Outside your monorepo to avoid conflicts
mkdir ~/pika-cli-testing
cd ~/pika-cli-testing
```

**Test complete workflow:**

```bash
# Clean slate
rm -rf test-project

# Test creation
pika create-app test-project
cd test-project

# Verify project works
pnpm dev &
# Check http://localhost:5173 in browser
# Kill dev server: kill %1

# Test sync
pika sync --dry-run
```

### Common Development Commands

```bash
# Rebuild and relink after major changes
cd packages/pika-cli
pnpm build
pnpm link --global

# Quick test without leaving CLI directory
pnpm test-local

# Cleanup when switching branches or done developing
pnpm unlink --global

# Alternative: direct execution without linking
node dist/index.js create-app test-direct
```

### Troubleshooting

**If `pika` command not found after linking:**

```bash
# Check if link exists
which pika

# Re-link
cd packages/pika-cli
pnpm unlink --global
pnpm build
pnpm link --global
```

**If framework files not found during development:**

- Ensure `NODE_ENV=development` is set in your dev script
- Check that `findPikaFrameworkSource()` resolves to correct monorepo root
- Verify the relative path `../../../../` points to your monorepo root

**If TypeScript changes not reflected:**

- Ensure `pnpm dev` is running (tsc --watch)
- Check for TypeScript compilation errors
- Sometimes need to restart the watch process

### Development Best Practices

1. **Always test outside the monorepo** - Creates realistic user experience
2. **Keep `pnpm dev` running** - Auto-compiles TypeScript changes
3. **Test both success and error cases** - Invalid project names, missing directories, etc.
4. **Test the full workflow** - Create project → customize → sync
5. **Clean up test projects regularly** - Avoid disk space issues
6. **Use `--dry-run` first** - Before testing actual sync operations

This development setup allows rapid iteration while testing the real CLI experience that users will have.
