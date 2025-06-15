import inquirer from 'inquirer';
import path from 'path';
import { fileManager } from '../utils/file-manager.js';
import { gitManager } from '../utils/git-manager.js';
import { configManager } from '../utils/config-manager.js';
import { logger } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { DistinctQuestion } from 'inquirer';
import type { ExecOptions } from 'child_process';

const execAsync = promisify(exec);

interface CreateAppOptions {
    template?: string;
    directory?: string;
    skipInstall?: boolean;
    skipGit?: boolean;
}

interface ProjectSetupAnswers {
    projectName: string;
    description: string;
    includeWeatherApp: boolean;
    authProvider: 'mock' | 'auth-js' | 'custom' | 'enterprise-sso';
    serviceOrganization: 'monorepo' | 'external';
    awsRegion: string;
    deploymentStage: string;
    enterpriseFeatures: boolean;
}

export async function createApp(projectName?: string, options: CreateAppOptions = {}): Promise<void> {
    try {
        logger.header('🐦 Pika Framework - Create New Chat Application');

        // Get project setup information
        const answers = await getProjectSetupAnswers(projectName);

        // Determine output directory
        const outputDir = options.directory || path.resolve(process.cwd(), answers.projectName);

        // Check if directory already exists
        if (await fileManager.exists(outputDir)) {
            const { overwrite } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'overwrite',
                    message: `Directory "${outputDir}" already exists. Overwrite?`,
                    default: false
                }
            ]);

            if (!overwrite) {
                logger.warn('Project creation cancelled.');
                return;
            }

            await fileManager.removeDirectory(outputDir);
        }

        // Create project
        const spinner = logger.startSpinner('Creating Pika project...');

        try {
            await createProjectStructure(outputDir, answers, options);
            logger.stopSpinner(true, 'Project structure created');

            // Install dependencies
            if (!options.skipInstall) {
                logger.updateSpinner('Installing dependencies...');
                await installDependencies(outputDir);
                logger.stopSpinner(true, 'Dependencies installed');
            }

            // Initialize git repository
            if (!options.skipGit) {
                logger.updateSpinner('Initializing git repository...');
                await initializeGitRepository(outputDir, answers);
                logger.stopSpinner(true, 'Git repository initialized');
            }

            // Show completion message
            showCompletionMessage(answers.projectName, outputDir, options);
        } catch (error) {
            logger.stopSpinner(false, 'Failed to create project');
            throw error;
        }
    } catch (error) {
        logger.error('Failed to create Pika application:', error);
        process.exit(1);
    }
}

async function getProjectSetupAnswers(projectName?: string): Promise<ProjectSetupAnswers> {
    const questions: Array<DistinctQuestion<ProjectSetupAnswers>> = [
        {
            type: 'input',
            name: 'projectName',
            message: 'Project name:',
            default: projectName || 'my-pika-app',
            validate: (input: string) => {
                if (!input.trim()) return 'Project name is required';
                if (!/^[a-zA-Z0-9-_]+$/.test(input)) return 'Project name can only contain letters, numbers, hyphens, and underscores';
                return true;
            },
            when: () => !projectName
        },
        {
            type: 'input',
            name: 'description',
            message: 'Project description:',
            default: 'A chat application built with Pika Framework'
        },
        {
            type: 'confirm',
            name: 'includeWeatherApp',
            message: 'Include sample weather app?',
            default: true
        },
        {
            type: 'list',
            name: 'authProvider',
            message: 'Choose authentication strategy:',
            choices: [
                { name: 'Mock (for development)', value: 'mock' },
                { name: 'Auth.js (OAuth providers)', value: 'auth-js' },
                { name: 'Custom (bring your own)', value: 'custom' },
                { name: 'Enterprise SSO', value: 'enterprise-sso' }
            ],
            default: 'mock'
        },
        {
            type: 'list',
            name: 'serviceOrganization',
            message: 'Service organization preference:',
            choices: [
                { name: 'Monorepo (embed services in project)', value: 'monorepo' },
                { name: 'External (separate service repositories)', value: 'external' }
            ],
            default: 'monorepo'
        },
        {
            type: 'input',
            name: 'awsRegion',
            message: 'AWS region:',
            default: 'us-east-1'
        },
        {
            type: 'input',
            name: 'deploymentStage',
            message: 'Default deployment stage:',
            default: 'dev'
        },
        {
            type: 'confirm',
            name: 'enterpriseFeatures',
            message: 'Enable enterprise features (advanced auth, monitoring)?',
            default: false
        }
    ];

    const answers = await inquirer.prompt<ProjectSetupAnswers>(questions);

    // Use provided projectName if available
    if (projectName) {
        answers.projectName = projectName;
    }

    return answers as ProjectSetupAnswers;
}

