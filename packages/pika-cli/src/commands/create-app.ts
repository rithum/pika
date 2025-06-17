import inquirer from 'inquirer';
import path from 'path';
import { fileManager } from '../utils/file-manager.js';
import { gitManager } from '../utils/git-manager.js';
import { logger } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { DistinctQuestion } from 'inquirer';
import type { ExecOptions } from 'child_process';

const execAsync = promisify(exec);

// GitHub repository URL - update this to your actual repo
const PIKA_REPO_URL = 'https://github.com/rithum/pika.git';

interface CreateAppOptions {
    template?: string;
    directory?: string;
    skipInstall?: boolean;
}

interface ProjectConfig {
    projectName: string;
    description?: string;
    projectPath: string;
}

export async function createApp(projectName?: string, options: CreateAppOptions = {}): Promise<void> {
    try {
        logger.header('🐦 Pika Framework - Create New Chat Application');

        // Get basic project configuration (simplified)
        const config = await getBasicProjectConfig(projectName, options);

        // Check if directory already exists
        if (await fileManager.exists(config.projectPath)) {
            const { overwrite } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'overwrite',
                    message: `Directory "${config.projectName}" already exists. Overwrite?`,
                    default: false
                }
            ]);

            if (!overwrite) {
                logger.warn('Project creation cancelled.');
                return;
            }

            await fileManager.removeDirectory(config.projectPath);
        }

        const spinner = logger.startSpinner('Creating Pika project...');

        try {
            // 1. Clone Pika repository
            logger.updateSpinner('Cloning Pika framework repository...');
            await clonePikaRepository(config.projectPath);
            logger.stopSpinner(true, 'Repository cloned successfully');

            // Start a persistent spinner for the rest of the setup
            const setupSpinner = logger.startSpinner('Setting up your project (this may take a minute)...');

            // 2. Clean up repository artifacts
            await cleanupRepositoryArtifacts(config.projectPath);

            // 3. Remove CLI package (users don't need it)
            await removeCLIPackage(config.projectPath);

            // 4. Update project metadata
            await updateProjectMetadata(config);

            // 5. Install dependencies
            if (!options.skipInstall) {
                await installDependencies(config.projectPath);
            }

            // Stop the persistent spinner right before the final message
            logger.stopSpinner(true, 'Project setup complete!');
            logger.newLine();

            // Show completion message
            showCompletionMessage(config, options);
        } catch (error) {
            logger.stopSpinner(false, 'Failed to create project');
            throw error;
        }
    } catch (error) {
        logger.error('Failed to create Pika application:', error);
        process.exit(1);
    }
}

async function getBasicProjectConfig(projectName?: string, options: CreateAppOptions = {}): Promise<ProjectConfig> {
    const questions: Array<DistinctQuestion<any>> = [];

    // Only ask for project name if not provided
    if (!projectName) {
        questions.push({
            type: 'input',
            name: 'projectName',
            message: 'Project name:',
            default: 'my-pika-app',
            validate: (input: string) => {
                if (!input.trim()) return 'Project name is required';
                if (!/^[a-zA-Z0-9-_]+$/.test(input)) return 'Project name can only contain letters, numbers, hyphens, and underscores';
                return true;
            }
        });
    }

    // Optional: Ask for description
    questions.push({
        type: 'input',
        name: 'description',
        message: 'Project description (optional):',
        default: 'A chat application built with Pika Framework'
    });

    const answers = questions.length > 0 ? await inquirer.prompt(questions) : {};

    // Build config object
    const config: ProjectConfig = {
        projectName: projectName || answers.projectName,
        description: answers.description,
        projectPath: options.directory || path.resolve(process.cwd(), projectName || answers.projectName)
    };

    return config;
}

