import inquirer from 'inquirer';
import path from 'path';
import { configManager } from '../utils/config-manager.js';
import { fileManager } from '../utils/file-manager.js';
import { logger } from '../utils/logger.js';
import type { DistinctQuestion } from 'inquirer';

interface AuthOptions {
    setup?: string;
    status?: boolean;
}

interface AuthProviderConfig {
    name: string;
    description: string;
    dependencies: string[];
    envVars: string[];
    configFields: Array<{
        name: string;
        type: string;
        required: boolean;
        description: string;
        default?: any;
    }>;
}

interface ProviderConfigAnswers {
    [key: string]: any; // This will be populated based on the provider's configFields
}

const AUTH_PROVIDERS: Record<string, AuthProviderConfig> = {
    mock: {
        name: 'Mock Authentication',
        description: 'Simple mock authentication for development',
        dependencies: [],
        envVars: [],
        configFields: []
    },
    'auth-js': {
        name: 'Auth.js',
        description: 'OAuth providers (Google, GitHub, etc.) via Auth.js',
        dependencies: ['@auth/sveltekit', '@auth/core'],
        envVars: ['AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
        configFields: [
            {
                name: 'providers',
                type: 'array',
                required: true,
                description: 'OAuth providers to enable',
                default: ['google']
            },
            {
                name: 'callbacks',
                type: 'object',
                required: false,
                description: 'Auth.js callback configuration'
            }
        ]
    },
    custom: {
        name: 'Custom Authentication',
        description: 'Bring your own authentication system',
        dependencies: [],
        envVars: [],
        configFields: [
            {
                name: 'endpoint',
                type: 'string',
                required: true,
                description: 'Authentication endpoint URL'
            },
            {
                name: 'tokenHeader',
                type: 'string',
                required: false,
                description: 'Authorization header name',
                default: 'Authorization'
            }
        ]
    },
    'enterprise-sso': {
        name: 'Enterprise SSO',
        description: 'SAML/OIDC enterprise single sign-on',
        dependencies: ['@auth/sveltekit', '@auth/core'],
        envVars: ['SAML_CERT', 'SAML_ENTRY_POINT', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'],
        configFields: [
            {
                name: 'protocol',
                type: 'string',
                required: true,
                description: 'SSO protocol (saml or oidc)',
                default: 'saml'
            },
            {
                name: 'entityId',
                type: 'string',
                required: true,
                description: 'Entity ID for SAML or Client ID for OIDC'
            },
            {
                name: 'entryPoint',
                type: 'string',
                required: true,
                description: 'SSO entry point URL'
            }
        ]
    }
};

export async function authCommand(options: AuthOptions = {}): Promise<void> {
    try {
        logger.header('🔐 Pika Authentication Manager');

        // Verify this is a Pika project
        if (!(await configManager.isPikaProject())) {
            logger.error('This is not a Pika project. Run this command from a Pika project directory.');
            return;
        }

        // Load configuration
        const config = await configManager.loadConfig();
        if (!config) {
            logger.error('Failed to load project configuration.');
            return;
        }

        // Handle different command options
        if (options.setup) {
            await setupAuthProvider(options.setup, config);
        } else if (options.status) {
            await showAuthStatus(config);
        } else {
            // Interactive mode
            await interactiveAuthManager(config);
        }
    } catch (error) {
        logger.error('Auth command failed:', error);
        process.exit(1);
    }
}

async function interactiveAuthManager(config: any): Promise<void> {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: 'Setup authentication provider', value: 'setup' },
                { name: 'Show authentication status', value: 'status' },
                { name: 'Test authentication', value: 'test' },
                { name: 'Generate auth documentation', value: 'docs' }
            ]
        }
    ]);

    switch (action) {
        case 'setup':
            const { provider } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'provider',
                    message: 'Choose authentication provider:',
                    choices: Object.entries(AUTH_PROVIDERS).map(([key, value]) => ({
                        name: `${value.name} - ${value.description}`,
                        value: key
                    }))
                }
            ]);
            await setupAuthProvider(provider, config);
            break;

        case 'status':
            await showAuthStatus(config);
            break;

        case 'test':
            await testAuthentication(config);
            break;

        case 'docs':
            await generateAuthDocs(config);
            break;
    }
}

