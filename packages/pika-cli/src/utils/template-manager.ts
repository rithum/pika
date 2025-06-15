import path from 'path';
import { fileManager } from './file-manager.js';
import { logger } from './logger.js';

export interface TemplateContext {
    projectName: string;
    description: string;
    authProvider: string;
    serviceOrganization: string;
    awsRegion: string;
    deploymentStage: string;
    includeWeatherApp: boolean;
    enterpriseFeatures: boolean;
    timestamp: string;
    [key: string]: any;
}

export class TemplateManager {
    private templatesDir: string;

    constructor() {
        this.templatesDir = path.resolve(__dirname, '../../templates');
    }

    async getAvailableTemplates(): Promise<string[]> {
        try {
            const templates = await fileManager.findFiles('*', this.templatesDir);
            return templates.filter((t) => fileManager.isDirectory(path.join(this.templatesDir, t)));
        } catch (error) {
            logger.debug('Failed to list templates:', error);
            return ['default'];
        }
    }

    async templateExists(templateName: string): Promise<boolean> {
        const templatePath = path.join(this.templatesDir, templateName);
        return fileManager.exists(templatePath);
    }

    getTemplatePath(templateName: string): string {
        return path.join(this.templatesDir, templateName);
    }

    createTemplateContext(answers: any): TemplateContext {
        return {
            projectName: answers.projectName,
            description: answers.description || `A chat application built with Pika Framework`,
            authProvider: answers.authProvider || 'mock',
            serviceOrganization: answers.serviceOrganization || 'monorepo',
            awsRegion: answers.awsRegion || 'us-east-1',
            deploymentStage: answers.deploymentStage || 'dev',
            includeWeatherApp: answers.includeWeatherApp !== false,
            enterpriseFeatures: answers.enterpriseFeatures === true,
            timestamp: new Date().toISOString(),
            ...answers
        };
    }

    async processTemplate(
        templatePath: string,
        outputPath: string,
        context: TemplateContext,
        options: {
            exclude?: string[];
            includeHidden?: boolean;
        } = {}
    ): Promise<void> {
        const { exclude = [], includeHidden = false } = options;

        // Default exclusions
        const defaultExclude = ['node_modules', '.git', 'dist', 'build', '.turbo', '.DS_Store', '*.log', '.env*'];

        const allExclusions = [...defaultExclude, ...exclude];

        await fileManager.copyTemplate(templatePath, outputPath, {
            exclude: allExclusions,
            templateVariables: context,
            transform: (content, filePath) => {
                return this.processFileContent(content, filePath, context);
            }
        });
    }

    private processFileContent(content: string, filePath: string, context: TemplateContext): string {
        // Handle specific file types
        if (filePath.endsWith('package.json')) {
            return this.processPackageJson(content, context);
        }

        if (filePath.endsWith('.env.example')) {
            return this.processEnvTemplate(content, context);
        }

        if (filePath.endsWith('README.md')) {
            return this.processReadmeTemplate(content, context);
        }

        // Handle conditional content blocks
        content = this.processConditionalBlocks(content, context);

        return content;
    }

    private processPackageJson(content: string, context: TemplateContext): string {
        try {
            const packageJson = JSON.parse(content);

            packageJson.name = context.projectName;
            packageJson.description = context.description;

            // Add conditional dependencies based on auth provider
            if (context.authProvider === 'auth-js') {
                packageJson.dependencies = packageJson.dependencies || {};
                packageJson.dependencies['@auth/sveltekit'] = '^0.10.0';
                packageJson.dependencies['@auth/core'] = '^0.18.0';
            }

            return JSON.stringify(packageJson, null, 2);
        } catch {
            return content;
        }
    }

    private processEnvTemplate(content: string, context: TemplateContext): string {
        let envContent = content;

        // Add AWS region
        if (!envContent.includes('AWS_REGION')) {
            envContent += `\n# AWS Configuration\nAWS_REGION=${context.awsRegion}\n`;
        }

        // Add auth-specific variables
        if (context.authProvider === 'auth-js') {
            envContent += '\n# Auth.js Configuration\nAUTH_SECRET=\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n';
        } else if (context.authProvider === 'enterprise-sso') {
            envContent += '\n# Enterprise SSO Configuration\nSAML_CERT=\nSAML_ENTRY_POINT=\nOIDC_CLIENT_ID=\nOIDC_CLIENT_SECRET=\n';
        }

        return envContent;
    }

    private processReadmeTemplate(content: string, context: TemplateContext): string {
        return content
            .replace(/\{\{projectName\}\}/g, context.projectName)
            .replace(/\{\{description\}\}/g, context.description)
            .replace(/\{\{authProvider\}\}/g, context.authProvider);
    }

    private processConditionalBlocks(content: string, context: TemplateContext): string {
        // Process {{#if condition}} blocks
        const ifBlockRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

        content = content.replace(ifBlockRegex, (match, condition, blockContent) => {
            const conditionValue = context[condition];

            // Include block if condition is truthy
            if (conditionValue) {
                return blockContent;
            }

            return '';
        });

        // Process {{#unless condition}} blocks
        const unlessBlockRegex = /\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g;

        content = content.replace(unlessBlockRegex, (match, condition, blockContent) => {
            const conditionValue = context[condition];

            // Include block if condition is falsy
            if (!conditionValue) {
                return blockContent;
            }

            return '';
        });

        return content;
    }

    async createCustomTemplate(templateName: string, sourceDir: string): Promise<void> {
        const templatePath = path.join(this.templatesDir, templateName);

        await fileManager.copyTemplate(sourceDir, templatePath, {
            exclude: ['node_modules', '.git', 'dist', '.turbo']
        });

        logger.success(`Created template: ${templateName}`);
    }
}

export const templateManager = new TemplateManager();
