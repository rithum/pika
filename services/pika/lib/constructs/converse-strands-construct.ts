import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';
import { PikaConstructOutputs } from './pika-construct.js';

export interface ConverseStrandsConstructProps {
    projNameKebabCase: string;
    stage: string;
    pikaOutputs: PikaConstructOutputs;
}

/**
 * Optional Python (Strands) converse Lambda — drop-in alternative to the TypeScript
 * converse Lambda. Opt in by instantiating this construct from CustomStackDefs
 * (or wire it up unconditionally in your own framework fork).
 *
 * When enabled, routes the chat app to this Lambda by changing
 * `/stack/<proj>/<stage>/function/converse_url` → `/stack/<proj>/<stage>/function/converse_strands_url`
 * in `apps/pika-chat/infra/lib/stacks/pika-chat-construct.ts`.
 *
 * Requires Docker/buildx with QEMU when bundling on x86_64 CI runners, because
 * the Python Lambda is deployed on Graviton (arm64) and pip needs to resolve
 * `manylinux_aarch64` wheels that match the runtime architecture.
 */
export class ConverseStrandsConstruct extends Construct {
    public readonly lambdaFunction: lambda.Function;
    public readonly functionUrl: lambda.FunctionUrl;

    constructor(scope: Construct, id: string, props: ConverseStrandsConstructProps) {
        super(scope, id);

        const { projNameKebabCase, stage, pikaOutputs } = props;
        const region = cdk.Stack.of(this).region;
        const account = cdk.Stack.of(this).account;

        const role = new iam.Role(this, 'Role', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')]
        });

        role.addToPolicy(
            new iam.PolicyStatement({
                actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
                resources: ['arn:aws:bedrock:*::foundation-model/*', 'arn:aws:bedrock:*:*:inference-profile/*']
            })
        );

        role.addToPolicy(
            new iam.PolicyStatement({
                actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:UpdateItem'],
                resources: [
                    pikaOutputs.chatMessagesTable.tableArn,
                    pikaOutputs.chatSessionTable.tableArn,
                    pikaOutputs.chatUserTable.tableArn
                ]
            })
        );

        role.addToPolicy(
            new iam.PolicyStatement({
                actions: ['dynamodb:GetItem', 'dynamodb:BatchGetItem', 'dynamodb:Query'],
                resources: [
                    pikaOutputs.agentDefinitionsTable.tableArn,
                    pikaOutputs.toolDefinitionsTable.tableArn,
                    pikaOutputs.tagDefinitionsTable.tableArn,
                    pikaOutputs.semanticDirectiveTable.tableArn,
                    `${pikaOutputs.tagDefinitionsTable.tableArn}/index/*`,
                    `${pikaOutputs.semanticDirectiveTable.tableArn}/index/*`
                ]
            })
        );

        role.addToPolicy(
            new iam.PolicyStatement({
                actions: ['ssm:GetParameter', 'ssm:GetParametersByPath'],
                resources: [`arn:aws:ssm:${region}:${account}:parameter/stack/${projNameKebabCase}/*`]
            })
        );

        role.addToPolicy(
            new iam.PolicyStatement({
                actions: ['lambda:InvokeFunction'],
                resources: [`arn:aws:lambda:${region}:${account}:function:*`],
                conditions: { StringEquals: { 'aws:ResourceTag/agent-tool': 'true' } }
            })
        );

        role.addToPolicy(
            new iam.PolicyStatement({
                actions: ['bedrock:Retrieve', 'bedrock:RetrieveAndGenerate'],
                resources: [`arn:aws:bedrock:${region}:${account}:knowledge-base/*`]
            })
        );

        role.addToPolicy(
            new iam.PolicyStatement({
                actions: [
                    'bedrock-agentcore:CreateEvent',
                    'bedrock-agentcore:GetEvent',
                    'bedrock-agentcore:DeleteEvent',
                    'bedrock-agentcore:RetrieveMemoryRecords',
                    'bedrock-agentcore:ListMemoryRecords',
                    'bedrock-agentcore-control:ListMemories',
                    'bedrock-agentcore-control:GetMemory',
                    'bedrock-agentcore-control:CreateMemory'
                ],
                resources: ['*']
            })
        );