async function createProjectStructure(outputDir: string, answers: ProjectSetupAnswers, options: CreateAppOptions): Promise<void> {
    // Get the template path (for now, we'll use the existing pika structure)
    const templatePath = getTemplatePath(options.template || 'default');

    // Template variables for mustache templating
    const templateVariables = {
        projectName: answers.projectName,
        description: answers.description,
        authProvider: answers.authProvider,
        serviceOrganization: answers.serviceOrganization,
        awsRegion: answers.awsRegion,
        deploymentStage: answers.deploymentStage,
        includeWeatherApp: answers.includeWeatherApp,
        enterpriseFeatures: answers.enterpriseFeatures,
        timestamp: new Date().toISOString()
    };

    // Copy template to output directory
    const excludePatterns = ['node_modules', '.git', 'dist', '.turbo', '.DS_Store', '*.log'];

    // Add weather app to exclusions if not wanted
    if (!answers.includeWeatherApp) {
        excludePatterns.push('services/weather');
    }

    await fileManager.copyTemplate(templatePath, outputDir, {
        exclude: excludePatterns,
        templateVariables,
        transform: (content, filePath) => {
            // Custom transformations for specific files
            if (filePath.endsWith('package.json')) {
                const packageJson = JSON.parse(content);
                packageJson.name = answers.projectName;
                packageJson.description = answers.description;
                return JSON.stringify(packageJson, null, 2);
            }
            return content;
        }
    });

    // Create custom directories
    await createCustomDirectories(outputDir, answers);

    // Generate configuration files
    await generateConfigFiles(outputDir, answers);

    // Setup authentication based on provider choice
    await setupAuthentication(outputDir, answers.authProvider);
}

function getTemplatePath(template: string): string {
    // For now, use the existing pika project structure as template
    // In a real implementation, this would point to template directories
    const packageRoot = path.resolve(__dirname, '../../..');
    return path.resolve(packageRoot, '..');
}

async function createCustomDirectories(outputDir: string, answers: ProjectSetupAnswers): Promise<void> {
    // Create custom components directory
    const customComponentsDir = path.join(outputDir, 'apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components');
    await fileManager.ensureDir(customComponentsDir);

    // Create index.ts for component registry
    const componentIndexContent = `// Custom Markdown Tag Components Registry
// Add your custom components here for automatic discovery

export interface CustomComponentMap {
  // Add your component interfaces here
  // Example: 'order': typeof OrderComponent;
}

// Export your custom components here
export const customComponents: Partial<CustomComponentMap> = {
  // Example: order: OrderComponent
};

export default customComponents;
`;

    await fileManager.writeFile(path.join(customComponentsDir, 'index.ts'), componentIndexContent);

    // Create example custom component
    const exampleComponentContent = `<script lang="ts">
  export let title: string = 'Custom Component';
  export let content: string = '';
</script>

<div class="custom-component">
  <h3>{title}</h3>
  <p>{content}</p>
</div>

<style>
  .custom-component {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px;
    margin: 8px 0;
    background: #f8fafc;
  }
  
  h3 {
    margin: 0 0 8px 0;
    color: #2d3748;
  }
  
  p {
    margin: 0;
    color: #4a5568;
  }
</style>
`;

    await fileManager.writeFile(path.join(customComponentsDir, 'example.svelte'), exampleComponentContent);

    // Create custom services directory if monorepo
    if (answers.serviceOrganization === 'monorepo') {
        const customServicesDir = path.join(outputDir, 'services/custom');
        await fileManager.ensureDir(customServicesDir);

        // Create .gitkeep to preserve directory
        await fileManager.writeFile(path.join(customServicesDir, '.gitkeep'), '# This directory is for your custom services\n');
    }
}