// Core implementation functions for clone-and-clean approach
async function clonePikaRepository(targetPath: string): Promise<void> {
    try {
        // Create a temporary directory for the clone
        const tempDir = path.join(path.dirname(targetPath), '.pika-temp-clone');

        // Clone the repository to temp directory (shallow clone for speed)
        await execAsync(`git clone --depth 1 ${PIKA_REPO_URL} "${tempDir}"`);

        // Remove .git directory from temp directory to ensure clean state
        const gitDir = path.join(tempDir, '.git');
        if (await fileManager.exists(gitDir)) {
            await fileManager.removeDirectory(gitDir);
        }

        // Copy all files to target directory
        const { cp } = await import('fs/promises');
        await cp(tempDir, targetPath, {
            recursive: true
        });

        // Clean up temp directory
        await fileManager.removeDirectory(tempDir);

        // Double check that no .git directory exists in target
        const targetGitDir = path.join(targetPath, '.git');
        if (await fileManager.exists(targetGitDir)) {
            await fileManager.removeDirectory(targetGitDir);
        }
    } catch (e) {
        throw new Error(`Failed to clone Pika repository: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
}

async function cleanupRepositoryArtifacts(projectPath: string): Promise<void> {
    const artifactsToRemove = [
        '.github', // Remove GitHub workflows/templates
        'future-changes', // Remove planning documents
        '.gitignore' // We'll create a new one
    ];

    for (const artifact of artifactsToRemove) {
        const artifactPath = path.join(projectPath, artifact);
        if (await fileManager.exists(artifactPath)) {
            await fileManager.removeDirectory(artifactPath);
        }
    }

    // Create new .gitignore appropriate for user projects
    await createUserGitignore(projectPath);
}

async function removeCLIPackage(projectPath: string): Promise<void> {
    const cliPackagePath = path.join(projectPath, 'packages/pika-cli');
    if (await fileManager.exists(cliPackagePath)) {
        await fileManager.removeDirectory(cliPackagePath);
    }
}

async function updateProjectMetadata(config: ProjectConfig): Promise<void> {
    // Create .pika-sync.json
    const syncConfigPath = path.join(config.projectPath, '.pika-sync.json');

    const syncConfig = {
        pikaVersion: '1.0.0', // This should match the CLI version
        createdAt: new Date().toISOString(),
        lastSync: new Date().toISOString(),
        protectedAreas: [
            'apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/',
            'apps/pika-chat/src/lib/server/auth-provider/',
            'services/custom/',
            'apps/custom/',
            '.env',
            '.env.local',
            '.env.*',
            'pika.config.ts',
            '.pika-sync.json',
            '.gitignore', // Add .gitignore to protected areas
            'package.json', // Add package.json to protected areas
            'pnpm-lock.yaml', // Add pnpm-lock.yaml to protected areas
            // Infrastructure stack files - users should customize these
            'apps/pika-chat/infra/bin/pika-chat.ts',
            'services/pika/bin/pika.ts'
        ],
        // User-defined protected areas - these will be merged with the default protectedAreas
        // Users can add additional protected areas or override defaults by removing them from here
        userProtectedAreas: [
            // Add your custom protected areas here
            // Example: 'my-custom-file.ts',
            // Example: 'apps/my-custom-app/',
        ],
        // User-defined unprotected areas - these files will be allowed to be updated by sync
        // even though they are in the default protectedAreas list
        userUnprotectedAreas: [
            // Add files here that you want to allow framework updates for
            // Example: 'apps/pika-chat/infra/bin/pika-chat.ts',  // Allow infrastructure file updates
            // Example: 'services/pika/bin/pika.ts',             // Allow service stack updates
        ],
        initialConfiguration: {
            createdAt: new Date().toISOString()
        }
    };

    await fileManager.writeFile(syncConfigPath, JSON.stringify(syncConfig, null, 2));
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

async function installDependencies(projectPath: string): Promise<void> {
    try {
        // Check if pnpm is available, fallback to npm
        let packageManager = 'npm';
        try {
            await execAsync('pnpm --version');
            packageManager = 'pnpm';
        } catch {
            // pnpm not available, use npm
        }

        const installCommand = packageManager === 'pnpm' ? 'pnpm install' : 'npm install';

        await execAsync(installCommand, {
            cwd: projectPath
        } as ExecOptions);
    } catch (error) {
        logger.warn('Failed to install dependencies automatically. You can install them manually later.');
        logger.debug('Dependency installation error:', error);
    }
}

function showCompletionMessage(config: ProjectConfig, options: CreateAppOptions): void {
    logger.success(`🎉 Successfully created ${config.projectName}!`);
    logger.newLine();

    logger.info('Next steps:');
    console.log(`  cd ${path.relative(process.cwd(), config.projectPath)}`);

    if (options.skipInstall) {
        console.log('  pnpm install  # or npm install');
    }

    console.log('  pnpm dev      # Start development server');
    logger.newLine();

    logger.info('What you got:');
    console.log('  • Complete Pika framework with all features');
    console.log('  • Sample weather app (remove from services/ if not needed)');
    console.log('  • Ready-to-customize authentication system');
    console.log('  • Custom component support');
    logger.newLine();

    logger.info('Key customization areas:');
    console.log('  • Custom Components: apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components');
    console.log('  • Custom Webapps: apps/custom directory');
    console.log('  • Custom Services: services/custom directory');
    console.log('  • Chat App Stack: apps/pika-chat/infra/bin/pika-chat.ts (AWS CDK stack definition)');
    console.log('  • Service Stack: services/pika/bin/pika.ts (AWS CDK stack definition)');
    logger.newLine();

    logger.info('Infrastructure customization:');
    console.log('  • Update project names and descriptions in stack files');
    console.log('  • Configure VPC IDs, account IDs, and regions for your environment');
    console.log('  • Add custom AWS resources or modify existing ones');
    console.log('  • These files are protected from framework updates');
    console.log('  • To allow stack files to be updated: edit .pika-sync.json userUnprotectedAreas');
    logger.newLine();

    logger.info('Version control:');
    console.log('  • Initialize git: git init && git add . && git commit -m "Initial commit"');
    console.log('  • Or use your preferred version control system');
    logger.newLine();

    logger.info('Learn more:');
    console.log('  • Framework docs: https://github.com/rithum/pika');
    console.log('  • Customization guide: ./docs/help/customization.md');
    console.log('  • Deploy to AWS: See services/pika/README.md');
}
