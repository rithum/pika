import type {
    AgentDataRequest,
    ChatAppForIdempotentCreateOrUpdate,
    SemanticDirectiveForCreateOrUpdate,
    TagDefinitionForCreateOrUpdate,
    TagDefinitionWidgetWebComponentForCreateOrUpdate
} from 'pika-shared/types/chatbot/chatbot-types';

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { gzipAndBase64EncodeString } from 'pika-shared/util/server-utils';
import { gzipSync } from 'zlib';
import { weatherFunctions } from '../../src/lambda/weather/weather-functions';
import { weatherAgentInstruction } from '../../src/lambda/weather/weather-instructions';
import { weatherSuggestions } from '../../src/lambda/weather/weather-suggestions';
import { weatherTagDefinitions } from './tag-definitions';

// ES modules don't have __dirname, so we create it from import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

        const pikaBucketNameParam = ssm.StringParameter.fromStringParameterName(
            this,
            'PikaBucketNameParam',
            `/stack/${props.pikaServiceProjNameKebabCase}/${this.stage}/s3/pika_bucket_name`
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

        // Allow bedrock agents to invoke the weather lambda (the action the agent will take)
        weatherLambda.addPermission('allowAgentInvokeFn', {
            action: 'lambda:invokeFunction',
            principal: new iam.ServicePrincipal('bedrock.amazonaws.com')
        });

        // Helper function to gzip and hash web component file
        function gzipAndHashFile(filePath: string): { gzipped: Buffer; hash: string; size: number } {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const gzipped = gzipSync(fileContent);
            const hash = createHash('sha256').update(gzipped).digest('base64');
            return { gzipped, hash, size: gzipped.length };
        }

        // Process web components: read from build/, gzip, write to dist/
        const buildDir = path.join(__dirname, '../../build');
        const distDir = path.join(__dirname, '../../dist');

        // Ensure dist directory exists and is clean
        if (fs.existsSync(distDir)) {
            fs.rmSync(distDir, { recursive: true, force: true });
        }
        fs.mkdirSync(distDir, { recursive: true });

        // Process all .js files from build/ to dist/
        const buildFiles = fs.readdirSync(buildDir);
        const jsFiles = buildFiles.filter((f) => f.endsWith('.js'));

        let webcomponentMeta: { gzipped: Buffer; hash: string; size: number } | undefined;

        jsFiles.forEach((file) => {
            const sourcePath = path.join(buildDir, file);
            const meta = gzipAndHashFile(sourcePath);

            // Save metadata for weather.js (used in tag definitions)
            if (file === 'weather.js') {
                webcomponentMeta = meta;
            }

            // Write gzipped file to dist/
            const gzippedFileName = `${file}.gz`;
            const gzippedFilePath = path.join(distDir, gzippedFileName);
            fs.writeFileSync(gzippedFilePath, meta.gzipped);
        });

        if (!webcomponentMeta) {
            throw new Error('weather.js not found in build directory');
        }

        // Deploy entire dist/ directory to S3
        new BucketDeployment(this, 'WeatherWebComponentDeployment', {
            sources: [Source.asset(distDir)],
            destinationBucket: s3.Bucket.fromBucketName(this, 'PikaBucket', pikaBucketNameParam.stringValue),
            destinationKeyPrefix: 'wc/weather/',
            contentType: 'application/javascript',
            contentEncoding: 'gzip',
            prune: false
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
                modesSupported: ['standalone', 'embedded'],
                dontCacheThis: true,
                title: 'Weather Chat',
                description: 'A chat app that can be used to answer questions about the weather, used for testing the framework.',
                userTypes: ['internal-user'],
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
                    },
                    agentInstructionAssistance: {
                        featureId: 'agentInstructionAssistance',
                        enabled: true
                    },
                    tags: {
                        featureId: 'tags',
                        enabled: true,
                        tagsEnabled: [
                            { scope: 'weather', tag: 'favorite-cities' },
                            { scope: 'weather', tag: 'weather-alerts' },
                            { scope: 'weather', tag: 'temperature-trend' },
                            { scope: 'weather', tag: 'full-forecast' },
                            { scope: 'weather', tag: 'city-selector' },
                            { scope: 'weather', tag: 'inline' },
                            { scope: 'weather', tag: 'weather-comparison' },
                            { scope: 'weather', tag: 'weather-fun-fact' },
                            { scope: 'weather', tag: 'quick-weather-search' }
                        ]
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

        // Get the semantic directive custom resource ARN
        const semanticDirectiveCustomResourceArn = ssm.StringParameter.valueForStringParameter(
            this,
            `/stack/${props.pikaServiceProjNameKebabCase}/${this.stage}/lambda/semantic_directive_custom_resource_arn`
        );

        // Create semantic directives for the weather chat app
        const semanticDirectiveData: { userId: string; groupId: string; semanticDirectives: SemanticDirectiveForCreateOrUpdate[] } = {
            userId: `cloudformation/${this.stackName}`,
            groupId: `${this.stackName}#WeatherSemanticDirectives`,
            semanticDirectives: [
                {
                    scopeType: 'chatapp',
                    scopeValue: 'weather',
                    id: 'temperature-format',
                    description: 'Guidelines for temperature reporting format',
                    instructions: 'Always include both Celsius and Fahrenheit when reporting temperatures. Format as "XX°C (XX°F)" for better user experience.',
                    createdBy: `cloudformation/${this.stackName}`,
                    lastUpdatedBy: `cloudformation/${this.stackName}`
                },
                {
                    scopeType: 'chatapp',
                    scopeValue: 'weather',
                    id: 'location-clarity',
                    description: 'Location specification requirements',
                    instructions:
                        'When a user asks about weather without specifying a location, politely ask them to provide a specific city or region. Avoid making assumptions about their location.',
                    createdBy: `cloudformation/${this.stackName}`,
                    lastUpdatedBy: `cloudformation/${this.stackName}`
                },
                {
                    scopeType: 'chatapp',
                    scopeValue: 'weather',
                    id: 'severe-weather-alerts',
                    description: 'Handling of severe weather conditions',
                    instructions:
                        'When reporting severe weather conditions (storms, hurricanes, extreme temperatures), always emphasize safety precautions and recommend checking local authorities for emergency guidance.',
                    createdBy: `cloudformation/${this.stackName}`,
                    lastUpdatedBy: `cloudformation/${this.stackName}`
                }
            ]
        };

        // Compress and encode the semantic directive data
        const semanticDirectiveDataCompressed = gzipAndBase64EncodeString(JSON.stringify(semanticDirectiveData));

        new cdk.CustomResource(this, `${props.projNameTitleCase}SemanticDirectiveCustomResource`, {
            serviceToken: semanticDirectiveCustomResourceArn,
            properties: {
                Stage: this.stage,
                SemanticDirectiveData: semanticDirectiveDataCompressed,
                // This makes sure that the custom resource is called every time the stack is deployed since it changes each time
                Timestamp: String(Date.now())
            }
        });

        // Get the tag definition custom resource ARN
        const tagDefCustomResourceArn = ssm.StringParameter.valueForStringParameter(
            this,
            `/stack/${props.pikaServiceProjNameKebabCase}/${this.stage}/lambda/tag_definition_custom_resource_arn`
        );

        // Register tag definitions via custom resources
        weatherTagDefinitions.forEach((tagDef: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate>, index: number) => {
            // Create a copy to avoid mutating the original
            const tagDefCopy = JSON.parse(JSON.stringify(tagDef));

            // Populate s3Bucket and file metadata
            if (tagDefCopy.widget.type === 'web-component' && tagDefCopy.widget.webComponent?.s3) {
                tagDefCopy.widget.webComponent.encodedSizeBytes = webcomponentMeta!.size;
                tagDefCopy.widget.webComponent.encodedSha256Base64 = webcomponentMeta!.hash;
            }

            // Gzip and encode just the tag definition (not wrapped in userId/tagDefinition object)
            const tagDefData = gzipAndBase64EncodeString(JSON.stringify(tagDefCopy));

            new cdk.CustomResource(this, `WeatherTagDef${index}`, {
                serviceToken: tagDefCustomResourceArn,
                properties: {
                    Stage: this.stage,
                    TagDefData: tagDefData,
                    Timestamp: String(Date.now())
                }
            });
        });

        // Make sure the chat app is created after the agent
        chatAppCustomResource.node.addDependency(customResource);
    }
}