async function setupAuthProvider(providerName: string, config: any): Promise<void> {
    const provider = AUTH_PROVIDERS[providerName];

    if (!provider) {
        logger.error(`Unknown authentication provider: ${providerName}`);
        logger.info('Available providers:', Object.keys(AUTH_PROVIDERS).join(', '));
        return;
    }

    logger.info(`Setting up ${provider.name}...`);
    logger.info(provider.description);
    logger.newLine();

    // Confirm setup
    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: `Continue with ${provider.name} setup?`,
            default: true
        }
    ]);

    if (!confirm) {
        logger.info('Setup cancelled.');
        return;
    }

    // Install dependencies if needed
    if (provider.dependencies.length > 0) {
        logger.info('Required dependencies:');
        provider.dependencies.forEach((dep) => console.log(`  • ${dep}`));

        const { installDeps } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'installDeps',
                message: 'Install dependencies now?',
                default: true
            }
        ]);

        if (installDeps) {
            await installDependencies(provider.dependencies);
        }
    }

    // Configure provider
    const providerConfig = await configureProvider(provider);

    // Generate provider files
    await generateProviderFiles(providerName, provider, providerConfig);

    // Update project configuration
    await updateAuthConfig(config, providerName, providerConfig);

    // Show next steps
    showSetupCompletion(provider, providerConfig);
}

async function configureProvider(provider: AuthProviderConfig): Promise<ProviderConfigAnswers> {
    if (provider.configFields.length === 0) {
        return {};
    }

    logger.info('Provider configuration:');

    const questions: Array<DistinctQuestion<ProviderConfigAnswers>> = provider.configFields.map((field) => ({
        type: field.type === 'boolean' ? 'confirm' : field.type === 'array' ? 'checkbox' : 'input',
        name: field.name,
        message: `${field.description}:`,
        default: field.default,
        validate: field.required
            ? (input: any) => {
                  if (!input || (Array.isArray(input) && input.length === 0)) {
                      return `${field.name} is required`;
                  }
                  return true;
              }
            : undefined,
        choices: field.name === 'providers' ? ['google', 'github', 'microsoft', 'auth0', 'okta'] : undefined
    }));

    return inquirer.prompt<ProviderConfigAnswers>(questions);
}

async function installDependencies(dependencies: string[]): Promise<void> {
    const spinner = logger.startSpinner('Installing dependencies...');

    try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        // Detect package manager
        let packageManager = 'npm';
        if (await fileManager.exists('pnpm-lock.yaml')) {
            packageManager = 'pnpm';
        } else if (await fileManager.exists('yarn.lock')) {
            packageManager = 'yarn';
        }

        const installCommand = `${packageManager} ${packageManager === 'yarn' ? 'add' : 'install'} ${dependencies.join(' ')}`;

        await execAsync(installCommand);
        logger.stopSpinner(true, 'Dependencies installed successfully');
    } catch (error) {
        logger.stopSpinner(false, 'Failed to install dependencies');
        logger.error('You may need to install them manually:', dependencies.join(' '));
        logger.debug('Install error:', error);
    }
}

async function generateProviderFiles(providerName: string, provider: AuthProviderConfig, providerConfig: any): Promise<void> {
    const authDir = path.join('apps', 'pika-chat', 'src', 'auth');
    const providersDir = path.join(authDir, 'providers');

    await fileManager.ensureDir(providersDir);

    // Generate provider implementation
    const providerFile = path.join(providersDir, `${providerName}.ts`);
    const providerContent = await generateProviderContent(providerName, provider, providerConfig);

    await fileManager.writeFile(providerFile, providerContent);
    logger.info(`Generated provider file: ${providerFile}`);

    // Generate configuration files
    if (providerName === 'auth-js') {
        await generateAuthJsConfig(providerConfig);
    } else if (providerName === 'enterprise-sso') {
        await generateSSOConfig(providerConfig);
    }

    // Generate environment template
    await generateEnvTemplate(provider, providerConfig);
}

