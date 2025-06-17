import { fileManager } from './file-manager.js';
import { logger } from './logger.js';
import path from 'path';

export interface PikaConfig {
    projectName: string;
    version: string;
    framework: {
        version: string;
        lastSync: string;
    };
    auth: {
        provider: 'mock' | 'auth-js' | 'custom' | 'enterprise-sso';
        options: Record<string, any>;
    };
    components: {
        customDirectory: string;
        autoDiscovery: boolean;
    };
    services: {
        organization: 'monorepo' | 'external';
        customDirectory: string;
    };
    deployment: {
        region: string;
        profile?: string;
        stage: string;
    };
    features: {
        sampleWeatherApp: boolean;
        enterpriseFeatures: boolean;
    };
}

export interface SyncConfig {
    version: string;
    lastSync: string;
    syncHistory: Array<{
        version: string;
        timestamp: string;
        changes: string[];
    }>;
    protectedPaths: string[];
    customPaths: string[];
}

export class ConfigManager {
    private configFileName = 'pika.config.json';
    private syncFileName = '.pika-sync.json';

    async loadConfig(projectPath: string = process.cwd()): Promise<PikaConfig | null> {
        const configPath = path.join(projectPath, this.configFileName);

        if (await fileManager.exists(configPath)) {
            return fileManager.readJsonFile(configPath);
        }

        return null;
    }

    async saveConfig(config: PikaConfig, projectPath: string = process.cwd()): Promise<void> {
        const configPath = path.join(projectPath, this.configFileName);
        await fileManager.writeJsonFile(configPath, config);
        logger.debug(`Saved config to ${configPath}`);
    }

    async loadSyncConfig(projectPath: string = process.cwd()): Promise<SyncConfig | null> {
        const syncPath = path.join(projectPath, this.syncFileName);

        if (await fileManager.exists(syncPath)) {
            return fileManager.readJsonFile(syncPath);
        }

        return null;
    }

    async saveSyncConfig(config: SyncConfig, projectPath: string = process.cwd()): Promise<void> {
        const syncPath = path.join(projectPath, this.syncFileName);
        await fileManager.writeJsonFile(syncPath, config);
        logger.debug(`Saved sync config to ${syncPath}`);
    }

    async isPikaProject(projectPath: string = process.cwd()): Promise<boolean> {
        const configPath = path.join(projectPath, this.configFileName);
        return fileManager.exists(configPath);
    }

    async getProjectInfo(projectPath: string = process.cwd()): Promise<{
        name: string;
        version: string;
        isPikaProject: boolean;
    }> {
        const packageJsonPath = path.join(projectPath, 'package.json');
        const packageJson = await fileManager.readJsonFile(packageJsonPath);
        const isPikaProject = await this.isPikaProject(projectPath);

        return {
            name: packageJson?.name || path.basename(projectPath),
            version: packageJson?.version || '0.0.0',
            isPikaProject
        };
    }

    createDefaultConfig(projectName: string): PikaConfig {
        return {
            projectName,
            version: '1.0.0',
            framework: {
                version: '1.0.0',
                lastSync: new Date().toISOString()
            },
            auth: {
                provider: 'mock',
                options: {}
            },
            components: {
                customDirectory: './apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components',
                autoDiscovery: true
            },
            services: {
                organization: 'monorepo',
                customDirectory: './services/custom'
            },
            deployment: {
                region: 'us-east-1',
                stage: 'dev'
            },
            features: {
                sampleWeatherApp: true,
                enterpriseFeatures: false
            }
        };
    }

    createDefaultSyncConfig(): SyncConfig {
        return {
            version: '1.0.0',
            lastSync: new Date().toISOString(),
            syncHistory: [],
            protectedPaths: [
                'apps/pika-chat/src/lib/server/auth-provider/',
                'apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/',
                'services/custom/',
                '.env*',
                'pika.config.json',
                '.pika-sync.json'
            ],
            customPaths: ['services/custom/', 'apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/']
        };
    }

    async validateConfig(config: PikaConfig): Promise<{
        valid: boolean;
        errors: string[];
        warnings: string[];
    }> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate required fields
        if (!config.projectName) {
            errors.push('Project name is required');
        }

        if (!config.auth.provider) {
            errors.push('Auth provider is required');
        }

        // Validate auth provider
        const validAuthProviders = ['mock', 'auth-js', 'custom', 'enterprise-sso'];
        if (!validAuthProviders.includes(config.auth.provider)) {
            errors.push(`Invalid auth provider: ${config.auth.provider}`);
        }

        // Validate service organization
        const validOrganizations = ['monorepo', 'external'];
        if (!validOrganizations.includes(config.services.organization)) {
            errors.push(`Invalid service organization: ${config.services.organization}`);
        }

        // Check if custom directories exist
        if (config.components.customDirectory) {
            const customComponentsPath = fileManager.resolvePath(config.components.customDirectory);
            if (!(await fileManager.exists(customComponentsPath))) {
                warnings.push(`Custom components directory does not exist: ${config.components.customDirectory}`);
            }
        }

        if (config.services.organization === 'monorepo' && config.services.customDirectory) {
            const customServicesPath = fileManager.resolvePath(config.services.customDirectory);
            if (!(await fileManager.exists(customServicesPath))) {
                warnings.push(`Custom services directory does not exist: ${config.services.customDirectory}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    async updateConfig(updates: Partial<PikaConfig>, projectPath: string = process.cwd()): Promise<PikaConfig> {
        const existingConfig = (await this.loadConfig(projectPath)) || this.createDefaultConfig('unknown');
        const updatedConfig = { ...existingConfig, ...updates };
        await this.saveConfig(updatedConfig, projectPath);
        return updatedConfig;
    }
}

export const configManager = new ConfigManager();
