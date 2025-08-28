import { AgentDataRequest, AgentDefinition, AgentDefinitionForIdempotentCreateOrUpdate, ChatAppDataRequest } from 'pika-shared/types/chatbot/chatbot-types';
import Plugin from 'serverless/classes/Plugin';
import AwsProvider from 'serverless/plugins/aws/provider/awsProvider';
import { AgentDefinitionWithToolRefs, CloudFormationResource, PikaServerlessConfig, PikaToolWithLambdaRef } from './types';
import {
    buildToolIdToLambdaArnMap,
    buildToolIdToLambdaArnMapFromCustomConfig,
    generateLogicalId,
    generateTimestamp,
    gzipAndBase64EncodeString,
    prepareAgentData,
    prepareAgentDataFromCustomConfig,
    resolveCustomResourceArn,
    validatePikaConfig
} from './utils';
import Serverless from 'serverless';

class PikaServerlessPlugin implements Plugin {
    hooks: Record<string, () => void | Promise<void>>;
    serverless: Serverless;
    options: Serverless.Options;
    logger: Plugin.Logging['log'];
    pikaConfig: PikaServerlessConfig | undefined;

    constructor(serverless: Serverless, options: Serverless.Options, logging: Plugin.Logging) {
        this.serverless = serverless;
        this.options = options;
        this.logger = logging.log;

        // Define schema extensions for function-level pika configuration
        // this.defineSchema();

        this.hooks = {
            // TODO: remove if not needed
            // Legacy hook for backward compatibility with service-level config
            // 'before:aws:package:finalize': this.processLegacyConfiguration.bind(this),
            // New hooks for enhanced functionality
            'before:package:finalize': this.processPikaFunctions.bind(this),
            'after:aws:package:finalize:mergeCustomProviderResources': this.addPikaResources.bind(this)
        };
    }

    private getCustomPikaConfig(): PikaServerlessConfig {
        if (this.pikaConfig) {
            return this.pikaConfig;
        }

        if (!this.serverless.service.custom) {
            this.logger.error('No custom section found in your top level serverless.yml/serverless.ts file');
            throw new Error('No custom section found in your top level serverless.yml/serverless.ts file');
        }

        if (!this.serverless.service.custom.pika) {
            this.logger.error('Expected to find custom.pika section in your top level serverless.yml/serverless.ts file');
            throw new Error('Expected to find custom.pika section in your top level serverless.yml/serverless.ts file');
        } else {
            this.pikaConfig = this.serverless.service.custom.pika;

            if (!this.pikaConfig) {
                this.logger.error('Expected to find custom.pika section in your top level serverless.yml/serverless.ts file');
                throw new Error('Expected to find custom.pika section in your top level serverless.yml/serverless.ts file');
            }
            validatePikaConfig(this.pikaConfig);
        }

        return this.pikaConfig;
    }

    /**
     * Process Pika configuration from custom.pika section
     */
    private async processPikaFunctions(): Promise<void> {
        const template = this.serverless.service.provider.compiledCloudFormationTemplate;
        const customPika = this.getCustomPikaConfig();

        if (!template) {
            this.logger.info('No CloudFormation template found, skipping Pika processing');
            return;
        }

        // Check for new custom.pika configuration
        if (customPika && this.isNewPikaFormat(customPika)) {
            await this.processCustomPikaConfig(customPika);
            return;
        }
    }

    /**
     * Check if the pika config uses the new custom.pika format
     */
    private isNewPikaFormat(pikaConfig: any): boolean {
        return pikaConfig && (pikaConfig.agents || pikaConfig.chatApps || pikaConfig.tools);
    }

    /**
     * Process the new custom.pika configuration format
     */
    private async processCustomPikaConfig(pikaConfig: any): Promise<void> {
        this.logger.info('Processing custom.pika configuration');

        // Get all lambda functions that are referenced by tools
        const referencedFunctions = this.getReferencedLambdaFunctions(pikaConfig);

        // Add tags and permissions to referenced functions
        for (const functionName of referencedFunctions) {
            try {
                this.addLambdaTags(functionName);
                this.addLambdaPermissions(functionName);
                this.logger.info(`Added Pika tags and permissions to function: ${functionName}`);
            } catch (error) {
                throw new Error(`Error processing function ${functionName}: ${error}`);
            }
        }

        this.logger.info(`Processed ${referencedFunctions.size} lambda function(s) for Pika tools`);
    }

