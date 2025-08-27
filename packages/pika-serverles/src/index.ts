import Serverless from 'serverless';
import Plugin from 'serverless/classes/Plugin';
import { AgentDataRequest } from 'pika-shared/types/chatbot/chatbot-types';
import { PikaServerlessConfig, PikaLambdaConfig, ChatAppForIdempotentCreateOrUpdate } from './types';
import { gzipAndBase64EncodeString, generateResourceName } from './utils';

interface ServerlessWithCustom extends Serverless {
    service: Serverless['service'] & {
        custom?: {
            pika?: PikaServerlessConfig;
        };
        functions?: Record<string, any>;
        resources?: {
            Resources?: Record<string, any>;
        };
    };
}

class PikaServerlessPlugin implements Plugin {
    hooks: Record<string, () => void | Promise<void>>;
    serverless: ServerlessWithCustom;
    options: any;

    constructor(serverless: ServerlessWithCustom, options: any) {
        this.serverless = serverless;
        this.options = options;

        this.hooks = {
            'before:aws:package:finalize': this.processConfiguration.bind(this)
        };
    }

    private async processConfiguration(): Promise<void> {
        this.serverless.cli?.log('Processing Pika configuration...');

        const pikaConfig = this.serverless.service.custom?.pika;
        if (!pikaConfig) {
            this.serverless.cli?.log('No Pika configuration found in custom.pika');
            return;
        }

        const functions = this.serverless.service.functions || {};

        // Process each function that has Pika configuration
        for (const [functionName, functionConfig] of Object.entries(functions)) {
            await this.processFunctionPikaConfig(functionName, functionConfig, pikaConfig);
        }
    }

    private async processFunctionPikaConfig(functionName: string, functionConfig: any, pikaConfig: PikaServerlessConfig): Promise<void> {
        const pikaLambdaConfig: PikaLambdaConfig | undefined = functionConfig.pika;

        if (!pikaLambdaConfig) {
            return; // No Pika config for this function
        }

        const stage = this.options.stage || 'dev';

        // Generate function ARN reference for CloudFormation
        const functionLogicalId = this.getFunctionLogicalId(functionName);
        const functionArnRef = { 'Fn::GetAtt': [functionLogicalId, 'Arn'] };

        // Process agent configuration
        if (pikaLambdaConfig.pikaAgent) {
            await this.createAgentResources(functionName, pikaLambdaConfig.pikaAgent, pikaConfig, stage, functionArnRef);
        }

        // Process chat app configuration
        if (pikaLambdaConfig.pikaChatApp) {
            await this.createChatAppResources(functionName, pikaLambdaConfig.pikaChatApp, pikaConfig, stage);
        }

        // Add Bedrock permissions to the lambda
        this.addBedrockPermissions(functionName, functionLogicalId);
    }

