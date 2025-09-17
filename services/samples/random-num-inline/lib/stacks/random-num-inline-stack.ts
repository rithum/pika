import type { AgentDataRequest, ChatAppForIdempotentCreateOrUpdate, SemanticDirectiveForCreateOrUpdate } from 'pika-shared/types/chatbot/chatbot-types';

import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { gzipAndBase64EncodeString } from 'pika-shared/util/server-utils';
import { randomNumSuggestions } from 'src/random-num-inline/random-num-suggestions';
import { randomNumFunctions } from '../../src/random-num-inline/random-num-functions';
import { randomNumInlineAgentInstruction } from '../../src/random-num-inline/random-num-instructions';
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

export interface RandomNumInlineStackProps extends cdk.StackProps {
    stage: string;
    /**
     * This is the name of the deployed pika service without the stage name.  It is needed because we import
     * some pika service stack parameters in this stack.  Specifically, we need the upload bucket name
     * so we can get files that were uploaded to the pika service by the chat converse lambda function.
     *
     * We also need the agent/chatapp custom resource ARN so we can create the random num inline chatapp, agent and tool.
     */
    pikaServiceProjNameKebabCase: string;
    projNameL: string; // All lowercase e.g. random-num-inline
    projNameKebabCase: string; // Kebab case e.g. random-num-inline
    projNameTitleCase: string; // Title case e.g. RandomNumInline
    projNameCamel: string; // Camel case e.g. randomNumInline
    projNameHuman: string; // Human readable e.g. Random Num Inline
}

export class RandomNumInlineStack extends cdk.Stack {
    private stage: string;

    constructor(scope: Construct, id: string, props: RandomNumInlineStackProps) {
        super(scope, id, props);

        this.stage = props.stage;

        const customResourceArn = ssm.StringParameter.valueForStringParameter(this, `/stack/${props.pikaServiceProjNameKebabCase}/${this.stage}/lambda/agent_custom_resource_arn`);
        const randomNumInlineCode = this.transpileInlineCodeToJavascript('../../src/random-num-inline/inline-code.ts');

        // Create the random num inline agent with the random num inline tool
        const agentData: AgentDataRequest = {
            userId: `cloudformation/${this.stackName}`,
            agent: {
                agentId: `${props.projNameKebabCase}-agent-${this.stage}`,
                basePrompt: randomNumInlineAgentInstruction
            },
            tools: [
                {
                    toolId: `${props.projNameKebabCase}-tool-${this.stage}`,
                    executionType: 'inline',
                    name: `${props.projNameKebabCase}-tool`,
                    displayName: `${props.projNameTitleCase} Tool`,
                    code: randomNumInlineCode,
                    description: `A tool that can be used to generate random numbers`,
                    functionSchema: randomNumFunctions,
                    supportedAgentFrameworks: ['bedrock']
                }
            ]
        };

        // Compress and encode the agent data
        const agentDataCompressed = gzipAndBase64EncodeString(JSON.stringify(agentData));

        const agentResource = new cdk.CustomResource(this, `${props.projNameTitleCase}AgentCustomResource`, {
            serviceToken: customResourceArn,
            properties: {
                Stage: this.stage,
                AgentData: agentDataCompressed,
                // This makes sure that the custom resource is called every time the stack is deployed since it changes each time
                Timestamp: String(Date.now())
            }
        });

        // Get the chat app custom resource ARN
        const chatAppCustomResourceArn = ssm.StringParameter.valueForStringParameter(
            this,
            `/stack/${props.pikaServiceProjNameKebabCase}/${this.stage}/lambda/chat_app_custom_resource_arn`
        );

        // Create the random number chat app
        const chatAppData: { userId: string; chatApp: ChatAppForIdempotentCreateOrUpdate } = {
            userId: `cloudformation/${this.stackName}`,
            chatApp: {
                chatAppId: 'random-num',
                modesSupported: ['standalone', 'embedded'],
                dontCacheThis: true,
                title: 'Random Number Chat',
                description: 'A chat app that can be used to generate random numbers, used for testing the framework.',
                userTypes: ['internal-user'],
                agentId: `${props.projNameKebabCase}-agent-${this.stage}`,
                features: {
                    fileUpload: {
                        featureId: 'fileUpload',
                        enabled: false,
                        mimeTypesAllowed: []
                    },
                    promptInputFieldLabel: {
                        featureId: 'promptInputFieldLabel',
                        enabled: true,
                        promptInputFieldLabel: "Let's generate a random number!"
                    },
                    suggestions: {
                        featureId: 'suggestions',
                        enabled: true,
                        suggestions: randomNumSuggestions,
                        randomize: false,
                        maxToShow: 5
                    },
                    agentInstructionAssistance: {
                        featureId: 'agentInstructionAssistance',
                        enabled: true
                    },
                    userDataOverrides: {
                        featureId: 'userDataOverrides',
                        enabled: false
                    }
                },
                enabled: true
            }
        };

        // Compress and encode the chat app data
        const chatAppDataCompressed = gzipAndBase64EncodeString(JSON.stringify(chatAppData));

        const chatAppResource = new cdk.CustomResource(this, `${props.projNameTitleCase}ChatAppCustomResource`, {
            serviceToken: chatAppCustomResourceArn,
            properties: {
                Stage: this.stage,
                ChatAppData: chatAppDataCompressed,
                // This makes sure that the custom resource is called every time the stack is deployed since it changes each time
                Timestamp: String(Date.now())
            }
        });

        // Make sure the chat app is created after the agent
        chatAppResource.node.addDependency(agentResource);
    }

    private transpileInlineCodeToJavascript(filePath: string): string {
        // Resolve the file path relative to this stack file
        const absolutePath = path.resolve(__dirname, filePath);

        // Read the TypeScript file
        const tsCode = fs.readFileSync(absolutePath, 'utf8');

        // Use esbuild to transpile TypeScript to JavaScript synchronously
        const result = esbuild.transformSync(tsCode, {
            loader: 'ts',
            target: 'es2022',
            format: 'esm'
        });

        // The transpiled code will have imports at the top, but we only need the function
        // Since the function isn't exported and will be eval'd, we need to extract just the function
        const jsCode = result.code;

        if (!jsCode.trim()) {
            throw new Error(`No function found in ${filePath}`);
        }

        // If the code doesn't start with a function declaration, throw an error
        if (!jsCode.trim().startsWith('function ')) {
            throw new Error(`Code does not start with a function declaration in ${filePath}`);
        }

        return jsCode;
    }
}
