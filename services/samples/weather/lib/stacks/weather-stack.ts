import type { AgentDataRequest, ChatAppForIdempotentCreateOrUpdate } from '@pika/shared/types/chatbot/chatbot-types';
import { gzipAndBase64EncodeString } from '@pika/shared/util/server-utils';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';
import { weatherFunctions } from '../../src/lambda/weather/weather-functions';
import { weatherAgentInstruction } from '../../src/lambda/weather/weather-instructions';
import { weatherSuggestions } from '../../src/lambda/weather/weather-suggestions';

export interface WeatherStackProps extends cdk.StackProps {
    stage: string;
    /**
     * This is the name of the deployed pika service without the stage name.  It is needed because we import
     * some pika service stack parameters in this stack.  Specifically, we need the upload bucket name
     * so we can get files that were uploaded to the pika service by the chat converse lambda function.
     *
     * We also need the agent/chatapp custom resource ARN so we can create the weather chatapp, agent and tool.
     */
    pikaServiceProjNameKebabCase: string;
    projNameL: string; // All lowercase e.g. weather
    projNameKebabCase: string; // Kebab case e.g. weather
    projNameTitleCase: string; // Title case e.g. Weather
    projNameCamel: string; // Camel case e.g. weather
    projNameHuman: string; // Human readable e.g. Weather
}

export class WeatherStack extends cdk.Stack {
    private stage: string;

    constructor(scope: Construct, id: string, props: WeatherStackProps) {
        super(scope, id, props);

        this.stage = props.stage;

        const uploadBucketNameParam = ssm.StringParameter.fromStringParameterName(
            this,
            'UploadBucketNameParam',
            `/stack/${props.pikaServiceProjNameKebabCase}/${this.stage}/s3/upload_bucket_name`
        );

        const lambdaRole = new iam.Role(this, `${props.projNameTitleCase}LambdaRole`, {
            roleName: `${this.stackName}-weather-lambda-role`, // Using this.stackName from the Stack context
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                WeatherLambdaUnifiedPolicy: new iam.PolicyDocument({
                    statements: [
                        // Basic Lambda execution permissions (CloudWatch Logs)
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),

                        // Permissions for SSM GetParameter (if your ConverseFunction uses it)
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['ssm:GetParameter', 'ssm:GetParameters'],
                            // Scope down path if possible: e.g., `arn:aws:ssm:${this.region}:${this.account}:parameter/myapplication/config/*`
                            resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/*`]
                        }),

                        // Permissions for S3
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:GetObject', 's3:ListBucket', 's3:PutObject', 's3:DeleteObject', 's3:PutObjectTagging'],
                            resources: [`arn:aws:s3:::${uploadBucketNameParam.stringValue}`, `arn:aws:s3:::${uploadBucketNameParam.stringValue}/*`]
                        })
                    ]
                })
            }
        });

        // This is the action the agent will take when it needs to get the weather
        const weatherLambda = new nodejs.NodejsFunction(this, `${props.projNameTitleCase}ToolLambda`, {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: path.join(__dirname, '../../src/lambda/weather/index.ts'),
            handler: 'handler',
            timeout: cdk.Duration.seconds(30),
            role: lambdaRole,
            memorySize: 256,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                STAGE: this.stage,
                UPLOAD_S3_BUCKET: uploadBucketNameParam.stringValue,
                REGION: this.region
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        cdk.Tags.of(weatherLambda).add('agent-tool', 'true');

        // Allow bedrock agents to invoke the weather lambda (the action the agent will take)
        weatherLambda.addPermission('allowAgentInvokeFn', {
            action: 'lambda:invokeFunction',
            principal: new iam.ServicePrincipal('bedrock.amazonaws.com')
        });

        const customResourceArn = ssm.StringParameter.valueForStringParameter(this, `/stack/${props.pikaServiceProjNameKebabCase}/${this.stage}/lambda/agent_custom_resource_arn`);

        // Create the weather agent with the weather tool
        const agentData: AgentDataRequest = {
            userId: `cloudformation/${this.stackName}`,
            agent: {
                agentId: `${props.projNameKebabCase}-agent-${this.stage}`,
                basePrompt: weatherAgentInstruction
            },
            tools: [
                {
                    toolId: `${props.projNameKebabCase}-tool-${this.stage}`,
                    name: `${props.projNameKebabCase}-tool`,
                    displayName: `${props.projNameTitleCase} Tool`,
                    description: `A tool that can be used to answer questions about the weather`,
                    executionType: 'lambda',
                    lambdaArn: 'WILL_BE_REPLACED_BY_CUSTOM_RESOURCE_LAMBDA_WHEN_DEPLOYED',
                    functionSchema: weatherFunctions,
                    supportedAgentFrameworks: ['bedrock']
                }
            ]
        };

        // Compress and encode the agent data
        const agentDataCompressed = gzipAndBase64EncodeString(JSON.stringify(agentData));

        const customResource = new cdk.CustomResource(this, `${props.projNameTitleCase}AgentCustomResource`, {
            serviceToken: customResourceArn,
            properties: {
                Stage: this.stage,
                AgentData: agentDataCompressed,
                ToolIdToLambdaArnMap: {
                    // This lazy thing causes the actual value to be resolved at deployment time
                    // so it doesn't put ${Token[TOKEN.31]} in for the value
                    [`${props.projNameKebabCase}-tool-${this.stage}`]: cdk.Lazy.string({
                        produce: () => weatherLambda.functionArn
                    })
                },
                // This makes sure that the custom resource is called every time the stack is deployed since it changes each time
                Timestamp: String(Date.now())
            }
        });

        customResource.node.addDependency(weatherLambda);

        // Get the chat app custom resource ARN
        const chatAppCustomResourceArn = ssm.StringParameter.valueForStringParameter(
            this,
            `/stack/${props.pikaServiceProjNameKebabCase}/${this.stage}/lambda/chat_app_custom_resource_arn`
        );

        // Create the weather chat app
        const chatAppData: { userId: string; chatApp: ChatAppForIdempotentCreateOrUpdate } = {
            userId: `cloudformation/${this.stackName}`,
            chatApp: {
                chatAppId: 'weather',
                mode: 'fullpage',
                dontCacheThis: true,
                title: 'Weather Chat',
                agentId: `${props.projNameKebabCase}-agent-${this.stage}`,
                features: {
                    fileUpload: {
                        featureId: 'fileUpload',
                        enabled: true,
                        mimeTypesAllowed: ['text/csv']
                    },
                    promptInputFieldLabel: {
                        featureId: 'promptInputFieldLabel',
                        enabled: true,
                        promptInputFieldLabel: 'Ready to chat'
                    },
                    suggestions: {
                        featureId: 'suggestions',
                        enabled: true,
                        suggestions: weatherSuggestions,
                        randomize: true,
                        maxToShow: 5
                    }
                },
                enabled: true
            }
        };

        // Compress and encode the chat app data
        const chatAppDataCompressed = gzipAndBase64EncodeString(JSON.stringify(chatAppData));

        const chatAppCustomResource = new cdk.CustomResource(this, `${props.projNameTitleCase}ChatAppCustomResource`, {
            serviceToken: chatAppCustomResourceArn,
            properties: {
                Stage: this.stage,
                ChatAppData: chatAppDataCompressed,
                // This makes sure that the custom resource is called every time the stack is deployed since it changes each time
                Timestamp: String(Date.now())
            }
        });

        // Make sure the chat app is created after the agent
        chatAppCustomResource.node.addDependency(customResource);
    }
}