    /**
     * Get all lambda function names referenced by tools in the pika configuration
     */
    private getReferencedLambdaFunctions(pikaConfig: any): Set<string> {
        const referencedFunctions = new Set<string>();

        // Check agents and their tools
        if (pikaConfig.agents) {
            for (const agentDef of pikaConfig.agents) {
                if (agentDef.tools) {
                    for (const tool of agentDef.tools) {
                        if (tool.lambdaFunctionLogicalId) {
                            referencedFunctions.add(tool.lambdaFunctionLogicalId);
                        }
                    }
                }
            }
        }

        // Check standalone tools
        if (pikaConfig.tools) {
            for (const tool of pikaConfig.tools) {
                if (tool.lambdaFunctionLogicalId) {
                    referencedFunctions.add(tool.lambdaFunctionLogicalId);
                }
            }
        }

        return referencedFunctions;
    }

    /**
     * Add Pika-specific resources to CloudFormation template
     */
    private async addPikaResources(): Promise<void> {
        const customPika = this.getCustomPikaConfig();
        await this.addCustomPikaResources(customPika);
    }

    /**
     * Add custom resources for new custom.pika format
     */
    private async addCustomPikaResources(pikaConfig: any): Promise<void> {
        // Process agents
        if (pikaConfig.agents) {
            for (const agentDef of pikaConfig.agents) {
                if (pikaConfig.agentCustomResourceArn) {
                    this.addAgentCustomResourceFromCustomConfig(agentDef, pikaConfig.agentCustomResourceArn);
                }
            }
        }

        // Process chat apps
        if (pikaConfig.chatApps) {
            for (const chatAppDef of pikaConfig.chatApps) {
                if (pikaConfig.chatAppCustomResourceArn) {
                    this.addChatAppCustomResourceFromCustomConfig(chatAppDef, pikaConfig.chatAppCustomResourceArn);
                }
            }
        }
    }

    /**
     * Add agent-tool tag to Lambda function (matching CDK: cdk.Tags.of(weatherLambda).add('agent-tool', 'true'))
     */
    private addLambdaTags(functionName: string): void {
        const template = this.serverless.service.provider.compiledCloudFormationTemplate;
        const awsProvider = this.serverless.getProvider('aws') as AwsProvider;
        const lambdaLogicalId = awsProvider.naming.getLambdaLogicalId(functionName);

        const lambdaResource = template.Resources[lambdaLogicalId];
        if (lambdaResource) {
            if (!lambdaResource.Properties.Tags) {
                lambdaResource.Properties.Tags = [];
            }

            // Add the agent-tool tag exactly as in CDK
            lambdaResource.Properties.Tags.push({
                Key: 'agent-tool',
                Value: 'true'
            });
        }
    }

    /**
     * Add IAM permissions for Bedrock to invoke the Lambda function
     * (matching CDK: weatherLambda.addPermission('allowAgentInvokeFn', {...}))
     */
    private addLambdaPermissions(functionName: string): void {
        const template = this.serverless.service.provider.compiledCloudFormationTemplate;
        const awsProvider = this.serverless.getProvider('aws') as AwsProvider;
        const lambdaLogicalId = awsProvider.naming.getLambdaLogicalId(functionName);
        const permissionLogicalId = `${lambdaLogicalId}BedrockInvokePermission`;

        const permission: CloudFormationResource = {
            Type: 'AWS::Lambda::Permission',
            Properties: {
                FunctionName: {
                    Ref: lambdaLogicalId
                },
                Action: 'lambda:InvokeFunction',
                Principal: 'bedrock.amazonaws.com'
            }
        };

        template.Resources[permissionLogicalId] = permission;
    }

    /**
     * Add custom resource for agent creation (matching CDK implementation)
     */
    private addAgentCustomResource(functionName: string, agentData: AgentDataRequest, customResourceArn: string): void {
        const template = this.serverless.service.provider.compiledCloudFormationTemplate;
        const awsProvider = this.serverless.getProvider('aws') as AwsProvider;
        const lambdaLogicalId = awsProvider.naming.getLambdaLogicalId(functionName);
        const resourceLogicalId = generateLogicalId(functionName, 'Agent');

        // Prepare agent data with lambda ARN reference
        const processedAgentData = prepareAgentData(agentData, functionName, lambdaLogicalId);

        // Compress and encode the agent data (matching CDK: gzipAndBase64EncodeString)
        const agentDataCompressed = gzipAndBase64EncodeString(JSON.stringify(processedAgentData));

        const customResource: CloudFormationResource = {
            Type: 'AWS::CloudFormation::CustomResource',
            Properties: {
                ServiceToken: resolveCustomResourceArn(customResourceArn),
                Stage: this.serverless.service.provider.stage,
                AgentData: agentDataCompressed,
                ToolIdToLambdaArnMap: buildToolIdToLambdaArnMap(agentData, lambdaLogicalId),
                Timestamp: generateTimestamp() // Ensures custom resource runs on every deploy
            },
            DependsOn: [lambdaLogicalId]
        };

        template.Resources[resourceLogicalId] = customResource;
    }

