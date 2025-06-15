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
    skipGit?: boolean;
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

            // 6. Initialize new git repository
            if (!options.skipGit) {
                await initializeNewGitRepository(config.projectPath);
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
        // Clone the repository (shallow clone for speed)
        await execAsync(`git clone --depth 1 ${PIKA_REPO_URL} "${targetPath}"`);
    } catch (e) {
        throw new Error(`Failed to clone Pika repository: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
}

async function cleanupRepositoryArtifacts(projectPath: string): Promise<void> {
    const artifactsToRemove = [
        '.git', // Remove original git history
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
    // Update root package.json
    const rootPackageJsonPath = path.join(config.projectPath, 'package.json');

    if (await fileManager.exists(rootPackageJsonPath)) {
        const rootPackageJson = JSON.parse(await fileManager.readFile(rootPackageJsonPath));

        rootPackageJson.name = config.projectName;
        if (config.description) {
            rootPackageJson.description = config.description;
        }

        // Remove CLI from workspaces if it exists
        if (rootPackageJson.workspaces) {
            rootPackageJson.workspaces = rootPackageJson.workspaces.filter((workspace: string) => !workspace.includes('pika-cli'));
        }

        await fileManager.writeFile(rootPackageJsonPath, JSON.stringify(rootPackageJson, null, 2));
    }
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
    await gitManager.initRepository(projectPath);
    await gitManager.addAll(projectPath);
    await gitManager.commit('Initial commit: Pika project created', projectPath);
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
    console.log('  • Clean git repository (ready for your remote)');
    logger.newLine();

    logger.info('Key customization areas:');
    console.log('  • Authentication: apps/pika-chat/src/hooks.server.ts');
    console.log('  • Custom Components: apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/');
    console.log('  • Custom Services: services/ directory');
    logger.newLine();

    logger.info('Learn more:');
    console.log('  • Framework docs: https://github.com/yourusername/pika');
    console.log('  • Deploy to AWS: See services/pika/README.md');
    console.log('  • Customize auth: See apps/pika-chat/src/hooks.server.ts');
}
