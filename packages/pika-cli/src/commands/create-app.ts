import inquirer from 'inquirer';
import path from 'path';
import { fileManager } from '../utils/file-manager.js';
import { gitManager } from '../utils/git-manager.js';
import { logger } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { DistinctQuestion } from 'inquirer';
import type { ExecOptions } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import chalk from 'chalk';

const execAsync = promisify(exec);

// GitHub repository URL - update this to your actual repo
const PIKA_REPO_URL = 'https://github.com/rithum/pika.git';

function getDefaultProtectedAreas(): string[] {
    try {
        // Try to load from the centralized config file
        const configPath = path.join(__dirname, '../config/protected-areas.json');
        if (existsSync(configPath)) {
            const config = JSON.parse(readFileSync(configPath, 'utf8'));
            return config.defaultProtectedAreas || [];
        }
    } catch (error) {
        logger.debug('Failed to load protected areas config, using fallback:', error);
    }

    // Fallback to hardcoded list if config file is not available
    return [
        'apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/',
        'apps/pika-chat/src/lib/server/auth-provider/',
        'services/custom/',
        'apps/custom/',
        '.env',
        '.env.local',
        '.env.*',
        'pika-config.ts',
        '.pika-sync.json',
        '.gitignore',
        'pnpm-lock.yaml',
        'cdk.context.json',
        '.github/',
        '.gitlab/',
        '.circleci/',
        '.bitbucket/',
        '.azure-pipelines/',
        '.azure/',
        '.ci/',
        '.gitlab-ci.yml',
        '.circleci/config.yml',
        'bitbucket-pipelines.yml',
        'azure-pipelines.yml',
        'Makefile',
        'Jenkinsfile',
        '.travis.yml',
        'buildspec.yml',
        'taskfile.yml',
        '.drone.yml', // Drone CI
        'README.md', // README file
        'readme.md', // README file
        'README-pika.md', // The original README file from the framework
        'CODEOWNERS', // CODEOWNERS file
        'CONTRIBUTING.md', // CONTRIBUTING file
        'apps/pika-chat/src/routes/(noauth)/auth/client-auth/+page.server.ts', // Client auth page that they may customize to implement client side auth
        'apps/pika-chat/src/routes/(noauth)/auth/client-auth/+page.svelte', // Client auth page that they may customize to implement client side auth
        'apps/pika-chat/src/routes/(noauth)/logout/+page.svelte' // Allows for client-side logout
    ];
}

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
        console.log(chalk.bold.underline('Pika Framework - Create New Chat Application'));

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
                logger.updateSpinner('Installing dependencies with pnpm...');
                await installDependencies(config.projectPath, true);
                logger.updateSpinner('Installing dependencies with pnpm... Done.');
            }

            // Stop the persistent spinner right before the final message
            logger.stopSpinner(true, 'Project setup complete!');
            logger.newLine();

            // Show completion message
            await showCompletionMessage(config, options);
        } catch (error) {
            logger.stopSpinner(false, 'Failed to create project');
            throw error;
        }
    } catch (error) {
        console.log(chalk.red.bold('Failed to create Pika application:'), error);
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
        '.gitignore', // We'll create a new one
        'node_modules' // Remove any existing node_modules from the template
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
        protectedAreas: getDefaultProtectedAreas(),
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
            // Example: 'my-custom-file.ts',
        ],
        initialConfiguration: {
            createdAt: new Date().toISOString()
        }
    };

    await fileManager.writeFile(syncConfigPath, JSON.stringify(syncConfig, null, 2));
}