async function generateConfigFiles(outputDir: string, answers: ProjectSetupAnswers): Promise<void> {
    // Create pika.config.json
    const config = configManager.createDefaultConfig(answers.projectName);
    config.auth.provider = answers.authProvider;
    config.services.organization = answers.serviceOrganization;
    config.deployment.region = answers.awsRegion;
    config.deployment.stage = answers.deploymentStage;
    config.features.sampleWeatherApp = answers.includeWeatherApp;
    config.features.enterpriseFeatures = answers.enterpriseFeatures;

    await configManager.saveConfig(config, outputDir);

    // Create .pika-sync.json
    const syncConfig = configManager.createDefaultSyncConfig();
    await configManager.saveSyncConfig(syncConfig, outputDir);
}

async function setupAuthentication(outputDir: string, provider: string): Promise<void> {
    const authDir = path.join(outputDir, 'apps/pika-chat/src/auth');
    await fileManager.ensureDir(authDir);

    // Create base auth types and interfaces
    const authTypesContent = `// Pika Framework Authentication Types
export interface PikaUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  roles?: string[];
  permissions?: string[];
}

export interface AuthProvider {
  name: string;
  authenticate(): Promise<PikaUser | null>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<PikaUser | null>;
  isAuthenticated(): Promise<boolean>;
}

export interface AuthConfig {
  provider: string;
  options: Record<string, any>;
}
`;

    await fileManager.writeFile(path.join(authDir, 'types.ts'), authTypesContent);

    // Create auth provider based on selection
    await createAuthProvider(authDir, provider);
}

async function createAuthProvider(authDir: string, provider: string): Promise<void> {
    const providersDir = path.join(authDir, 'providers');
    await fileManager.ensureDir(providersDir);

    switch (provider) {
        case 'mock':
            await createMockAuthProvider(providersDir);
            break;
        case 'auth-js':
            await createAuthJsProvider(providersDir);
            break;
        case 'custom':
            await createCustomAuthProvider(providersDir);
            break;
        case 'enterprise-sso':
            await createEnterpriseSSOProvider(providersDir);
            break;
    }
}

async function createMockAuthProvider(providersDir: string): Promise<void> {
    const mockAuthContent = `import type { AuthProvider, PikaUser } from '../types.js';

export class MockAuthProvider implements AuthProvider {
  name = 'mock';
  
  private mockUser: PikaUser = {
    id: 'mock-user-1',
    email: 'user@example.com',
    name: 'Mock User',
    avatar: 'https://ui-avatars.com/api/?name=Mock+User',
    roles: ['user'],
    permissions: ['chat:read', 'chat:write']
  };

  async authenticate(): Promise<PikaUser | null> {
    // Mock authentication always succeeds
    return this.mockUser;
  }

  async logout(): Promise<void> {
    // Mock logout
    console.log('Mock user logged out');
  }

  async getCurrentUser(): Promise<PikaUser | null> {
    return this.mockUser;
  }

  async isAuthenticated(): Promise<boolean> {
    return true;
  }
}
`;

    await fileManager.writeFile(path.join(providersDir, 'mock-auth.ts'), mockAuthContent);
}

async function createAuthJsProvider(providersDir: string): Promise<void> {
    const authJsContent = `import type { AuthProvider, PikaUser } from '../types.js';
// Note: You'll need to install @auth/sveltekit and configure it

export class AuthJsProvider implements AuthProvider {
  name = 'auth-js';

  async authenticate(): Promise<PikaUser | null> {
    // Implement Auth.js authentication
    throw new Error('Auth.js provider not yet implemented. See documentation for setup instructions.');
  }

  async logout(): Promise<void> {
    // Implement Auth.js logout
    throw new Error('Auth.js provider not yet implemented. See documentation for setup instructions.');
  }

  async getCurrentUser(): Promise<PikaUser | null> {
    // Get current user from Auth.js session
    throw new Error('Auth.js provider not yet implemented. See documentation for setup instructions.');
  }

  async isAuthenticated(): Promise<boolean> {
    // Check Auth.js session
    throw new Error('Auth.js provider not yet implemented. See documentation for setup instructions.');
  }
}
`;

    await fileManager.writeFile(path.join(providersDir, 'auth-js.ts'), authJsContent);
}