async function generateProviderContent(providerName: string, provider: AuthProviderConfig, providerConfig: any): Promise<string> {
    const className =
        providerName
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join('') + 'Provider';

    switch (providerName) {
        case 'mock':
            return generateMockProvider(className);

        case 'auth-js':
            return generateAuthJsProvider(className, providerConfig);

        case 'custom':
            return generateCustomProvider(className, providerConfig);

        case 'enterprise-sso':
            return generateSSOProvider(className, providerConfig);

        default:
            throw new Error(`Unknown provider: ${providerName}`);
    }
}

function generateMockProvider(className: string): string {
    return `import type { AuthProvider, PikaUser } from '../types.js';

export class ${className} implements AuthProvider {
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
    console.log('Mock authentication successful');
    return this.mockUser;
  }

  async logout(): Promise<void> {
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
}

function generateAuthJsProvider(className: string, config: any): string {
    const providers = config.providers || ['google'];
    const providerImports = providers.map((p: string) => `${p.charAt(0).toUpperCase() + p.slice(1)}`).join(', ');

    return `import type { AuthProvider, PikaUser } from '../types.js';
import { ${providerImports} } from '@auth/core/providers';

export class ${className} implements AuthProvider {
  name = 'auth-js';

  async authenticate(): Promise<PikaUser | null> {
    // Auth.js handles authentication via hooks
    // This method is called after successful authentication
    const session = await this.getSession();
    return session ? this.sessionToUser(session) : null;
  }

  async logout(): Promise<void> {
    // Redirect to Auth.js logout endpoint
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/signout';
    }
  }

  async getCurrentUser(): Promise<PikaUser | null> {
    const session = await this.getSession();
    return session ? this.sessionToUser(session) : null;
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return !!session;
  }

  private async getSession(): Promise<any> {
    // Get session from Auth.js
    // This is a placeholder - implement based on your Auth.js setup
    throw new Error('Auth.js session handling not implemented. See documentation.');
  }

  private sessionToUser(session: any): PikaUser {
    return {
      id: session.user.id || session.user.email,
      email: session.user.email,
      name: session.user.name,
      avatar: session.user.image,
      roles: session.user.roles || ['user'],
      permissions: session.user.permissions || ['chat:read', 'chat:write']
    };
  }
}

// Auth.js configuration
export const authConfig = {
  providers: [
    ${providers
        .map(
            (p: string) => `${p.charAt(0).toUpperCase() + p.slice(1)}({
      clientId: process.env.${p.toUpperCase()}_CLIENT_ID,
      clientSecret: process.env.${p.toUpperCase()}_CLIENT_SECRET,
    })`
        )
        .join(',\n    ')}
  ],
  callbacks: {
    session: ({ session, token }) => {
      // Customize session object
      return session;
    },
    jwt: ({ token, user }) => {
      // Customize JWT token
      return token;
    }
  }
};
`;
}

function generateCustomProvider(className: string, config: any): string {
    return `import type { AuthProvider, PikaUser } from '../types.js';

export class ${className} implements AuthProvider {
  name = 'custom';
  
  private readonly endpoint = '${config.endpoint || 'https://your-auth-api.com'}';
  private readonly tokenHeader = '${config.tokenHeader || 'Authorization'}';