    /**
     * Add custom resource for chat app creation (matching CDK implementation)
     */
    private addChatAppCustomResource(functionName: string, chatAppData: ChatAppDataRequest, customResourceArn: string): void {
        const template = this.serverless.service.provider.compiledCloudFormationTemplate;
        const resourceLogicalId = generateLogicalId(functionName, 'ChatApp');

        // Compress and encode the chat app data (matching CDK approach)
        const chatAppDataCompressed = gzipAndBase64EncodeString(JSON.stringify(chatAppData));

        const customResource: CloudFormationResource = {
            Type: 'AWS::CloudFormation::CustomResource',
            Properties: {
                ServiceToken: resolveCustomResourceArn(customResourceArn),
                Stage: this.serverless.service.provider.stage,
                ChatAppData: chatAppDataCompressed,
                Timestamp: generateTimestamp() // Ensures custom resource runs on every deploy
            }
        };

        template.Resources[resourceLogicalId] = customResource;
    }

    /**
     * Add agent custom resource from custom.pika configuration
     */
    private addAgentCustomResourceFromCustomConfig(agentDef: AgentDefinitionWithToolRefs, customResourceArn: string): void {
        const template = this.serverless.service.provider.compiledCloudFormationTemplate;
        const resourceLogicalId = generateLogicalId(agentDef.agent.agentId, 'Agent');

        // Prepare agent data with lambda ARN references from custom config
        const processedAgentData = prepareAgentDataFromCustomConfig(agentDef);

        // Compress and encode the agent data (matching CDK: gzipAndBase64EncodeString)
        const agentDataCompressed = gzipAndBase64EncodeString(JSON.stringify(processedAgentData));

        const customResource: CloudFormationResource = {
            Type: 'AWS::CloudFormation::CustomResource',
            Properties: {
                ServiceToken: resolveCustomResourceArn(customResourceArn),
                Stage: this.serverless.service.provider.stage,
                AgentData: agentDataCompressed,
                ToolIdToLambdaArnMap: buildToolIdToLambdaArnMapFromCustomConfig(agentDef, this.serverless),
                Timestamp: generateTimestamp() // Ensures custom resource runs on every deploy
            }
        };

        template.Resources[resourceLogicalId] = customResource;
    }

    /**
     * Add chat app custom resource from custom.pika configuration
     */
    private addChatAppCustomResourceFromCustomConfig(chatAppDef: ChatAppDataRequest, customResourceArn: string): void {
        const template = this.serverless.service.provider.compiledCloudFormationTemplate;
        const resourceLogicalId = generateLogicalId(chatAppDef.chatApp.chatAppId, 'ChatApp');

        // Compress and encode the chat app data (matching CDK approach)
        const chatAppDataCompressed = gzipAndBase64EncodeString(JSON.stringify(chatAppDef));

        const customResource: CloudFormationResource = {
            Type: 'AWS::CloudFormation::CustomResource',
            Properties: {
                ServiceToken: resolveCustomResourceArn(customResourceArn),
                Stage: this.serverless.service.provider.stage,
                ChatAppData: chatAppDataCompressed,
                Timestamp: generateTimestamp() // Ensures custom resource runs on every deploy
            }
        };

        template.Resources[resourceLogicalId] = customResource;
    }

    /**
     * Get Lambda function logical ID
     */
    private getLambdaLogicalId(functionName: string): string {
        const awsProvider = this.serverless.getProvider('aws') as AwsProvider;
        return awsProvider.naming.getLambdaLogicalId(functionName);
    }

    /**
     * Add resource to CloudFormation template
     */
    private addResource(name: string, resource: any): void {
        if (!this.serverless.service.resources) {
            this.serverless.service.resources = {};
        }
        if (!this.serverless.service.resources.Resources) {
            this.serverless.service.resources.Resources = {};
        }
        this.serverless.service.resources.Resources[name] = resource;
    }
}

module.exports = PikaServerlessPlugin;
