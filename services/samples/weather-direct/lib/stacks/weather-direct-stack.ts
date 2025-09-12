import type { AgentDataRequest } from 'pika-shared/types/chatbot/chatbot-types';

import { gzipAndBase64EncodeString } from 'pika-shared/util/server-utils';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';
import { weatherFunctions } from '../../src/lambda/weather/weather-functions';
import { weatherAgentInstruction } from '../../src/lambda/weather/weather-instructions';

export interface WeatherDirectStackProps extends cdk.StackProps {
    stage: string;
    /**
     * This is the name of the deployed pika service without the stage name.  It is needed because we import
     * some pika service stack parameters in this stack.  Specifically, we need the upload bucket name
     * so we can get files that were uploaded to the pika service by the chat converse lambda function.
     *
     * We also need the agent custom resource ARN so we can create the weather agent and tool.
     * NOTE: We do NOT create a chat app in this direct invocation example.
     */
    pikaServiceProjNameKebabCase: string;
    projNameL: string; // All lowercase e.g. weather-direct
    projNameKebabCase: string; // Kebab case e.g. weather-direct
    projNameTitleCase: string; // Title case e.g. WeatherDirect
    projNameCamel: string; // Camel case e.g. weatherDirect
    projNameHuman: string; // Human readable e.g. Weather Direct
}

export class WeatherDirectStack extends cdk.Stack {
    private stage: string;

    constructor(scope: Construct, id: string, props: WeatherDirectStackProps) {
        super(scope, id, props);

        this.stage = props.stage;

        const pikaBucketNameParam = ssm.StringParameter.fromStringParameterName(
            this,
            'PikaBucketNameParam',
            `/stack/${props.pikaServiceProjNameKebabCase}/${this.stage}/s3/pika_bucket_name`
        );

        const lambdaRole = new iam.Role(this, `${props.projNameTitleCase}LambdaRole`, {
            roleName: `${this.stackName}-weather-direct-lambda-role`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                WeatherDirectLambdaUnifiedPolicy: new iam.PolicyDocument({
                    statements: [
                        // Basic Lambda execution permissions (CloudWatch Logs)
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),

                        // Permissions for SSM GetParameter
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['ssm:GetParameter', 'ssm:GetParameters'],
                            resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/*`]
                        }),

                        // Permissions for S3
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:GetObject', 's3:ListBucket', 's3:PutObject', 's3:DeleteObject', 's3:PutObjectTagging'],
                            resources: [`arn:aws:s3:::${pikaBucketNameParam.stringValue}`, `arn:aws:s3:::${pikaBucketNameParam.stringValue}/*`]
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
                PIKA_S3_BUCKET: pikaBucketNameParam.stringValue,
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

        // Allow bedrock agents to invoke the weather lambda
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
                basePrompt: `${weatherAgentInstruction}

IMPORTANT: This agent is designed for direct invocation without a chat app interface. 
You are being invoked directly via API and should provide concise, informative responses.`
            },
            tools: [
                {
                    toolId: `${props.projNameKebabCase}-tool-${this.stage}`,
                    name: `${props.projNameKebabCase}-tool`,
                    displayName: `${props.projNameTitleCase} Tool`,
                    description: `A tool that can be used to answer questions about the weather for direct agent invocation`,
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
                    [`${props.projNameKebabCase}-tool-${this.stage}`]: cdk.Lazy.string({
                        produce: () => weatherLambda.functionArn
                    })
                },
                Timestamp: String(Date.now())
            }
        });

        customResource.node.addDependency(weatherLambda);

        // Output the agent ID for use with the CLI
        new cdk.CfnOutput(this, 'AgentId', {
            value: `${props.projNameKebabCase}-agent-${this.stage}`,
            description: 'Agent ID for direct invocation',
            exportName: `${this.stackName}-AgentId`
        });

        // Output the converse function URL from SSM for convenience
        const converseFunctionUrl = ssm.StringParameter.valueForStringParameter(this, `/stack/${props.pikaServiceProjNameKebabCase}/${this.stage}/function/converse_url`);

        new cdk.CfnOutput(this, 'ConverseFunctionUrl', {
            value: converseFunctionUrl,
            description: 'Converse Function URL for direct invocation',
            exportName: `${this.stackName}-ConverseFunctionUrl`
        });

        // Create SSM parameter for the agent ID to make CLI tool discovery easier
        new ssm.StringParameter(this, 'WeatherDirectAgentIdParam', {
            parameterName: `/stack/${props.projNameKebabCase}/${this.stage}/agent_id`,
            stringValue: `${props.projNameKebabCase}-agent-${this.stage}`,
            description: 'Agent ID for the weather direct agent'
        });
    }
}