  async authenticate(): Promise<PikaUser | null> {
    try {
      // Implement your custom authentication logic here
      // This might involve redirecting to your auth system
      
      // Example: Get token from your auth system
      const token = await this.getAuthToken();
      
      if (token) {
        // Validate token and get user info
        return this.validateTokenAndGetUser(token);
      }
      
      return null;
    } catch (error) {
      console.error('Custom authentication failed:', error);
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      // Clear local auth state
      localStorage.removeItem('auth-token');
      
      // Call your logout endpoint if needed
      // await fetch(\`\${this.endpoint}/logout\`, { method: 'POST' });
      
      console.log('Custom authentication logged out');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  async getCurrentUser(): Promise<PikaUser | null> {
    try {
      const token = localStorage.getItem('auth-token');
      
      if (!token) {
        return null;
      }
      
      return this.validateTokenAndGetUser(token);
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return !!user;
  }

  private async getAuthToken(): Promise<string | null> {
    // TODO: Implement token acquisition logic
    // This might involve redirecting to your auth provider
    throw new Error('getAuthToken not implemented');
  }

  private async validateTokenAndGetUser(token: string): Promise<PikaUser | null> {
    try {
      const response = await fetch(\`\${this.endpoint}/user\`, {
        headers: {
          [\`\${this.tokenHeader}\`]: \`Bearer \${token}\`
        }
      });

      if (!response.ok) {
        throw new Error('Token validation failed');
      }

      const userData = await response.json();
      
      // Map your user data to PikaUser interface
      return {
        id: userData.id,
        email: userData.email,
        name: userData.name || userData.displayName,
        avatar: userData.avatar || userData.picture,
        roles: userData.roles || ['user'],
        permissions: userData.permissions || ['chat:read', 'chat:write']
      };
    } catch (error) {
      console.error('User validation failed:', error);
      return null;
    }
  }
}
`;
}

function generateSSOProvider(className: string, config: any): string {
    return `import type { AuthProvider, PikaUser } from '../types.js';

export class ${className} implements AuthProvider {
  name = 'enterprise-sso';
  
  private readonly protocol = '${config.protocol || 'saml'}';
  private readonly entityId = '${config.entityId || ''}';
  private readonly entryPoint = '${config.entryPoint || ''}';

  async authenticate(): Promise<PikaUser | null> {
    try {
      // Redirect to SSO provider
      if (typeof window !== 'undefined') {
        const ssoUrl = this.buildSSOUrl();
        window.location.href = ssoUrl;
      }
      
      // This will be handled by callback
      return null;
    } catch (error) {
      console.error('SSO authentication failed:', error);
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      // Clear local session
      localStorage.removeItem('sso-session');
      
      // Redirect to SSO logout if needed
      if (typeof window !== 'undefined') {
        const logoutUrl = this.buildLogoutUrl();
        window.location.href = logoutUrl;
      }
    } catch (error) {
      console.error('SSO logout failed:', error);
    }
  }

  async getCurrentUser(): Promise<PikaUser | null> {
    try {
      const session = localStorage.getItem('sso-session');
      
      if (!session) {
        return null;
      }
      
      const sessionData = JSON.parse(session);
      
      // Validate session is still valid
      if (this.isSessionExpired(sessionData)) {
        localStorage.removeItem('sso-session');
        return null;
      }
      
      return this.sessionToUser(sessionData);
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return !!user;
  }

  private buildSSOUrl(): string {
    const params = new URLSearchParams({
      entityId: this.entityId,
      protocol: this.protocol
    });
    
    return \`\${this.entryPoint}?\${params.toString()}\`;
  }

  private buildLogoutUrl(): string {
    // Build logout URL based on your SSO provider
    return \`\${this.entryPoint}/logout\`;
  }

  private isSessionExpired(sessionData: any): boolean {
    if (!sessionData.expiresAt) {
      return false;
    }
    
    return Date.now() > sessionData.expiresAt;
  }

  private sessionToUser(sessionData: any): PikaUser {
    return {
      id: sessionData.userId || sessionData.email,
      email: sessionData.email,
      name: sessionData.name || sessionData.displayName,
      avatar: sessionData.avatar,
      roles: sessionData.roles || ['user'],
      permissions: sessionData.permissions || ['chat:read', 'chat:write']
    };
  }
}
`;
}

async function generateAuthJsConfig(config: any): Promise<void> {
    const configPath = path.join('apps', 'pika-chat', 'src', 'auth', 'auth.config.ts');

    const configContent = `// Auth.js configuration for Pika
import { ${config.providers.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')} } from '@auth/core/providers';
import type { AuthConfig } from '@auth/core';

export const authConfig: AuthConfig = {
  providers: [
    ${config.providers
        .map(
            (p: string) => `${p.charAt(0).toUpperCase() + p.slice(1)}({
      clientId: process.env.${p.toUpperCase()}_CLIENT_ID,
      clientSecret: process.env.${p.toUpperCase()}_CLIENT_SECRET,
    })`
        )
        .join(',\n    ')}
  ],
  callbacks: {
    session: ({ session, token }) => {
      // Add custom session properties
      return {
        ...session,
        user: {
          ...session.user,
          roles: token.roles || ['user'],
          permissions: token.permissions || ['chat:read', 'chat:write']
        }
      };
    },
    jwt: ({ token, user, account }) => {
      // Add custom JWT properties
      if (user) {
        token.roles = user.roles || ['user'];
        token.permissions = user.permissions || ['chat:read', 'chat:write'];
      }
      return token;
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error'
  }
};
`;

    await fileManager.writeFile(configPath, configContent);
}

async function generateSSOConfig(config: any): Promise<void> {
    const configPath = path.join('apps', 'pika-chat', 'src', 'auth', 'sso.config.ts');

    const configContent = `// Enterprise SSO configuration for Pika
export const ssoConfig = {
  protocol: '${config.protocol}',
  entityId: '${config.entityId}',
  entryPoint: '${config.entryPoint}',
  
  // SAML Configuration (if using SAML)
  saml: {
    cert: process.env.SAML_CERT,
    entryPoint: process.env.SAML_ENTRY_POINT,
    issuer: process.env.SAML_ISSUER,
    callbackUrl: process.env.SAML_CALLBACK_URL
  },
  
  // OIDC Configuration (if using OIDC)
  oidc: {
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
    issuer: process.env.OIDC_ISSUER,
    redirectUri: process.env.OIDC_REDIRECT_URI
  }
};
`;

    await fileManager.writeFile(configPath, configContent);
}

async function generateEnvTemplate(provider: AuthProviderConfig, config: any): Promise<void> {
    if (provider.envVars.length === 0) {
        return;
    }

    const envPath = '.env.example';
    let envContent = '';

    if (await fileManager.exists(envPath)) {
        envContent = await fileManager.readFile(envPath);
    }

    // Add auth section if not exists
    if (!envContent.includes('# Authentication')) {
        envContent += '\n# Authentication\n';
    }

    // Add required environment variables
    for (const envVar of provider.envVars) {
        if (!envContent.includes(envVar)) {
            envContent += `${envVar}=\n`;
        }
    }

    await fileManager.writeFile(envPath, envContent);
    logger.info(`Updated ${envPath} with required environment variables`);
}

async function updateAuthConfig(config: any, providerName: string, providerConfig: any): Promise<void> {
    config.auth.provider = providerName;
    config.auth.options = providerConfig;

    await configManager.saveConfig(config);
    logger.info('Updated project configuration');
}

function showSetupCompletion(provider: AuthProviderConfig, config: any): void {
    logger.success(`${provider.name} setup completed!`);
    logger.newLine();

    logger.info('Next steps:');

    if (provider.envVars.length > 0) {
        console.log('1. Configure environment variables:');
        provider.envVars.forEach((envVar) => {
            console.log(`   ${envVar}=your_value_here`);
        });
    }

    console.log('2. Test authentication: pika auth status');
    console.log('3. Start your development server: pnpm dev');

    if (provider.dependencies.length > 0) {
        logger.newLine();
        logger.info('Documentation links:');
        provider.dependencies.forEach((dep) => {
            console.log(`  • ${dep}: https://www.npmjs.com/package/${dep}`);
        });
    }
}

async function showAuthStatus(config: any): Promise<void> {
    logger.info('Authentication Status');
    logger.divider();

    const provider = AUTH_PROVIDERS[config.auth.provider];

    logger.table({
        Provider: provider ? provider.name : config.auth.provider,
        Status: provider ? '✓ Configured' : '✗ Unknown provider',
        Implementation: `apps/pika-chat/src/auth/providers/${config.auth.provider}.ts`,
        'Config Options': Object.keys(config.auth.options).length
    });

    // Check if provider file exists
    const providerFile = path.join('apps', 'pika-chat', 'src', 'auth', 'providers', `${config.auth.provider}.ts`);
    const providerExists = await fileManager.exists(providerFile);

    logger.newLine();
    logger.info('Provider Implementation:');
    console.log(`  File: ${providerFile}`);
    console.log(`  Exists: ${providerExists ? '✓ Yes' : '✗ No'}`);

    // Check environment variables
    if (provider && provider.envVars.length > 0) {
        logger.newLine();
        logger.info('Environment Variables:');

        for (const envVar of provider.envVars) {
            const value = process.env[envVar];
            console.log(`  ${envVar}: ${value ? '✓ Set' : '✗ Not set'}`);
        }
    }

    // Show configuration
    if (Object.keys(config.auth.options).length > 0) {
        logger.newLine();
        logger.info('Configuration:');
        Object.entries(config.auth.options).forEach(([key, value]) => {
            console.log(`  ${key}: ${JSON.stringify(value)}`);
        });
    }
}

async function testAuthentication(config: any): Promise<void> {
    logger.info('Testing authentication...');

    const providerFile = path.join('apps', 'pika-chat', 'src', 'auth', 'providers', `${config.auth.provider}.ts`);

    if (!(await fileManager.exists(providerFile))) {
        logger.error(`Provider file not found: ${providerFile}`);
        logger.info('Run "pika auth setup" to configure authentication.');
        return;
    }

    logger.warn('Authentication testing requires a running application.');
    logger.info('To test authentication:');
    console.log('1. Start your development server: pnpm dev');
    console.log('2. Visit your application in the browser');
    console.log('3. Try to authenticate using the configured provider');

    logger.newLine();
    logger.info('For automated testing, implement tests in your test suite.');
}

async function generateAuthDocs(config: any): Promise<void> {
    logger.info('Generating authentication documentation...');

    const provider = AUTH_PROVIDERS[config.auth.provider];
    const authDir = path.join('apps', 'pika-chat', 'src', 'auth');

    const docsContent = `# Authentication Documentation

## Current Configuration

**Provider:** ${provider ? provider.name : config.auth.provider}
**Description:** ${provider ? provider.description : 'Custom authentication provider'}

## Implementation

The authentication system is implemented in the following files:

- \`apps/pika-chat/src/auth/types.ts\` - Type definitions
- \`apps/pika-chat/src/auth/providers/${config.auth.provider}.ts\` - Provider implementation
- \`apps/pika-chat/src/hooks.server.ts\` - Server-side authentication hooks

## Configuration

${
    Object.keys(config.auth.options).length > 0
        ? `Current configuration options:

\`\`\`json
${JSON.stringify(config.auth.options, null, 2)}
\`\`\`

`
        : 'No configuration options set.'
}

## Environment Variables

${
    provider && provider.envVars.length > 0
        ? `Required environment variables:

${provider.envVars.map((envVar) => `- \`${envVar}\``).join('\n')}

`
        : 'No environment variables required.'
}

## Dependencies

${
    provider && provider.dependencies.length > 0
        ? `Required packages:

${provider.dependencies.map((dep) => `- \`${dep}\``).join('\n')}

`
        : 'No additional dependencies required.'
}

## Usage

1. The authentication provider is automatically loaded based on the configuration
2. Users are authenticated through the provider's \`authenticate()\` method
3. The current user is available through \`getCurrentUser()\`
4. Check authentication status with \`isAuthenticated()\`

## Customization

To customize the authentication behavior:

1. Modify the provider implementation in \`apps/pika-chat/src/auth/providers/${config.auth.provider}.ts\`
2. Update configuration in \`pika.config.json\`
3. Set required environment variables

## Testing

To test authentication:

1. Start the development server: \`pnpm dev\`
2. Navigate to your application
3. Try the authentication flow

For automated testing, create tests that verify:
- User can authenticate successfully
- Authentication state is properly managed
- Protected routes work correctly
- Logout functionality works

## Troubleshooting

Common issues and solutions:

1. **Authentication fails**: Check environment variables and provider configuration
2. **Redirect loops**: Verify callback URLs and session management
3. **Session not persisting**: Check cookie settings and session storage
4. **CORS issues**: Configure CORS settings for your auth provider

## Support

For additional help:
- Check the provider documentation
- Review the Pika authentication guide
- Ask for help in the Pika community
`;

    const docsPath = path.join(authDir, 'README.md');
    await fileManager.writeFile(docsPath, docsContent);

    logger.success(`Authentication documentation generated: ${docsPath}`);
}