async function createUserGitignore(projectPath: string): Promise<void> {
    const gitignoreContent = `
# Custom site features file created by the site-features-vite-plugin when you run locally or build
apps/pika-chat/src/lib/server/custom-site-features.ts

# Dependencies
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

async function installDependencies(projectPath: string, silent: boolean = false): Promise<void> {
    try {
        // Check if pnpm is available
        let pnpmAvailable = false;
        try {
            await execAsync('pnpm --version');
            pnpmAvailable = true;
        } catch {
            // pnpm not available
        }

        if (!pnpmAvailable) {
            if (!silent) {
                logger.warn('pnpm is not installed on your system.');
                logger.newLine();
            }

            const { shouldInstallPnpm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'shouldInstallPnpm',
                    message: 'Would you like to install pnpm? (Recommended for Pika projects)',
                    default: true
                }
            ]);

            if (shouldInstallPnpm) {
                if (!silent) {
                    logger.info('Installing pnpm...');
                }
                try {
                    // Try to install pnpm globally
                    await execAsync('npm install -g pnpm');
                    if (!silent) {
                        logger.success('pnpm installed successfully!');
                    }
                    pnpmAvailable = true;
                } catch (error) {
                    if (!silent) {
                        logger.error('Failed to install pnpm automatically.');
                        logger.info('Please install pnpm manually:');
                        console.log('  npm install -g pnpm');
                        console.log('  # or');
                        console.log('  curl -fsSL https://get.pnpm.io/install.sh | sh -');
                        logger.newLine();
                    }

                    const { continueWithNpm } = await inquirer.prompt([
                        {
                            type: 'confirm',
                            name: 'continueWithNpm',
                            message: 'Continue with npm instead? (Some features may not work optimally)',
                            default: false
                        }
                    ]);

                    if (!continueWithNpm) {
                        if (!silent) {
                            logger.warn('Dependency installation skipped. Please install pnpm and run "pnpm install" manually.');
                        }
                        return;
                    }
                }
            } else {
                const { continueWithNpm } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'continueWithNpm',
                        message: 'Continue with npm instead? (Some features may not work optimally)',
                        default: false
                    }
                ]);

                if (!continueWithNpm) {
                    if (!silent) {
                        logger.warn('Dependency installation skipped. Please install pnpm and run "pnpm install" manually.');
                    }
                    return;
                }
            }
        }

        const packageManager = pnpmAvailable ? 'pnpm' : 'npm';
        const installCommand = pnpmAvailable ? 'pnpm install' : 'npm install';

        if (!silent) {
            logger.info(`Installing dependencies with ${packageManager}...`);
        }
        await execAsync(installCommand, {
            cwd: projectPath
        } as ExecOptions);

        if (!silent) {
            logger.success('Dependencies installed successfully!');
        }
    } catch (error) {
        if (!silent) {
            logger.warn('Failed to install dependencies automatically.');
            logger.info('You can install them manually:');
            console.log('  pnpm install  # (recommended)');
            console.log('  # or');
            console.log('  npm install');
        }
        logger.debug('Dependency installation error:', error);
    }
}

async function showCompletionMessage(config: ProjectConfig, options: CreateAppOptions): Promise<void> {
    console.log(chalk.green.bold(`Successfully created ${config.projectName}!`));
    console.log();

    console.log(chalk.bold('Next steps:'));
    console.log(chalk.reset(`  cd ${path.relative(process.cwd(), config.projectPath)}`));
    if (options.skipInstall) {
        console.log(chalk.reset('  pnpm install  # or npm install'));
    }
    console.log(chalk.reset('  pnpm dev      # Start development server'));
    console.log();

    console.log(chalk.bold('What you got:'));
    console.log(chalk.reset('  • A generic front end to render any chat app in: /apps/pika-chat'));
    console.log(chalk.reset('  • A generic chatbot/agent backend that uses your defined chat apps and agents: /services/pika'));
    console.log(chalk.reset('  • A weather service showing how to define a chatapp/agent (remove from services/samples/ if not needed)'));
    console.log(chalk.reset('  • A sample webapp to demo embedded mode (remove from apps/samples/ if not needed)'));
    console.log(chalk.reset('  • Ready-to-customize authentication system in the front end'));
    console.log(chalk.reset('  • Custom UI tag component support in the front end'));
    console.log();

    console.log(chalk.bold('Key customization areas:'));
    console.log(chalk.reset('  • Project Configuration: pika-config.ts (update project names here)'));
    console.log(chalk.reset('  • Custom Components: apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components'));
    console.log(chalk.reset('  • Custom Webapps: apps/custom directory'));
    console.log(chalk.reset('  • Custom Services: services/custom directory'));
    console.log(chalk.reset('  • Frontend Chat App Stack: apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts'));
    console.log(chalk.reset('  • Backend Service Stack: services/pika/lib/stacks/custom-stack-defs.ts'));
    console.log();

    console.log(chalk.bold('Infrastructure customization:'));
    console.log(chalk.gray('  • Update project names in pika-config.ts used in stack and resource names (recommended)'));
    console.log(chalk.gray('  • Modify frontend stack using apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts...'));
    console.log(chalk.gray('      • Add resources to the stack before and after the primary construct creation'));
    console.log(chalk.gray('      • Modify the props used in the primary construct creation'));
    console.log(chalk.gray('      • You will need to set the domain name, certificate ARN and hosted zone ID in the stack for the frontend to work'));
    console.log(chalk.gray('  • Modify backend stack using services/pika/lib/stacks/custom-stack-defs.ts...'));
    console.log(chalk.gray('      • Add resources to the stack before and after the primary construct creation'));
    console.log(chalk.gray('      • Modify the props used in the primary construct creation'));
    console.log(chalk.gray('      • You may not need to do anything here, it will just work out of the box'));
    console.log(chalk.gray('  • These files are protected from framework updates'));
    console.log();

    console.log(chalk.bold('Version control:'));
    console.log(chalk.gray('  • Initialize git: git init && git add . && git commit -m "Initial commit"'));
    console.log(chalk.gray('  • Or use your preferred version control system'));
    console.log();

    console.log(chalk.bold('To run locally:'));
    console.log(chalk.gray('  • First, make sure to rename the stacks/resources in pika-config.ts if you want to'));
    console.log(chalk.gray('  • We need to deploy the back end stack since front end stack even locally depends on it'));
    console.log(chalk.gray('  • Then cd services/pika and "pnpm build" and then "pnpm run cdk:deploy" to deploy the back end service'));
    console.log(chalk.gray('  • Then cd services/weather and "pnpm build" and then "pnpm run cdk:deploy" to deploy a sample chat app'));
    console.log(chalk.gray('  • Then cd apps/pika-chat and "pnpm build" and then "pnpm run dev" to hit the front end'));
    console.log(chalk.gray('  • Hit http://localhost:3000/chat/weather (or whatever host/port you set in pika-config.ts)'));
    console.log();

    console.log(chalk.bold('To deploy to AWS:'));
    console.log(chalk.gray('  • Add custom front end auth in apps/pika-chat/src/lib/server/auth-provider/index.ts'));
    console.log(chalk.gray('  • Define the requisite front end stack resources (vpcs, etc) in apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts'));
    console.log(chalk.gray("  • Modify the back end stack resources if you need to (probably won't need to) (vpcs, etc) in services/pika/lib/stacks/custom-stack-defs.ts"));
    console.log(chalk.gray('  • Then cd services/pika and "pnpm build" and then "pnpm run cdk:deploy" to deploy the back end service'));
    console.log(chalk.gray('  • Then cd services/weather and "pnpm build" and then "pnpm run cdk:deploy" to deploy a sample chat app'));
    console.log(chalk.gray('  • Then cd apps/pika-chat and "pnpm build" and then "pnpm run cdk:deploy" to deploy the front end'));
    console.log();

    console.log(chalk.bold('Learn more:'));
    console.log(chalk.gray('  • Framework docs: https://github.com/rithum/pika'));
    console.log(chalk.gray('  • Customization guide: ./docs/help/customization.md'));
    console.log(chalk.gray('  • Deploy to AWS: See services/pika/README.md'));
    console.log();

    console.log(chalk.bold('Important: Understanding the sync system'));
    console.log(chalk.gray('  We recommend you immediately run:'));
    console.log(chalk.gray('  pika sync --help'));
    console.log(chalk.gray('  This will explain how you are meant to safely customize this code while'));
    console.log(chalk.gray('  continuing to be able to sync down changes from the Pika framework.'));
    console.log();

    // Prompt user to run sync help
    const { runSyncHelp } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'runSyncHelp',
            message: 'Would you like to run "pika sync --help" now to learn about the sync system?',
            default: true
        }
    ]);

    if (runSyncHelp) {
        console.log();
        console.log(chalk.cyan('Running pika sync --help...'));
        console.log();

        // Import and run the sync help
        const { syncCommand } = await import('./sync.js');
        await syncCommand({ help: true });
    } else {
        console.log(chalk.gray('You can run "pika sync --help" anytime to learn about the sync system.'));
    }
}