async function createCustomAuthProvider(providersDir: string): Promise<void> {
    const customAuthContent = `import type { AuthProvider, PikaUser } from '../types.js';

export class CustomAuthProvider implements AuthProvider {
  name = 'custom';

  async authenticate(): Promise<PikaUser | null> {
    // TODO: Implement your custom authentication logic
    // This is where you integrate with your existing auth system
    
    throw new Error('Custom auth provider not implemented. Please implement authentication logic.');
  }

  async logout(): Promise<void> {
    // TODO: Implement your custom logout logic
    throw new Error('Custom auth provider not implemented. Please implement logout logic.');
  }

  async getCurrentUser(): Promise<PikaUser | null> {
    // TODO: Implement logic to get current user
    throw new Error('Custom auth provider not implemented. Please implement getCurrentUser logic.');
  }

  async isAuthenticated(): Promise<boolean> {
    // TODO: Implement authentication check
    throw new Error('Custom auth provider not implemented. Please implement isAuthenticated logic.');
  }
}
`;

    await fileManager.writeFile(path.join(providersDir, 'custom-auth.ts'), customAuthContent);
}

async function createEnterpriseSSOProvider(providersDir: string): Promise<void> {
    const enterpriseAuthContent = `import type { AuthProvider, PikaUser } from '../types.js';

export class EnterpriseSSOProvider implements AuthProvider {
  name = 'enterprise-sso';

  async authenticate(): Promise<PikaUser | null> {
    // TODO: Implement SAML/OIDC/Enterprise SSO integration
    throw new Error('Enterprise SSO provider not implemented. Please configure your SSO integration.');
  }

  async logout(): Promise<void> {
    // TODO: Implement SSO logout with proper redirect
    throw new Error('Enterprise SSO provider not implemented. Please configure SSO logout.');
  }

  async getCurrentUser(): Promise<PikaUser | null> {
    // TODO: Get user from SSO session/token
    throw new Error('Enterprise SSO provider not implemented. Please configure user retrieval.');
  }

  async isAuthenticated(): Promise<boolean> {
    // TODO: Validate SSO session/token
    throw new Error('Enterprise SSO provider not implemented. Please configure session validation.');
  }
}
`;

    await fileManager.writeFile(path.join(providersDir, 'enterprise-sso.ts'), enterpriseAuthContent);
}

async function installDependencies(outputDir: string): Promise<void> {
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
            cwd: outputDir
        } as ExecOptions);
    } catch (error) {
        logger.warn('Failed to install dependencies automatically. You can install them manually later.');
        logger.debug('Dependency installation error:', error);
    }
}

async function initializeGitRepository(outputDir: string, answers: ProjectSetupAnswers): Promise<void> {
    try {
        await gitManager.initRepository(outputDir);
        await gitManager.addAll(outputDir);
        await gitManager.commit(`Initial commit: Created ${answers.projectName} with Pika Framework`, outputDir);
    } catch (error) {
        logger.warn('Failed to initialize git repository. You can do this manually later.');
        logger.debug('Git initialization error:', error);
    }
}

function showCompletionMessage(projectName: string, outputDir: string, options: CreateAppOptions): void {
    logger.success(`Successfully created ${projectName}!`);
    logger.newLine();

    logger.info('Next steps:');
    console.log(`  cd ${path.relative(process.cwd(), outputDir)}`);

    if (options.skipInstall) {
        console.log('  pnpm install  # or npm install');
    }

    console.log('  pnpm dev      # or npm run dev');
    logger.newLine();

    logger.info('Available commands:');
    console.log('  pika auth setup <provider>  # Configure authentication');
    console.log('  pika component add <name>   # Add custom component');
    console.log('  pika sync                   # Sync with framework updates');
    logger.newLine();

    logger.info('Documentation:');
    console.log('  • Authentication: See apps/pika-chat/src/auth/README.md');
    console.log('  • Custom Components: See custom-markdown-tag-components/README.md');
    console.log('  • Deployment: See docs/deployment.md');
}