        // AWS-managed Lambda Web Adapter layer — enables response streaming for Python Lambdas.
        const webAdapterLayer = lambda.LayerVersion.fromLayerVersionArn(
            this,
            'LambdaWebAdapterLayer',
            `arn:aws:lambda:${region}:753240598075:layer:LambdaAdapterLayerArm64:25`
        );

        this.lambdaFunction = new lambda.Function(this, 'Function', {
            runtime: lambda.Runtime.PYTHON_3_14,
            handler: 'run.sh',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../src/lambda/converse-strands'), {
                // Hash the source directory so CDK detects Python file changes
                assetHashType: cdk.AssetHashType.SOURCE,
                exclude: ['.venv', '__pycache__', 'tests', '*.pyc', '.pytest_cache'],
                bundling: {
                    image: lambda.Runtime.PYTHON_3_14.bundlingImage,
                    // Must match the deployed Lambda architecture (ARM_64) so pip
                    // downloads manylinux_aarch64 wheels. A mismatch produces amd64
                    // .so files that fail to import on arm64 at runtime (e.g.
                    // ModuleNotFoundError: No module named 'pydantic_core._pydantic_core').
                    // On x86_64 CI runners this requires docker/setup-qemu-action +
                    // docker/setup-buildx-action before CDK deploy — see
                    // guides/advanced/strands-converse for details.
                    platform: 'linux/arm64',
                    command: [
                        'bash',
                        '-c',
                        [
                            'pip install -r requirements.txt -t /asset-output',
                            'pip install strands-agents-tools --no-deps -t /asset-output',
                            'rm -rf /asset-output/boto3 /asset-output/botocore /asset-output/s3transfer',
                            'rm -rf /asset-output/boto3*.dist-info /asset-output/botocore*.dist-info /asset-output/s3transfer*.dist-info',
                            'find /asset-output -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true',
                            'find /asset-output -type d -name tests -exec rm -rf {} + 2>/dev/null || true',
                            'cp *.py /asset-output/',
                            'cp requirements.txt /asset-output/',
                            'cp run.sh /asset-output/ && chmod +x /asset-output/run.sh'
                        ].join(' && ')
                    ]
                }
            }),
            role,
            timeout: cdk.Duration.seconds(300),
            memorySize: 1024,
            architecture: lambda.Architecture.ARM_64,
            layers: [webAdapterLayer],
            environment: {
                CHAT_MESSAGES_TABLE: pikaOutputs.chatMessagesTable.tableName,
                CHAT_SESSION_TABLE: pikaOutputs.chatSessionTable.tableName,
                CHAT_USER_TABLE: pikaOutputs.chatUserTable.tableName,
                AGENT_DEFINITIONS_TABLE: pikaOutputs.agentDefinitionsTable.tableName,
                TOOL_DEFINITIONS_TABLE: pikaOutputs.toolDefinitionsTable.tableName,
                TAG_DEFINITIONS_TABLE: pikaOutputs.tagDefinitionsTable.tableName,
                SEMANTIC_DIRECTIVE_TABLE: pikaOutputs.semanticDirectiveTable.tableName,
                PIKA_S3_BUCKET: pikaOutputs.pikaS3Bucket.bucketName,
                STAGE: stage,
                PIKA_SERVICE_PROJ_NAME_KEBAB_CASE: projNameKebabCase,
                AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
                AWS_LWA_INVOKE_MODE: 'response_stream',
                PORT: '8080'
            }
        });

        this.functionUrl = this.lambdaFunction.addFunctionUrl({
            authType: lambda.FunctionUrlAuthType.AWS_IAM,
            invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
            cors: {
                allowedOrigins: ['*'],
                allowedMethods: [lambda.HttpMethod.POST],
                allowedHeaders: ['Content-Type', 'Authorization'],
                exposedHeaders: ['x-chatbot-session-id'],
                allowCredentials: false
            }
        });

        new ssm.StringParameter(this, 'UrlParam', {
            parameterName: `/stack/${projNameKebabCase}/${stage}/function/converse_strands_url`,
            stringValue: this.functionUrl.url,
            description: 'URL of the Strands converse Lambda Function URL'
        });

        new ssm.StringParameter(this, 'ArnParam', {
            parameterName: `/stack/${projNameKebabCase}/${stage}/function/converse_strands_arn`,
            stringValue: this.lambdaFunction.functionArn,
            description: 'ARN of the Strands converse Lambda (for IAM grants)'
        });
    }
}