    private async createAgentResources(functionName: string, agentConfig: any, pikaConfig: PikaServerlessConfig, stage: string, functionArnRef: any): Promise<void> {
        const stackName = this.serverless.service.service;

        // Build agent data similar to CDK implementation
        const agentData: AgentDataRequest = {
            userId: `cloudformation/${stackName}-${stage}`,
            agent: {
                agentId: agentConfig.agentId || `${pikaConfig.projNameKebabCase}-agent-${stage}`,
                basePrompt: agentConfig.basePrompt
            },
            tools: (agentConfig.tools || []).map((tool: any) => ({
                toolId: tool.toolId || `${pikaConfig.projNameKebabCase}-tool-${stage}`,
                name: tool.name || `${pikaConfig.projNameKebabCase}-tool`,
                displayName: tool.displayName || `${pikaConfig.projNameTitleCase} Tool`,
                description: tool.description || `A tool that can be used by the ${pikaConfig.projNameHuman} agent`,
                executionType: 'lambda' as const,
                lambdaArn: 'WILL_BE_REPLACED_BY_CUSTOM_RESOURCE_LAMBDA_WHEN_DEPLOYED',
                functionSchema: tool.functionSchema || [],
                supportedAgentFrameworks: ['bedrock'] as const
            }))
        };

        // Compress and encode the agent data
        const agentDataCompressed = gzipAndBase64EncodeString(JSON.stringify(agentData));

        // Create custom resource for agent
        const agentResourceName = generateResourceName(pikaConfig.projNameTitleCase, 'AgentCustomResource');

        const agentCustomResource = {
            Type: 'AWS::CloudFormation::CustomResource',
            Properties: {
                ServiceToken: {
                    'Fn::Sub': `/stack/${pikaConfig.pikaServiceProjNameKebabCase}/\${opt:stage, '${stage}'}/lambda/agent_custom_resource_arn`
                },
                Stage: stage,
                AgentData: agentDataCompressed,
                ToolIdToLambdaArnMap: (agentData.tools || []).reduce((map: Record<string, any>, tool) => {
                    map[tool.toolId] = functionArnRef;
                    return map;
                }, {}),
                Timestamp: String(Date.now())
            },
            DependsOn: [this.getFunctionLogicalId(functionName)]
        };

        this.addResource(agentResourceName, agentCustomResource);
    }

    private async createChatAppResources(functionName: string, chatAppConfig: any, pikaConfig: PikaServerlessConfig, stage: string): Promise<void> {
        const stackName = this.serverless.service.service;

        // Build chat app data similar to CDK implementation
        const chatAppData: { userId: string; chatApp: ChatAppForIdempotentCreateOrUpdate } = {
            userId: `cloudformation/${stackName}-${stage}`,
            chatApp: {
                chatAppId: chatAppConfig.chatAppId,
                modesSupported: chatAppConfig.modesSupported || ['standalone', 'embedded'],
                dontCacheThis: chatAppConfig.dontCacheThis,
                title: chatAppConfig.title,
                description: chatAppConfig.description,
                userTypes: chatAppConfig.userTypes || ['internal-user'],
                agentId: chatAppConfig.agentId || `${pikaConfig.projNameKebabCase}-agent-${stage}`,
                features: chatAppConfig.features || {},
                enabled: chatAppConfig.enabled
            }
        };

        // Compress and encode the chat app data
        const chatAppDataCompressed = gzipAndBase64EncodeString(JSON.stringify(chatAppData));

        // Create custom resource for chat app
        const chatAppResourceName = generateResourceName(pikaConfig.projNameTitleCase, 'ChatAppCustomResource');

        const chatAppCustomResource = {
            Type: 'AWS::CloudFormation::CustomResource',
            Properties: {
                ServiceToken: {
                    'Fn::Sub': `/stack/${pikaConfig.pikaServiceProjNameKebabCase}/\${opt:stage, '${stage}'}/lambda/chat_app_custom_resource_arn`
                },
                Stage: stage,
                ChatAppData: chatAppDataCompressed,
                Timestamp: String(Date.now())
            }
        };

        this.addResource(chatAppResourceName, chatAppCustomResource);
    }

    private addBedrockPermissions(functionName: string, functionLogicalId: string): void {
        const permissionResourceName = generateResourceName(functionName, 'BedrockInvokePermission');

        const bedrockPermission = {
            Type: 'AWS::Lambda::Permission',
            Properties: {
                FunctionName: { Ref: functionLogicalId },
                Action: 'lambda:InvokeFunction',
                Principal: 'bedrock.amazonaws.com'
            }
        };

        this.addResource(permissionResourceName, bedrockPermission);
    }

    private getFunctionLogicalId(functionName: string): string {
        // Serverless Framework generates function logical IDs by capitalizing and removing special characters
        return functionName.replace(/[^a-zA-Z0-9]/g, '').replace(/^\w/, (c) => c.toUpperCase()) + 'LambdaFunction';
    }

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
