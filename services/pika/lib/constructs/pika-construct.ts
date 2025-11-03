import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import {
    DEFAULT_EVENT_EXPIRY_DURATION,
    DEFAULT_MEMORY_STRATEGIES,
    SessionInsightsFeature,
    SessionInsightsOpenSearchConfig,
    UserMemoryFeature,
    UserMemoryStrategy
} from 'pika-shared/types/chatbot/chatbot-types';

export interface PikaConstructProps {
    stage: string;
    stackName: string;
    region: string;
    account: string;
    projNameL: string; // All lowercase e.g. pika
    projNameKebabCase: string; // Kebab case e.g. pika
    projNameTitleCase: string; // Title case e.g. Pika
    projNameCamel: string; // Camel case e.g. pika
    projNameHuman: string; // Human readable e.g. Pika
    sessionInsightsFeature: SessionInsightsFeature;
    userMemoryFeature: UserMemoryFeature;
    stackTags?: Record<string, string>;
    componentTagNames?: string[];
}

export interface PikaConstructOutputs {
    pikaS3Bucket: s3.Bucket;
    fileArchiveBucket: s3.Bucket;
    chatMessagesTable: dynamodb.Table;
    chatSessionTable: dynamodb.Table;
    chatUserTable: dynamodb.Table;
    chatAppTable: dynamodb.Table;
    agentDefinitionsTable: dynamodb.Table;
    toolDefinitionsTable: dynamodb.Table;
    tagDefinitionsTable: dynamodb.Table;
    semanticDirectiveTable: dynamodb.Table;
    archiveStagingTable: dynamodb.Table;
    chatbotApi: apigateway.RestApi;
    chatAdminApi: apigateway.RestApi;
    converseFunctionUrl: string;
    pikaDomain?: opensearch.Domain;
}

export class PikaConstruct extends Construct {
    public readonly outputs: PikaConstructOutputs;
    private readonly props: PikaConstructProps;

    constructor(scope: Construct, id: string, props: PikaConstructProps) {
        super(scope, id);

        this.props = props;

        let openSearchDomain: opensearch.Domain | undefined;
        if (this.props.sessionInsightsFeature.enabled) {
            openSearchDomain = this.createOpenSearchDomain(this.props.stage, this.props.sessionInsightsFeature.openSearchConfig);
        }

        // Create memory custom resource if user memory feature is enabled
        let memoryCustomResourceLambda: lambda.Function | undefined;
        let memoryId: string | undefined;
        let memoryStrategies: Partial<Record<UserMemoryStrategy, string>> | undefined;
        if (this.props.userMemoryFeature.enabled) {
            memoryCustomResourceLambda = this.createMemoryCustomResource();
        }

        // Create storage resources
        const storageResources = this.createStorageResources(openSearchDomain);

        if (openSearchDomain && storageResources.chatSessionFeedbackTable) {
            this.createGenerateSessionInsightsInfra(
                openSearchDomain,
                storageResources.chatSessionTable,
                storageResources.pikaS3Bucket,
                storageResources.chatSessionFeedbackTable,
                storageResources.chatMessagesTable
            );
        }

        // Create memory custom resource instance if enabled

        if (this.props.userMemoryFeature.enabled && memoryCustomResourceLambda) {
            const [newMemoryId, newMemoryStrategies] = this.createMemoryCustomResourceInstance(memoryCustomResourceLambda);
            memoryId = newMemoryId;
            memoryStrategies = newMemoryStrategies;
        }

        // Create compute resources
        const computeResources = this.createComputeResources(storageResources, openSearchDomain, memoryId, memoryStrategies);

        // Create API resources
        const apiResources = this.createApiResources(storageResources, computeResources, this.props.userMemoryFeature.enabled);

        // Create SSM parameters
        this.createSsmParameters(storageResources, computeResources, apiResources);

        this.outputs = {
            pikaS3Bucket: storageResources.pikaS3Bucket,
            fileArchiveBucket: storageResources.fileArchiveBucket,
            archiveStagingTable: storageResources.archiveStagingTable,
            chatMessagesTable: storageResources.chatMessagesTable,
            chatSessionTable: storageResources.chatSessionTable,
            chatUserTable: storageResources.chatUserTable,
            chatAppTable: storageResources.chatAppTable,
            agentDefinitionsTable: storageResources.agentDefinitionsTable,
            toolDefinitionsTable: storageResources.toolDefinitionsTable,
            tagDefinitionsTable: storageResources.tagDefinitionsTable,
            semanticDirectiveTable: storageResources.semanticDirectiveTable,
            chatbotApi: apiResources.chatbotApi,
            chatAdminApi: apiResources.chatAdminApi,
            converseFunctionUrl: apiResources.converseFunctionUrl,
            pikaDomain: openSearchDomain
        };
    }

    private createStorageResources(openSearchDomain?: opensearch.Domain) {
        // S3 Buckets
        const pikaS3Bucket = this.createPikaS3Bucket();
        const fileArchiveBucket = this.createFileArchiveBucket();

        // DynamoDB Tables
        const archiveStagingTable = this.createArchiveStagingTable();
        const chatMessagesTable = this.createChatMessagesTable(pikaS3Bucket, fileArchiveBucket, archiveStagingTable, openSearchDomain);
        const chatSessionTable = this.createChatSessionTable(pikaS3Bucket, fileArchiveBucket, archiveStagingTable, openSearchDomain);

        // If they didn't turn on insights, they don't get the feedback feature
        const chatSessionFeedbackTable: cdk.aws_dynamodb.Table | undefined = openSearchDomain ? this.createChatSessionFeedbackTable(openSearchDomain, chatSessionTable) : undefined;

        const chatUserTable = this.createChatUserTable();
        const chatAppTable = this.createChatAppTable();
        const agentDefinitionsTable = this.createAgentDefinitionsTable();
        const toolDefinitionsTable = this.createToolDefinitionsTable();
        const tagDefinitionsTable = this.createTagDefinitionsTable();
        const semanticDirectiveTable = this.createSemanticDirectiveTable();

        // Sharing Sessions Feature Tables
        const sharedSessionVisitHistoryTable = this.createSharedSessionVisitHistoryTable();
        const pinnedSessionTable = this.createPinnedSessionTable();

        // Create the archive processor after tables are created
        this.createArchiveProcessor(archiveStagingTable, fileArchiveBucket, pikaS3Bucket);

        return {
            pikaS3Bucket,
            fileArchiveBucket,
            archiveStagingTable,
            chatMessagesTable,
            chatSessionTable,
            chatSessionFeedbackTable,
            chatUserTable,
            chatAppTable,
            agentDefinitionsTable,
            toolDefinitionsTable,
            tagDefinitionsTable,
            semanticDirectiveTable,
            sharedSessionVisitHistoryTable,
            pinnedSessionTable
        };
    }

    private createComputeResources(storageResources: any, openSearchDomain?: opensearch.Domain, memoryId?: string, memoryStrategies?: Partial<Record<UserMemoryStrategy, string>>) {
        // Create IAM roles
        const bedrockChatRole = this.createBedrockChatRoleForInlineAgent();
        const lambdaRole = this.createChatLambdaRole(
            storageResources.chatMessagesTable,
            storageResources.chatSessionTable,
            storageResources.chatUserTable,
            storageResources.chatAppTable,
            storageResources.tagDefinitionsTable,
            bedrockChatRole,
            storageResources.chatSessionFeedbackTable,
            openSearchDomain,
            storageResources.sharedSessionVisitHistoryTable,
            storageResources.pinnedSessionTable
        );

        // Create Lambda functions
        const chatbotApiFn = this.createChatbotApiFunction(
            lambdaRole,
            storageResources.chatMessagesTable,
            storageResources.chatSessionTable,
            storageResources.chatUserTable,
            storageResources.chatAppTable,
            storageResources.tagDefinitionsTable,
            storageResources.chatSessionFeedbackTable,
            openSearchDomain,
            memoryId,
            storageResources.sharedSessionVisitHistoryTable,
            storageResources.pinnedSessionTable
        );

        const [chatAdminApiFn, chatAdminRestApi] = this.createChatAdminApiFunction(
            storageResources.agentDefinitionsTable,
            storageResources.toolDefinitionsTable,
            storageResources.chatAppTable,
            storageResources.chatUserTable,
            storageResources.chatSessionTable,
            storageResources.tagDefinitionsTable,
            storageResources.semanticDirectiveTable,
            storageResources.sharedSessionVisitHistoryTable,
            storageResources.pinnedSessionTable,
            storageResources.pikaS3Bucket,
            storageResources.chatSessionFeedbackTable,
            openSearchDomain,
            memoryId,
            memoryStrategies
        );

        // Create custom resources
        this.createAgentCustomResource(chatAdminRestApi);
        this.createChatAppCustomResource(chatAdminRestApi);
        this.createSemanticDirectiveCustomResource(chatAdminRestApi);
        this.createTagDefinitionCustomResource(chatAdminRestApi);
        const domainIndexCustomResourceLambda = this.createDomainIndexCustomResource();
        const inferenceProfileCustomResourceLambda = this.createInferenceProfileCustomResource();

        // Create inference profile instances for the three Claude models and capture their ARNs
        const inferenceProfileArns = this.createInferenceProfileInstances(inferenceProfileCustomResourceLambda);

        // Initialize OpenSearch domain indices if OpenSearch is enabled
        if (openSearchDomain) {
            this.createDomainIndexInitialization(openSearchDomain, domainIndexCustomResourceLambda);
        }

        const converseFnLambdaRole = this.createConverseFnLambdaRole(
            storageResources.chatMessagesTable,
            storageResources.chatSessionTable,
            storageResources.chatUserTable,
            chatAdminRestApi,
            storageResources.agentDefinitionsTable,
            storageResources.toolDefinitionsTable,
            storageResources.tagDefinitionsTable,
            storageResources.semanticDirectiveTable,
            storageResources.pikaS3Bucket,
            storageResources.chatAppTable,
            storageResources.chatSessionFeedbackTable,
            openSearchDomain
        );
        const agentPostProcessorFn = this.createAgentPostProcessorFunction(lambdaRole);

        const converseFn = this.createConverseFunction(
            converseFnLambdaRole,
            storageResources.chatMessagesTable,
            storageResources.chatSessionTable,
            storageResources.chatUserTable,
            storageResources.tagDefinitionsTable,
            storageResources.semanticDirectiveTable,
            chatAdminRestApi,
            storageResources.agentDefinitionsTable,
            storageResources.toolDefinitionsTable,
            storageResources.pikaS3Bucket,
            agentPostProcessorFn,
            openSearchDomain,
            memoryId,
            inferenceProfileArns
        );

        return {
            bedrockChatRole,
            lambdaRole,
            converseFnLambdaRole,
            chatbotApiFn,
            chatAdminApiFn,
            chatAdminRestApi,
            converseFn,
            agentPostProcessorFn,
            openSearchDomain
        };
    }

    private createApiResources(storageResources: any, computeResources: any, userMemoryFeatureEnabled?: boolean) {
        // Create Function URL for converse function
        const converseUrl = computeResources.converseFn.addFunctionUrl({
            invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
            authType: lambda.FunctionUrlAuthType.AWS_IAM,
            cors: {
                allowedOrigins: ['*'],
                allowedMethods: [lambda.HttpMethod.POST],
                allowedHeaders: ['Content-Type', 'Authorization'],
                exposedHeaders: ['x-chatbot-session-id'],
                allowCredentials: false
            }
        });

        // Create main API Gateway
        const chatbotApi = this.createChatbotApi(computeResources.chatbotApiFn, userMemoryFeatureEnabled);

        return {
            chatbotApi,
            chatAdminApi: computeResources.chatAdminRestApi,
            converseFunctionUrl: converseUrl.url
        };
    }

    private createSsmParameters(storageResources: any, computeResources: any, apiResources: any) {
        // S3 bucket parameters
        new ssm.StringParameter(this, 'PikaS3BucketNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/s3/pika_bucket_name`,
            stringValue: storageResources.pikaS3Bucket.bucketName,
            description: 'Name of the S3 bucket for file uploads and other files needed'
        });

        new ssm.StringParameter(this, 'PikaS3BucketArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/s3/pika_bucket_arn`,
            stringValue: storageResources.pikaS3Bucket.bucketArn,
            description: 'ARN of the S3 bucket for file uploads and other files needed'
        });

        new ssm.StringParameter(this, 'FileArchiveBucketNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/s3/archive_bucket_name`,
            stringValue: storageResources.fileArchiveBucket.bucketName,
            description: 'Name of the S3 bucket for file archives'
        });

        new ssm.StringParameter(this, 'FileArchiveBucketArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/s3/archive_bucket_arn`,
            stringValue: storageResources.fileArchiveBucket.bucketArn,
            description: 'ARN of the S3 bucket for file archives'
        });

        // Lambda function parameters
        new ssm.StringParameter(this, 'ChatAdminApiFunctionArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/lambda/chat_admin_api_arn`,
            stringValue: computeResources.chatAdminApiFn.functionArn,
            description: 'ARN of the Chat Admin API Lambda function'
        });

        new ssm.StringParameter(this, 'ChatAdminApiFunctionNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/lambda/chat_admin_api_name`,
            stringValue: computeResources.chatAdminApiFn.functionName,
            description: 'Name of the Chat Admin API Lambda function'
        });

        new ssm.StringParameter(this, 'ChatbotApiFunctionNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/lambda/chatbot_api_name`,
            stringValue: computeResources.chatbotApiFn.functionName,
            description: 'Name of the Chatbot API Lambda function'
        });

        new ssm.StringParameter(this, 'ConverseUrlParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/function/converse_url`,
            stringValue: apiResources.converseFunctionUrl,
            description: 'URL of the Function URL for streaming conversations'
        });

        new ssm.StringParameter(this, 'ConverseFunctionArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/function/converse_arn`,
            stringValue: computeResources.converseFn.functionArn,
            description: 'ARN of the Function for streaming conversations'
        });

        new ssm.StringParameter(this, 'ConverseFunctionNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/function/converse_name`,
            stringValue: computeResources.converseFn.functionName,
            description: 'Name of the Function for streaming conversations'
        });

        // DynamoDB table parameters
        new ssm.StringParameter(this, 'ChatTableNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/chat_message`,
            stringValue: storageResources.chatMessagesTable.tableName,
            description: 'DynamoDB Table Name for Chat Messages'
        });

        // API Gateway parameters
        new ssm.StringParameter(this, 'ApiUrlParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/api/url`,
            stringValue: apiResources.chatbotApi.url,
            description: 'URL of the API Gateway for the chatbot'
        });

        new ssm.StringParameter(this, 'ApiIdParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/api/id`,
            stringValue: apiResources.chatbotApi.restApiId,
            description: 'API Gateway ID for the chatbot API'
        });

        new ssm.StringParameter(this, 'ApiArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/api/execution_arn`,
            stringValue: apiResources.chatbotApi.arnForExecuteApi(),
            description: 'Execution ARN for the chatbot API Gateway'
        });

        // Instruction Assistance configuration parameters
        new ssm.StringParameter(this, 'InstructionAssistanceOutputFormattingParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/instruction-assistance/output-formatting-requirements`,
            stringValue: `**Output Formatting Requirements:**

- **Output Response Enclosure**: All response output MUST be completely enclosed within <answer></answer> tags, including supported custom tags.
- **Output Content Format:** All responses MUST be in Markdown with supported custom tags.`,
            description: 'Default output formatting requirements for instruction assistance'
        });

        new ssm.StringParameter(this, 'InstructionAssistanceCompleteExampleParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/instruction-assistance/default-complete-example-line`,
            stringValue: `- **Complete Example Output:**
  \`<answer>##Example markdown\\nNormal text and an <pika.image>http://some.url</pika.image> and some **bold text**\\n<pika.chart>(...)</pika.chart></answer>\``,
            description: 'Default complete example instruction line for instruction assistance'
        });

        new ssm.StringParameter(this, 'InstructionAssistanceJsonValidationParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/instruction-assistance/default-json-validation-line`,
            stringValue: 'BE ABSOLUTELY CERTAIN ANY JSON INCLUDED IS 100% VALID (especially for charts). Invalid JSON will break the user experience.',
            description: 'Default JSON validation instruction line for instruction assistance'
        });

        new ssm.StringParameter(this, 'InstructionAssistanceTypescriptBackedOutputFormattingParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/instruction-assistance/typescript-backed-output-formatting-requirements`,
            stringValue: `**Output Formatting Requirements:**

1. **Locate the Schema**: Find the \`<output_schema>\` element in this prompt, which contains TypeScript interface definitions.

2. **Identify Response Type**: The **first interface** defined in the \`<output_schema>\` element specifies the exact structure your response must follow.

3. **Generate Valid JSON**: Create a JSON object that strictly conforms to that first interface definition. Ensure:
   - All required properties are included
   - Property types match the TypeScript definitions
   - Optional properties (marked with ? may be omitted if data is unavailable
   - String values are properly quoted
   - The JSON is valid and parseable

4. **Enclose Response**: Your entire response MUST be wrapped in \`<answer></answer>\` tags with ONLY the JSON inside - no other text, explanations, or markdown.

**Example Output:**
\`<answer>{"property":"value","property2":"value2"}</answer>\``,
            description: 'Default output formatting requirements for structured JSON conforming to typescript interface for instruction assistance'
        });
    }

    // Storage creation methods
    private createPikaS3Bucket(): s3.Bucket {
        console.log(`Creating pika S3 bucket ${this.props.stackName}`);
        const bucket = new s3.Bucket(this, 'PikaS3Bucket', {
            bucketName: `pika-files-${this.props.stackName}`,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
            //TODO: come back to this for cleanup
            // lifecycleRules: [
            //     {
            //         id: 'DeleteUnconfirmedChatFiles',
            //         enabled: true,
            //         expiration: cdk.Duration.days(2),
            //         tagFilters: {
            //             chat: 'true',
            //             confirmed: 'false'
            //         }
            //     }
            // ]
        });
        this.applyComponentTags(bucket, 'PikaFilesBucket');
        return bucket;
    }

    private createFileArchiveBucket(): s3.Bucket {
        console.log(`Creating archive S3 bucket file-archive-${this.props.stackName}`);
        const bucket = new s3.Bucket(this, 'FileArchiveBucket', {
            bucketName: `file-archive-${this.props.stackName}`,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            lifecycleRules: [
                {
                    id: 'TransitionToGlacierFlexible',
                    enabled: true,
                    transitions: [
                        {
                            storageClass: s3.StorageClass.GLACIER,
                            transitionAfter: cdk.Duration.days(1)
                        },
                        {
                            storageClass: s3.StorageClass.DEEP_ARCHIVE,
                            transitionAfter: cdk.Duration.days(91)
                        }
                    ]
                },
                {
                    id: 'DeleteOldArchives',
                    enabled: true,
                    expiration: cdk.Duration.days(365 * 3)
                }
            ]
        });
        this.applyComponentTags(bucket, 'FileArchiveBucket');
        return bucket;
    }

    private createArchiveStagingTable(): dynamodb.Table {
        const archiveStagingTable = new dynamodb.Table(this, 'ArchiveStagingTable', {
            partitionKey: {
                name: 'staging_id',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'record_id',
                type: dynamodb.AttributeType.STRING
            },
            tableName: `archive-staging-${this.props.stackName}`,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'exp_date_unix_seconds'
        });

        archiveStagingTable.addGlobalSecondaryIndex({
            indexName: 'partition-hour-index',
            partitionKey: {
                name: 'partition_hour',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'staging_id',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        new ssm.StringParameter(this, 'ArhciveStagingTableNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/archive_staging`,
            stringValue: archiveStagingTable.tableName,
            description: 'DynamoDB Table Name for Archive Staging'
        });

        new ssm.StringParameter(this, 'ArchiveStagingTableArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/archive_staging_arn`,
            stringValue: archiveStagingTable.tableArn,
            description: 'DynamoDB Table ARN for Archive Staging'
        });

        this.applyComponentTags(archiveStagingTable, 'ArchiveStagingTable');
        return archiveStagingTable;
    }

    private createChatMessagesTable(
        pikaS3Bucket: s3.Bucket,
        fileArchiveBucket: s3.Bucket,
        archiveStagingTable: dynamodb.Table,
        openSearchDomain?: opensearch.Domain
    ): dynamodb.Table {
        const chatMessagesTable = new dynamodb.Table(this, 'ChatMessagesTable', {
            partitionKey: {
                name: 'user_id',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'message_id',
                type: dynamodb.AttributeType.STRING
            },
            tableName: `chat-message-${this.props.stackName}`,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
            timeToLiveAttribute: 'exp_date_unix_seconds'
        });

        const messageChangedLambdaRole = new iam.Role(this, 'MessageChangedLambdaRole', {
            roleName: `message-changed-lambda-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                MainPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['dynamodb:DescribeStream', 'dynamodb:GetRecords', 'dynamodb:GetShardIterator', 'dynamodb:ListStreams'],
                            resources: [chatMessagesTable.tableStreamArn!]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:DeleteObject',
                                's3:GetObjectTagging',
                                's3:PutObjectTagging',
                                's3:GetObject',
                                's3:PutObject',
                                's3:GetObjectAttributes',
                                's3:PutObjectTagging',
                                's3:DeleteObjectTagging',
                                's3:GetObjectVersion',
                                's3:DeleteObjectVersion',
                                's3:ListBucket',
                                's3:ListBucketVersions',
                                's3:GetBucketLocation',
                                's3:GetBucketVersioning'
                            ],
                            resources: [pikaS3Bucket.bucketArn, `${pikaS3Bucket.bucketArn}/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:PutObject', 's3:PutObjectTagging', 's3:GetObject', 's3:GetObjectTagging', 's3:ListBucket'],
                            resources: [fileArchiveBucket.bucketArn, `${fileArchiveBucket.bucketArn}/*`]
                        }),
                        ...(openSearchDomain
                            ? [
                                  new iam.PolicyStatement({
                                      effect: iam.Effect.ALLOW,
                                      actions: ['es:*'],
                                      resources: [openSearchDomain.domainArn, `${openSearchDomain.domainArn}/*`]
                                  })
                              ]
                            : [])
                    ]
                })
            }
        });

        archiveStagingTable.grantWriteData(messageChangedLambdaRole);

        const messageChangedLambda = new nodejs.NodejsFunction(this, 'MessageChangedLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/message-changed/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 256,
            role: messageChangedLambdaRole,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                STAGE: this.props.stage,
                PIKA_S3_BUCKET: pikaS3Bucket.bucketName,
                STAGING_TABLE_NAME: archiveStagingTable.tableName,
                REGION: this.props.region,
                ...(openSearchDomain ? { PIKA_DOMAIN_ENDPOINT: openSearchDomain.domainEndpoint } : {})
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        messageChangedLambda.addEventSource(
            new DynamoEventSource(chatMessagesTable, {
                startingPosition: lambda.StartingPosition.LATEST,
                batchSize: 10,
                maxBatchingWindow: cdk.Duration.seconds(5),
                retryAttempts: 10
            })
        );

        this.applyComponentTags(chatMessagesTable, 'ChatMessagesTable');
        this.applyComponentTags(messageChangedLambda, 'MessageChangedLambda');
        return chatMessagesTable;
    }

    private createChatSessionTable(
        pikaS3Bucket: s3.Bucket,
        fileArchiveBucket: s3.Bucket,
        archiveStagingTable: dynamodb.Table,
        openSearchDomain?: opensearch.Domain
    ): dynamodb.Table {
        const chatSessionTable = new dynamodb.Table(this, 'ChatSessionTable', {
            partitionKey: {
                name: 'user_id',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'session_id',
                type: dynamodb.AttributeType.STRING
            },
            tableName: `chat-session-${this.props.stackName}`,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
            timeToLiveAttribute: 'exp_date_unix_seconds'
        });

        // Add GSI for querying sessions by user and chat app with chronological sorting
        // Sort key is composite: ${chatAppId}#${user|component}#${lastUpdate} for correct chronological ordering
        chatSessionTable.addGlobalSecondaryIndex({
            indexName: 'user-chat-app-index',
            partitionKey: {
                name: 'user_id',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'chat_app_sk',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        chatSessionTable.addGlobalSecondaryIndex({
            indexName: 'insight-status-index',
            partitionKey: {
                name: 'insight_status',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'last_message_id',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        // GSI for shared sessions - allows querying all shared sessions
        chatSessionTable.addGlobalSecondaryIndex({
            indexName: 'shared-sessions-index',
            partitionKey: {
                name: 'share_id',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'share_date',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        // So can query for all test sessions
        chatSessionTable.addGlobalSecondaryIndex({
            indexName: 'test-records-index',
            partitionKey: {
                name: 'test_type',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'session_id',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        const sessionChangedLambdaRole = new iam.Role(this, 'SessionChangedLambdaRole', {
            roleName: `session-changed-lambda-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                MainPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:DescribeStream',
                                'dynamodb:GetRecords',
                                'dynamodb:GetShardIterator',
                                'dynamodb:ListStreams',
                                'dynamodb:PutItem',
                                'dynamodb:DeleteItem',
                                'dynamodb:UpdateItem',
                                'dynamodb:Query',
                                'dynamodb:Scan',
                                'dynamodb:BatchWriteItem'
                            ],
                            resources: [chatSessionTable.tableStreamArn!, chatSessionTable.tableArn, `${chatSessionTable.tableArn}/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:PutObject', 's3:PutObjectTagging', 's3:GetObject', 's3:GetObjectTagging', 's3:ListBucket'],
                            resources: [fileArchiveBucket.bucketArn, `${fileArchiveBucket.bucketArn}/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:GetObject'],
                            resources: [`${pikaS3Bucket.bucketArn}/session-insights/*`]
                        }),
                        ...(openSearchDomain
                            ? [
                                  new iam.PolicyStatement({
                                      effect: iam.Effect.ALLOW,
                                      actions: ['es:*'],
                                      resources: [openSearchDomain.domainArn, `${openSearchDomain.domainArn}/*`]
                                  })
                              ]
                            : [])
                    ]
                })
            }
        });

        archiveStagingTable.grantWriteData(sessionChangedLambdaRole);

        const sessionChangedLambda = new nodejs.NodejsFunction(this, 'SessionChangedLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/session-changed/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 256,
            role: sessionChangedLambdaRole,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                STAGE: this.props.stage,
                ARCHIVE_S3_BUCKET: fileArchiveBucket.bucketName,
                STAGING_TABLE_NAME: archiveStagingTable.tableName,
                REGION: this.props.region,
                ...(openSearchDomain ? { PIKA_DOMAIN_ENDPOINT: openSearchDomain.domainEndpoint } : {})
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        sessionChangedLambda.addEventSource(
            new DynamoEventSource(chatSessionTable, {
                startingPosition: lambda.StartingPosition.LATEST,
                batchSize: 10,
                maxBatchingWindow: cdk.Duration.seconds(5),
                retryAttempts: 10
            })
        );

        this.applyComponentTags(chatSessionTable, 'ChatSessionTable');
        this.applyComponentTags(sessionChangedLambda, 'SessionChangedLambda');
        return chatSessionTable;
    }

    private createChatSessionFeedbackTable(openSearchDomain: opensearch.Domain, chatSessionTable: dynamodb.Table): dynamodb.Table {
        const chatSessionFeedbackTable = new dynamodb.Table(this, 'ChatSessionFeedbackTable', {
            partitionKey: {
                name: 'feedback_id',
                type: dynamodb.AttributeType.STRING
            },
            tableName: `chat-session-feedback-${this.props.stackName}`,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
            timeToLiveAttribute: 'exp_date_unix_seconds'
        });

        chatSessionFeedbackTable.addGlobalSecondaryIndex({
            indexName: 'chat-session-feedback-session-id-index',
            partitionKey: {
                name: 'session_id',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'created_on',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        const sessionFeedbackChangedLambdaRole = new iam.Role(this, 'SessionFeedbackChangedLambdaRole', {
            roleName: `session-feedback-changed-lambda-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                MainPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:DescribeStream',
                                'dynamodb:GetRecords',
                                'dynamodb:GetShardIterator',
                                'dynamodb:ListStreams',
                                'dynamodb:PutItem',
                                'dynamodb:DeleteItem',
                                'dynamodb:UpdateItem',
                                'dynamodb:Query',
                                'dynamodb:Scan',
                                'dynamodb:BatchWriteItem'
                            ],
                            resources: [
                                chatSessionFeedbackTable.tableStreamArn!,
                                chatSessionFeedbackTable.tableArn,
                                `${chatSessionFeedbackTable.tableArn}/*`,
                                chatSessionTable.tableArn,
                                `${chatSessionTable.tableArn}/*`
                            ]
                        }),
                        ...(openSearchDomain
                            ? [
                                  new iam.PolicyStatement({
                                      effect: iam.Effect.ALLOW,
                                      actions: ['es:*'],
                                      resources: [openSearchDomain.domainArn, `${openSearchDomain.domainArn}/*`]
                                  })
                              ]
                            : [])
                    ]
                })
            }
        });

        const sessionFeedbackChangedLambda = new nodejs.NodejsFunction(this, 'SessionFeedbackChangedLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/session-feedback-changed/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 256,
            role: sessionFeedbackChangedLambdaRole,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                STAGE: this.props.stage,
                REGION: this.props.region,
                SESSION_TABLE_NAME: chatSessionTable.tableName,
                SESSION_FEEDBACK_TABLE_NAME: chatSessionFeedbackTable.tableName,
                ...(openSearchDomain ? { PIKA_DOMAIN_ENDPOINT: openSearchDomain.domainEndpoint } : {})
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        sessionFeedbackChangedLambda.addEventSource(
            new DynamoEventSource(chatSessionFeedbackTable, {
                startingPosition: lambda.StartingPosition.LATEST,
                batchSize: 10,
                maxBatchingWindow: cdk.Duration.seconds(5),
                retryAttempts: 10
            })
        );

        new ssm.StringParameter(this, 'ChatSessionFeedbackTableNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/chat_session_feedback`,
            stringValue: chatSessionFeedbackTable.tableName,
            description: 'DynamoDB Table Name for Chat Session Feedback'
        });

        new ssm.StringParameter(this, 'ChatSessionFeedbackTableArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/chat_session_feedback_arn`,
            stringValue: chatSessionFeedbackTable.tableArn,
            description: 'DynamoDB Table ARN for Chat Session Feedback'
        });

        this.applyComponentTags(chatSessionFeedbackTable, 'ChatSessionFeedbackTable');
        this.applyComponentTags(sessionFeedbackChangedLambda, 'SessionFeedbackChangedLambda');
        return chatSessionFeedbackTable;
    }

    private createChatUserTable(): dynamodb.Table {
        const chatUserTable = new dynamodb.Table(this, 'ChatUserTable', {
            partitionKey: {
                name: 'user_id',
                type: dynamodb.AttributeType.STRING
            },
            tableName: `chat-user-${this.props.stackName}`,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
        });

        // Add GSI for efficient user ID prefix searching
        chatUserTable.addGlobalSecondaryIndex({
            indexName: 'user-search-index',
            partitionKey: {
                name: 'user_id_prefix',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'user_id_lower',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        // So can query for all test users
        chatUserTable.addGlobalSecondaryIndex({
            indexName: 'test-users-index',
            partitionKey: {
                name: 'test_type',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'user_id',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        this.applyComponentTags(chatUserTable, 'ChatUserTable');
        return chatUserTable;
    }

    /**
     * This table stores two kinds of records, chat app records (ChatApp type)
     * and the overrides for a chat app (ChatAppOverride type).  If a chat app's ID is
     * `weather` then its optional override record would be stored in this table
     * with the chat app id `weather:override`.  Of course, we rip off the
     * `:override` part to get the chatAppId.
     */
    private createChatAppTable(): dynamodb.Table {
        const chatAppTable = new dynamodb.Table(this, 'ChatAppTable', {
            partitionKey: {
                name: 'chat_app_id',
                type: dynamodb.AttributeType.STRING
            },
            tableName: `chat-app-${this.props.stackName}`,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'ttl'
        });

        // So can query for all test chat apps
        chatAppTable.addGlobalSecondaryIndex({
            indexName: 'test-chat-apps-index',
            partitionKey: {
                name: 'test_type',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'chat_app_id',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        new ssm.StringParameter(this, 'ChatAppTableNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/chat_app_table_name`,
            stringValue: chatAppTable.tableName,
            description: 'DynamoDB Table Name for Chat App'
        });

        new ssm.StringParameter(this, 'ChatAppTableArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/chat_app_table_arn`,
            stringValue: chatAppTable.tableArn,
            description: 'DynamoDB Table ARN for Chat App'
        });

        this.applyComponentTags(chatAppTable, 'ChatAppTable');
        return chatAppTable;
    }

    private createAgentDefinitionsTable(): dynamodb.Table {
        const agentDefinitionsTable = new dynamodb.Table(this, 'AgentDefinitionsTable', {
            partitionKey: {
                name: 'agent_id',
                type: dynamodb.AttributeType.STRING
            },
            tableName: `agent-definitions-${this.props.stackName}`,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'ttl'
        });

        agentDefinitionsTable.addGlobalSecondaryIndex({
            indexName: 'createdBy-createdAt-index',
            partitionKey: {
                name: 'created_by',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'created_at',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        agentDefinitionsTable.addGlobalSecondaryIndex({
            indexName: 'cacheStatus-agentId-index',
            partitionKey: {
                name: 'cache_status',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'agent_id',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        // So can query for all test agents
        agentDefinitionsTable.addGlobalSecondaryIndex({
            indexName: 'test-agents-index',
            partitionKey: {
                name: 'test_type',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'agent_id',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        new ssm.StringParameter(this, 'AgentDefinitionsTableNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/agent_definitions`,
            stringValue: agentDefinitionsTable.tableName,
            description: 'DynamoDB Table Name for Agent Definitions'
        });

        this.applyComponentTags(agentDefinitionsTable, 'AgentDefinitionsTable');
        return agentDefinitionsTable;
    }

    private createToolDefinitionsTable(): dynamodb.Table {
        const toolDefinitionsTable = new dynamodb.Table(this, 'ToolDefinitionsTable', {
            partitionKey: {
                name: 'tool_id',
                type: dynamodb.AttributeType.STRING
            },
            tableName: `tool-definitions-${this.props.stackName}`,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'ttl'
        });

        toolDefinitionsTable.addGlobalSecondaryIndex({
            indexName: 'executionType-version-index',
            partitionKey: {
                name: 'execution_type',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'version',
                type: dynamodb.AttributeType.NUMBER
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        toolDefinitionsTable.addGlobalSecondaryIndex({
            indexName: 'lifecycle-status-toolId-index',
            partitionKey: {
                name: 'lifecycle_status',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'tool_id',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        toolDefinitionsTable.addGlobalSecondaryIndex({
            indexName: 'createdBy-createdAt-index',
            partitionKey: {
                name: 'created_by',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'created_at',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        // So can query for all test tools
        toolDefinitionsTable.addGlobalSecondaryIndex({
            indexName: 'test-tools-index',
            partitionKey: {
                name: 'test_type',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'tool_id',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        new ssm.StringParameter(this, 'ToolDefinitionsTableNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/tool_definitions`,
            stringValue: toolDefinitionsTable.tableName,
            description: 'DynamoDB Table Name for Tool Definitions'
        });

        this.applyComponentTags(toolDefinitionsTable, 'ToolDefinitionsTable');
        return toolDefinitionsTable;
    }

    private createTagDefinitionsTable(): dynamodb.Table {
        const tagDefinitionsTable = new dynamodb.Table(this, 'TagDefinitionsTable', {
            partitionKey: {
                name: 'scope',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'tag',
                type: dynamodb.AttributeType.STRING
            },
            tableName: `pika-tag-def-${this.props.stackName}`,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
        });

        // DEPLOYMENT NOTE: When upgrading from chatappid-status-index to scope-status-index:
        // 1. First deploy: Keep this new GSI commented out, deploy to remove old index
        // 2. Wait for deletion to complete in AWS Console (check DynamoDB table)
        // 3. Second deploy: Uncomment the new GSI below and deploy again

        // Add GSI for querying by usage_mode (scope field) and status
        // This enables efficient queries for global tags (usage_mode='global')
        tagDefinitionsTable.addGlobalSecondaryIndex({
            indexName: 'scope-status-index',
            partitionKey: {
                name: 'usage_mode',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'status',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        new ssm.StringParameter(this, 'TagDefinitionsTableNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/pika_tag_def`,
            stringValue: tagDefinitionsTable.tableName,
            description: 'DynamoDB Table Name for Tag Definitions'
        });

        new ssm.StringParameter(this, 'TagDefinitionsTableArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/pika_tag_def_arn`,
            stringValue: tagDefinitionsTable.tableArn,
            description: 'DynamoDB Table ARN for Tag Definitions'
        });

        this.applyComponentTags(tagDefinitionsTable, 'TagDefinitionsTable');
        return tagDefinitionsTable;
    }

    private createSemanticDirectiveTable(): dynamodb.Table {
        const semanticDirectiveTable = new dynamodb.Table(this, 'SemanticDirectiveTable', {
            partitionKey: {
                name: 'scope',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'id',
                type: dynamodb.AttributeType.STRING
            },
            tableName: `semantic-directive-${this.props.stackName}`,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
        });

        // GSI1: Query by createdBy and sort by createDate
        semanticDirectiveTable.addGlobalSecondaryIndex({
            indexName: 'GSI1_byCreatedByDate',
            partitionKey: {
                name: 'created_by',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'create_date',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        // GSI2: Query by id when scope is unknown
        semanticDirectiveTable.addGlobalSecondaryIndex({
            indexName: 'GSI2_byId',
            partitionKey: {
                name: 'id',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'scope',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        // GSI3: Query by groupId and sort by createDate for CloudFormation custom resource
        semanticDirectiveTable.addGlobalSecondaryIndex({
            indexName: 'GSI3_byGroupId',
            partitionKey: {
                name: 'group_id',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'create_date',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        new ssm.StringParameter(this, 'SemanticDirectiveTableNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/semantic_directive`,
            stringValue: semanticDirectiveTable.tableName,
            description: 'DynamoDB Table Name for Semantic Directive'
        });

        new ssm.StringParameter(this, 'SemanticDirectiveTableArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/semantic_directive_arn`,
            stringValue: semanticDirectiveTable.tableArn,
            description: 'DynamoDB Table ARN for Semantic Directive'
        });

        this.applyComponentTags(semanticDirectiveTable, 'SemanticDirectiveTable');
        return semanticDirectiveTable;
    }

    // ===== SHARING SESSIONS FEATURE TABLES =====

    private createSharedSessionVisitHistoryTable(): dynamodb.Table {
        const sharedSessionVisitHistoryTable = new dynamodb.Table(this, 'SharedSessionVisitHistoryTable', {
            tableName: `shared-session-visit-history-${this.props.stackName}`,
            partitionKey: { name: 'user_id_chat_app_id', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'share_id', type: dynamodb.AttributeType.STRING },
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
        });

        // GSI for querying recent visits by timestamp
        sharedSessionVisitHistoryTable.addGlobalSecondaryIndex({
            indexName: 'recent-visits-index',
            partitionKey: { name: 'user_id_chat_app_id', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'last_visited_at', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL
        });

        sharedSessionVisitHistoryTable.addGlobalSecondaryIndex({
            indexName: 'test-shared-sessions-visits-index',
            partitionKey: {
                name: 'test_type',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'share_id',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        this.applyComponentTags(sharedSessionVisitHistoryTable, 'SharedSessionVisitHistoryTable');
        return sharedSessionVisitHistoryTable;
    }

    private createPinnedSessionTable(): dynamodb.Table {
        const pinnedSessionTable = new dynamodb.Table(this, 'PinnedSessionTable', {
            tableName: `pinned-session-${this.props.stackName}`,
            partitionKey: { name: 'user_id_chat_app_id', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'session_or_share_id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: true,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
        });

        // Add GSI for sorting by pinned_at in descending order
        pinnedSessionTable.addGlobalSecondaryIndex({
            indexName: 'user-chat-pinned-at-index',
            partitionKey: { name: 'user_id_chat_app_id', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'pinned_at', type: dynamodb.AttributeType.STRING }
        });

        pinnedSessionTable.addGlobalSecondaryIndex({
            indexName: 'test-pinned-sessions-index',
            partitionKey: {
                name: 'test_type',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'session_or_share_id',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });

        this.applyComponentTags(pinnedSessionTable, 'PinnedSessionTable');
        return pinnedSessionTable;
    }

    private createSessionRunnerMutexTable(): dynamodb.Table {
        const sessionRunnerMutexTable = new dynamodb.Table(this, 'SessionRunnerMutexTable', {
            partitionKey: {
                name: 'lock_name',
                type: dynamodb.AttributeType.STRING
            },
            tableName: `session-runner-mutex-${this.props.stackName}`,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'ttl' // Auto-cleanup stale locks
        });

        new ssm.StringParameter(this, 'SessionRunnerMutexTableNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/session_runner_mutex`,
            stringValue: sessionRunnerMutexTable.tableName,
            description: 'DynamoDB Table Name for Session Runner Mutex'
        });

        new ssm.StringParameter(this, 'SessionRunnerMutexTableArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/session_runner_mutex_arn`,
            stringValue: sessionRunnerMutexTable.tableArn,
            description: 'DynamoDB Table ARN for Session Runner Mutex'
        });

        this.applyComponentTags(sessionRunnerMutexTable, 'SessionRunnerMutexTable');
        return sessionRunnerMutexTable;
    }

    // Archive processor method
    private createArchiveProcessor(archiveStagingTable: dynamodb.Table, archiveBucket: s3.Bucket, pikaBucket: s3.Bucket): void {
        const duckdbLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'DuckDBLayer', `arn:aws:lambda:${this.props.region}:041475135427:layer:duckdb-nodejs-arm64:14`);

        const archiveProcessorRole = new iam.Role(this, 'ArchiveProcessorRole', {
            roleName: `archive-processor-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                MainPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:PutObject', 's3:PutObjectAcl', 's3:GetObject', 's3:GetObjectAcl', 's3:ListBucket', 's3:GetBucketLocation'],
                            resources: [archiveBucket.bucketArn, `${archiveBucket.bucketArn}/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:GetObject', 's3:DeleteObject', 's3:ListBucket'],
                            resources: [pikaBucket.bucketArn, `${pikaBucket.bucketArn}/*`]
                        })
                    ]
                })
            }
        });

        archiveStagingTable.grantReadWriteData(archiveProcessorRole);

        const archiveProcessor = new nodejs.NodejsFunction(this, 'ArchiveProcessor', {
            runtime: lambda.Runtime.NODEJS_22_X,
            architecture: lambda.Architecture.ARM_64,
            entry: 'src/lambda/archive-processor/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 3072,
            layers: [duckdbLayer],
            role: archiveProcessorRole,
            environment: {
                ARCHIVE_STAGING_TABLE_NAME: archiveStagingTable.tableName,
                ARCHIVE_BUCKET_NAME: archiveBucket.bucketName,
                PIKA_S3_BUCKET: pikaBucket.bucketName,
                STAGE: this.props.stage
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['duckdb', '@aws-sdk']
            }
        });

        const archiveSchedule = new events.Rule(this, 'ArchiveSchedule', {
            ruleName: `archive-schedule-${this.props.stackName}`,
            description: 'Hourly trigger for archive processor',
            schedule: events.Schedule.cron({
                minute: '5',
                hour: '*',
                day: '*',
                month: '*',
                year: '*'
            })
        });

        archiveSchedule.addTarget(
            new targets.LambdaFunction(archiveProcessor, {
                retryAttempts: 2
            })
        );

        new ssm.StringParameter(this, 'ArchiveProcessorArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/lambda/archive_processor_arn`,
            stringValue: archiveProcessor.functionArn,
            description: 'ARN of the Archive Processor Lambda'
        });

        new ssm.StringParameter(this, 'ArchiveProcessorNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/lambda/archive_processor_name`,
            stringValue: archiveProcessor.functionName,
            description: 'Name of the Archive Processor Lambda'
        });

        this.applyComponentTags(archiveProcessor, 'ArchiveProcessorLambda');
    }

    // IAM role creation methods
    private createBedrockChatRoleForInlineAgent(): iam.Role {
        return new iam.Role(this, 'BedrockChatRoleForInlineAgent', {
            roleName: `chat-role-inline-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
            inlinePolicies: {
                MainPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['bedrock:InvokeInlineAgent', 'bedrock:InvokeModelWithResponseStream', 'bedrock:InvokeModel'],
                            resources: ['arn:aws:bedrock:*::foundation-model/*', 'arn:aws:bedrock:*:*:inference-profile/*', 'arn:aws:bedrock:*:*:application-inference-profile/*']
                        })
                    ]
                })
            }
        });
    }

    private createChatLambdaRole(
        chatMessagesTable: dynamodb.Table,
        chatSessionTable: dynamodb.Table,
        chatUserTable: dynamodb.Table,
        chatAppTable: dynamodb.Table,
        tagDefinitionsTable: dynamodb.Table,
        bedrockChatRole: iam.Role,
        chatSessionFeedbackTable?: dynamodb.Table,
        openSearchDomain?: opensearch.Domain,
        sharedSessionVisitHistoryTable?: dynamodb.Table,
        pinnedSessionTable?: dynamodb.Table
    ): iam.Role {
        const lambdaRole = new iam.Role(this, 'PikaLambdaRole', {
            roleName: `lambda-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                MainPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sts:AssumeRole'],
                            resources: [`arn:aws:iam::${this.props.account}:role/*-${this.props.stackName}`, bedrockChatRole.roleArn]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
                            resources: ['arn:aws:bedrock:*::foundation-model/*', 'arn:aws:bedrock:*:*:inference-profile/*', 'arn:aws:bedrock:*:*:application-inference-profile/*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['bedrock:InvokeInlineAgent'],
                            resources: ['*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['iam:PassRole'],
                            resources: [bedrockChatRole.roleArn],
                            conditions: {
                                StringEquals: {
                                    'iam:PassedToService': 'bedrock.amazonaws.com'
                                }
                            }
                        }),
                        ...(openSearchDomain
                            ? [
                                  new iam.PolicyStatement({
                                      effect: iam.Effect.ALLOW,
                                      actions: ['es:*'],
                                      resources: [openSearchDomain.domainArn, `${openSearchDomain.domainArn}/*`]
                                  })
                              ]
                            : []),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
                            resources: [`arn:aws:ssm:${this.props.region}:${this.props.account}:parameter/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['execute-api:Invoke'],
                            resources: [`arn:aws:execute-api:${this.props.region}:${this.props.account}:*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:BatchGetItem',
                                'dynamodb:BatchWriteItem',
                                'dynamodb:ConditionCheckItem',
                                'dynamodb:DeleteItem',
                                'dynamodb:DescribeTable',
                                'dynamodb:GetItem',
                                'dynamodb:GetRecords',
                                'dynamodb:GetShardIterator',
                                'dynamodb:PutItem',
                                'dynamodb:Query',
                                'dynamodb:Scan',
                                'dynamodb:UpdateItem'
                            ],
                            resources: [
                                chatMessagesTable.tableArn,
                                chatSessionTable.tableArn,
                                `${chatSessionTable.tableArn}/*`,
                                chatUserTable.tableArn,
                                `${chatUserTable.tableArn}/index/*`,
                                ...(chatSessionFeedbackTable ? [chatSessionFeedbackTable.tableArn, `${chatSessionFeedbackTable.tableArn}/*`] : []),
                                chatAppTable.tableArn,
                                `${chatAppTable.tableArn}/*`,
                                ...(pinnedSessionTable ? [pinnedSessionTable.tableArn, `${pinnedSessionTable.tableArn}/*`] : []),
                                ...(sharedSessionVisitHistoryTable ? [sharedSessionVisitHistoryTable.tableArn, `${sharedSessionVisitHistoryTable.tableArn}/*`] : [])
                            ]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:Scan', 'dynamodb:BatchGetItem'],
                            resources: [tagDefinitionsTable.tableArn, `${tagDefinitionsTable.tableArn}/*`]
                        }),
                        // Memory permissions
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock-agentcore:CreateEvent',
                                'bedrock-agentcore:GetEvent',
                                'bedrock-agentcore:DeleteEvent',
                                'bedrock-agentcore:RetrieveMemoryRecords',
                                'bedrock-agentcore:ListMemoryRecords',
                                'bedrock-agentcore-control:ListMemories',
                                'bedrock-agentcore-control:GetMemory',
                                'bedrock-agentcore-control:CreateMemory',
                                'bedrock-agentcore-control:ListMemories'
                            ],
                            resources: ['*']
                        })
                    ]
                })
            }
        });

        chatMessagesTable.grantReadWriteData(lambdaRole);
        chatSessionTable.grantReadWriteData(lambdaRole);
        chatUserTable.grantReadWriteData(lambdaRole);

        if (sharedSessionVisitHistoryTable) {
            sharedSessionVisitHistoryTable.grantReadWriteData(lambdaRole);
        }
        if (pinnedSessionTable) {
            pinnedSessionTable.grantReadWriteData(lambdaRole);
        }

        return lambdaRole;
    }

    private createConverseFnLambdaRole(
        chatMessagesTable: dynamodb.Table,
        chatSessionTable: dynamodb.Table,
        chatUserTable: dynamodb.Table,
        chatAdminRestApi: apigateway.RestApi,
        agentDefinitionsTable: dynamodb.Table,
        toolDefinitionsTable: dynamodb.Table,
        tagDefinitionsTable: dynamodb.Table,
        semanticDirectiveTable: dynamodb.Table,
        pikaS3Bucket: s3.Bucket,
        chatAppTable: dynamodb.Table,
        chatSessionFeedbackTable?: dynamodb.Table,
        openSearchDomain?: opensearch.Domain
    ): iam.Role {
        const lambdaRole = new iam.Role(this, 'ConverseFnLambdaRole', {
            roleName: `conversefn-lambda-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                ChatbotLambdaUnifiedPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['bedrock:InvokeInlineAgent'],
                            resources: ['*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock:InvokeModel',
                                'bedrock:InvokeModelWithResponseStream',
                                'bedrock:UseInferenceProfile',
                                'bedrock:GetInferenceProfile',
                                'bedrock:GetFoundationModel'
                            ],
                            resources: ['arn:aws:bedrock:*::foundation-model/*', 'arn:aws:bedrock:*:*:inference-profile/*', 'arn:aws:bedrock:*:*:application-inference-profile/*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:BatchGetItem',
                                'dynamodb:BatchWriteItem',
                                'dynamodb:ConditionCheckItem',
                                'dynamodb:DeleteItem',
                                'dynamodb:DescribeTable',
                                'dynamodb:GetItem',
                                'dynamodb:GetRecords',
                                'dynamodb:GetShardIterator',
                                'dynamodb:PutItem',
                                'dynamodb:Query',
                                'dynamodb:Scan',
                                'dynamodb:UpdateItem'
                            ],
                            resources: [
                                chatMessagesTable.tableArn,
                                chatSessionTable.tableArn,
                                `${chatSessionTable.tableArn}/*`,
                                chatUserTable.tableArn,
                                `${chatUserTable.tableArn}/index/*`,
                                agentDefinitionsTable.tableArn,
                                toolDefinitionsTable.tableArn,
                                tagDefinitionsTable.tableArn,
                                `${tagDefinitionsTable.tableArn}/*`,
                                semanticDirectiveTable.tableArn,
                                `${semanticDirectiveTable.tableArn}/*`,
                                chatAppTable.tableArn,
                                ...(chatSessionFeedbackTable ? [chatSessionFeedbackTable.tableArn, `${chatSessionFeedbackTable.tableArn}/*`] : [])
                            ]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
                            resources: [`arn:aws:ssm:${this.props.region}:${this.props.account}:parameter/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['execute-api:Invoke'],
                            resources: [`arn:aws:execute-api:${this.props.region}:${this.props.account}:*/*/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['lambda:InvokeFunction'],
                            resources: [`arn:aws:lambda:${this.props.region}:${this.props.account}:function:*`],
                            conditions: {
                                StringEquals: {
                                    'aws:ResourceTag/agent-tool': 'true'
                                }
                            }
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['bedrock:Retrieve', 'bedrock:RetrieveAndGenerate'],
                            resources: [`arn:aws:bedrock:${this.props.region}:${this.props.account}:knowledge-base/*`],
                            conditions: {
                                StringEquals: {
                                    'aws:ResourceTag/agent-knowledgebase': 'true'
                                }
                            }
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['execute-api:Invoke'],
                            resources: [`arn:aws:execute-api:${this.props.region}:${this.props.account}:${chatAdminRestApi.restApiId}/${this.props.stage}/*/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:GetObject'],
                            resources: [`arn:aws:s3:::${pikaS3Bucket.bucketName}/*`]
                        }),
                        // Memory permissions
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock-agentcore:CreateEvent',
                                'bedrock-agentcore:GetEvent',
                                'bedrock-agentcore:DeleteEvent',
                                'bedrock-agentcore:RetrieveMemoryRecords',
                                'bedrock-agentcore:ListMemoryRecords',
                                'bedrock-agentcore-control:ListMemories',
                                'bedrock-agentcore-control:GetMemory',
                                'bedrock-agentcore-control:CreateMemory',
                                'bedrock-agentcore-control:ListMemories'
                            ],
                            resources: ['*']
                        }),
                        ...(openSearchDomain
                            ? [
                                  new iam.PolicyStatement({
                                      effect: iam.Effect.ALLOW,
                                      actions: ['es:*'],
                                      resources: [openSearchDomain.domainArn, `${openSearchDomain.domainArn}/*`]
                                  })
                              ]
                            : [])
                    ]
                })
            }
        });

        return lambdaRole;
    }

    // Lambda function creation methods
    private createChatbotApiFunction(
        lambdaRole: iam.Role,
        chatMessagesTable: dynamodb.Table,
        chatSessionTable: dynamodb.Table,
        chatUserTable: dynamodb.Table,
        chatAppTable: dynamodb.Table,
        tagDefinitionsTable: dynamodb.Table,
        chatSessionFeedbackTable?: dynamodb.Table,
        openSearchDomain?: opensearch.Domain,
        memoryId?: string,
        sharedSessionVisitHistoryTable?: dynamodb.Table,
        pinnedSessionTable?: dynamodb.Table
    ): lambda.Function {
        const fn = new nodejs.NodejsFunction(this, 'ChatbotApiFunction', {
            entry: 'src/api/chatbot/index.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_22_X,
            role: lambdaRole,
            architecture: lambda.Architecture.ARM_64,
            timeout: cdk.Duration.seconds(30),
            environment: {
                CHAT_MESSAGES_TABLE: chatMessagesTable.tableName,
                CHAT_SESSION_TABLE: chatSessionTable.tableName,
                CHAT_USER_TABLE: chatUserTable.tableName,
                CHAT_APP_TABLE: chatAppTable.tableName,
                TAG_DEFINITIONS_TABLE: tagDefinitionsTable.tableName,
                STAGE: this.props.stage,
                PIKA_SERVICE_PROJ_NAME_KEBAB_CASE: this.props.projNameKebabCase,
                ...(chatSessionFeedbackTable ? { CHAT_SESSION_FEEDBACK_TABLE: chatSessionFeedbackTable.tableName } : {}),
                ...(openSearchDomain ? { PIKA_DOMAIN_ENDPOINT: openSearchDomain.domainEndpoint } : {}),
                ...(memoryId ? { MEMORY_ID: memoryId } : {}),
                ...(sharedSessionVisitHistoryTable ? { SHARED_SESSION_VISIT_HISTORY_TABLE: sharedSessionVisitHistoryTable.tableName } : {}),
                ...(pinnedSessionTable ? { PINNED_SESSION_TABLE: pinnedSessionTable.tableName } : {})
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });
        this.applyComponentTags(fn, 'ChatbotApiLambda');
        return fn;
    }

    private createChatAdminApiFunction(
        agentDefinitionsTable: dynamodb.Table,
        toolDefinitionsTable: dynamodb.Table,
        chatAppTable: dynamodb.Table,
        chatUserTable: dynamodb.Table,
        chatSessionTable: dynamodb.Table,
        tagDefinitionsTable: dynamodb.Table,
        semanticDirectiveTable: dynamodb.Table,
        sharedSessionVisitHistoryTable: dynamodb.Table,
        pinnedSessionTable: dynamodb.Table,
        pikaS3Bucket: s3.Bucket,
        chatSessionFeedbackTable?: dynamodb.Table,
        openSearchDomain?: opensearch.Domain,
        memoryId?: string,
        memoryStrategies?: Partial<Record<UserMemoryStrategy, string>>
    ): [lambda.Function, apigateway.RestApi] {
        const lambdaRole = new iam.Role(this, 'ChatAdminApiLambdaRole', {
            roleName: `chat-admin-api-lambda-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                MainPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
                            resources: [`arn:aws:ssm:${this.props.region}:${this.props.account}:parameter/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:BatchGetItem',
                                'dynamodb:BatchWriteItem',
                                'dynamodb:ConditionCheckItem',
                                'dynamodb:DeleteItem',
                                'dynamodb:DescribeTable',
                                'dynamodb:GetItem',
                                'dynamodb:GetRecords',
                                'dynamodb:GetShardIterator',
                                'dynamodb:PutItem',
                                'dynamodb:Query',
                                'dynamodb:Scan',
                                'dynamodb:UpdateItem'
                            ],
                            resources: [
                                agentDefinitionsTable.tableArn,
                                `${agentDefinitionsTable.tableArn}/*`,
                                toolDefinitionsTable.tableArn,
                                `${toolDefinitionsTable.tableArn}/*`,
                                chatAppTable.tableArn,
                                `${chatAppTable.tableArn}/*`,
                                chatSessionTable.tableArn,
                                `${chatSessionTable.tableArn}/*`,
                                tagDefinitionsTable.tableArn,
                                `${tagDefinitionsTable.tableArn}/*`,
                                chatUserTable.tableArn,
                                `${chatUserTable.tableArn}/*`,
                                semanticDirectiveTable.tableArn,
                                `${semanticDirectiveTable.tableArn}/*`,
                                sharedSessionVisitHistoryTable.tableArn,
                                `${sharedSessionVisitHistoryTable.tableArn}/*`,
                                pinnedSessionTable.tableArn,
                                `${pinnedSessionTable.tableArn}/*`,
                                ...(chatSessionFeedbackTable ? [chatSessionFeedbackTable.tableArn, `${chatSessionFeedbackTable.tableArn}/*`] : [])
                            ]
                        }),
                        // Memory permissions
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock-agentcore:CreateEvent',
                                'bedrock-agentcore:GetEvent',
                                'bedrock-agentcore:DeleteEvent',
                                'bedrock-agentcore:RetrieveMemoryRecords',
                                'bedrock-agentcore:ListMemoryRecords',
                                'bedrock-agentcore-control:ListMemories',
                                'bedrock-agentcore-control:GetMemory',
                                'bedrock-agentcore-control:CreateMemory',
                                'bedrock-agentcore-control:ListMemories'
                            ],
                            resources: ['*']
                        }),
                        ...(openSearchDomain
                            ? [
                                  new iam.PolicyStatement({
                                      effect: iam.Effect.ALLOW,
                                      actions: ['es:*'],
                                      resources: [openSearchDomain.domainArn, `${openSearchDomain.domainArn}/*`]
                                  })
                              ]
                            : [])
                    ]
                })
            }
        });

        const chatAdminApiFn = new nodejs.NodejsFunction(this, 'ChatAdminApiFunction', {
            entry: 'src/api/chat-admin/index.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_22_X,
            role: lambdaRole,
            architecture: lambda.Architecture.ARM_64,
            timeout: cdk.Duration.seconds(300),
            environment: {
                AGENT_DEFINITIONS_TABLE: agentDefinitionsTable.tableName,
                TOOL_DEFINITIONS_TABLE: toolDefinitionsTable.tableName,
                CHAT_APP_TABLE: chatAppTable.tableName,
                CHAT_USER_TABLE: chatUserTable.tableName,
                CHAT_SESSION_TABLE: chatSessionTable.tableName,
                TAG_DEFINITIONS_TABLE: tagDefinitionsTable.tableName,
                SEMANTIC_DIRECTIVE_TABLE: semanticDirectiveTable.tableName,
                SHARED_SESSION_VISIT_HISTORY_TABLE: sharedSessionVisitHistoryTable.tableName,
                PINNED_SESSION_TABLE: pinnedSessionTable.tableName,
                PIKA_S3_BUCKET: pikaS3Bucket.bucketName,
                STAGE: this.props.stage,
                ...(chatSessionFeedbackTable ? { CHAT_SESSION_FEEDBACK_TABLE: chatSessionFeedbackTable.tableName } : {}),
                ...(openSearchDomain ? { PIKA_DOMAIN_ENDPOINT: openSearchDomain.domainEndpoint } : {}),
                ...(memoryId ? { MEMORY_ID: memoryId } : {}),
                ...(memoryStrategies ? { MEMORY_STRATEGIES: JSON.stringify(memoryStrategies) } : {})
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        const api = new apigateway.RestApi(this, 'ChatAdminApi', {
            restApiName: `chat-admin-${this.props.stage}`,
            description: 'API for agent and tool management',
            deployOptions: {
                stageName: this.props.stage
            },
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ['Content-Type', 'Authorization']
            },
            minCompressionSize: cdk.Size.mebibytes(1)
        });

        // Use proxy integration to avoid policy size limits
        const apiResource = api.root.addResource('api');
        const chatAdmin = apiResource.addResource('chat-admin');

        // Create a single proxy resource that handles all routes
        const proxyResource = chatAdmin.addResource('{proxy+}');

        // Single integration for all HTTP methods
        const integration = new apigateway.LambdaIntegration(chatAdminApiFn, {
            allowTestInvoke: false
        });

        // Add methods for all HTTP verbs needed
        proxyResource.addMethod('ANY', integration);
        chatAdmin.addMethod('ANY', integration);

        // Store API information in SSM parameters
        new ssm.StringParameter(this, 'ChatAdminApiUrlParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/api/chat_admin_url`,
            stringValue: api.url,
            description: 'URL of the Chat Admin API Gateway'
        });

        new ssm.StringParameter(this, 'ChatAdminApiIdParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/api/chat_admin_id`,
            stringValue: api.restApiId,
            description: 'API Gateway ID for the Chat Admin API'
        });

        this.applyComponentTags(chatAdminApiFn, 'ChatAdminApiLambda');
        this.applyComponentTags(api, 'ChatAdminApiGateway');
        return [chatAdminApiFn, api];
    }

    private createConverseFunction(
        converseFnLambdaRole: iam.Role,
        chatMessagesTable: dynamodb.Table,
        chatSessionTable: dynamodb.Table,
        chatUserTable: dynamodb.Table,
        tagDefinitionsTable: dynamodb.Table,
        semanticDirectiveTable: dynamodb.Table,
        chatAdminRestApi: apigateway.RestApi,
        agentDefinitionsTable: dynamodb.Table,
        toolDefinitionsTable: dynamodb.Table,
        pikaS3Bucket: s3.Bucket,
        agentPostProcessorFn: lambda.Function,
        openSearchDomain?: opensearch.Domain,
        memoryId?: string,
        inferenceProfileArns?: Record<string, string>
    ): lambda.Function {
        // Build environment variables for inference profiles
        // Use INFERENCE_PROFILE_ prefix so the lambda can discover them
        const inferenceProfileEnvVars: Record<string, string> = {};
        if (inferenceProfileArns) {
            Object.entries(inferenceProfileArns).forEach(([key, arn]) => {
                inferenceProfileEnvVars[`INFERENCE_PROFILE_${key}`] = arn;
            });
        }

        const converseFn = new nodejs.NodejsFunction(this, 'ConverseFunction', {
            entry: 'src/lambda/converse/index.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_22_X,
            role: converseFnLambdaRole,
            timeout: cdk.Duration.seconds(300),
            memorySize: 1024,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                CHAT_MESSAGES_TABLE: chatMessagesTable.tableName,
                CHAT_SESSION_TABLE: chatSessionTable.tableName,
                CHAT_USER_TABLE: chatUserTable.tableName,
                CHAT_ADMIN_API_ID: chatAdminRestApi.restApiId,
                AGENT_DEFINITIONS_TABLE: agentDefinitionsTable.tableName,
                TOOL_DEFINITIONS_TABLE: toolDefinitionsTable.tableName,
                TAG_DEFINITIONS_TABLE: tagDefinitionsTable.tableName,
                SEMANTIC_DIRECTIVE_TABLE: semanticDirectiveTable.tableName,
                PIKA_S3_BUCKET: pikaS3Bucket.bucketName,
                STAGE: this.props.stage,
                PIKA_SERVICE_PROJ_NAME_KEBAB_CASE: this.props.projNameKebabCase,
                ...(openSearchDomain ? { PIKA_DOMAIN_ENDPOINT: openSearchDomain.domainEndpoint } : {}),
                POST_PROCESSOR_FUNCTION_ARN: agentPostProcessorFn.functionArn,
                ...(memoryId ? { MEMORY_ID: memoryId } : {}),
                ...inferenceProfileEnvVars
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        this.applyComponentTags(converseFn, 'ConverseLambda');
        return converseFn;
    }
    private createAgentPostProcessorFunction(role: iam.Role): lambda.Function {
        const postProcessorFn = new nodejs.NodejsFunction(this, 'AgentPostProcessorFunction', {
            entry: 'src/lambda/agent-post-processor/index.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_22_X,
            functionName: `${this.props.stackName}-AgentPostProcessorFunction`,
            role: role,
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            architecture: lambda.Architecture.ARM_64,
            environment: {},
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        postProcessorFn.addPermission('AgentsInvokeFunction', {
            action: 'lambda:InvokeFunction',
            principal: new iam.ServicePrincipal('bedrock.amazonaws.com')
        });

        cdk.Tags.of(postProcessorFn).add('agent-tool', 'true');
        this.applyComponentTags(postProcessorFn, 'AgentPostProcessorLambda');

        return postProcessorFn;
    }

    private createAgentCustomResource(chatAdminRestApi: apigateway.RestApi): void {
        const agentCustomResourceRole = new iam.Role(this, 'AgentCustomResourceRole', {
            roleName: `agent-custom-resource-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                AgentCustomResourcePolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['execute-api:Invoke'],
                            resources: [`arn:aws:execute-api:${this.props.region}:${this.props.account}:${chatAdminRestApi.restApiId}/${this.props.stage}/*/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sts:GetCallerIdentity'],
                            resources: ['*']
                        })
                    ]
                })
            }
        });

        const agentCustomResourceLambda = new nodejs.NodejsFunction(this, 'AgentCustomResourceLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/agent-custom-resource/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 256,
            role: agentCustomResourceRole,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                CHAT_ADMIN_API_ID: chatAdminRestApi.restApiId,
                STAGE: this.props.stage
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        new ssm.StringParameter(this, 'AgentCustomResourceArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/lambda/agent_custom_resource_arn`,
            stringValue: agentCustomResourceLambda.functionArn,
            description: 'ARN of the Agent Custom Resource Lambda function'
        });

        this.applyComponentTags(agentCustomResourceLambda, 'AgentCustomResourceLambda');
    }

    private createChatAppCustomResource(chatAdminRestApi: apigateway.RestApi): void {
        const chatAppCustomResourceRole = new iam.Role(this, 'ChatAppCustomResourceRole', {
            roleName: `chat-app-custom-resource-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                ChatAppCustomResourcePolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['execute-api:Invoke'],
                            resources: [`arn:aws:execute-api:${this.props.region}:${this.props.account}:${chatAdminRestApi.restApiId}/${this.props.stage}/*/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sts:GetCallerIdentity'],
                            resources: ['*']
                        })
                    ]
                })
            }
        });

        const chatAppCustomResourceLambda = new nodejs.NodejsFunction(this, 'ChatAppCustomResourceLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/chat-app-custom-resource/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 256,
            role: chatAppCustomResourceRole,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                CHAT_ADMIN_API_ID: chatAdminRestApi.restApiId,
                STAGE: this.props.stage
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        new ssm.StringParameter(this, 'ChatAppCustomResourceArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/lambda/chat_app_custom_resource_arn`,
            stringValue: chatAppCustomResourceLambda.functionArn,
            description: 'ARN of the Chat App Custom Resource Lambda function'
        });

        this.applyComponentTags(chatAppCustomResourceLambda, 'ChatAppCustomResourceLambda');
    }

    private createSemanticDirectiveCustomResource(chatAdminRestApi: apigateway.RestApi): void {
        const semanticDirectiveCustomResourceRole = new iam.Role(this, 'SemanticDirectiveCustomResourceRole', {
            roleName: `semantic-directive-custom-resource-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                SemanticDirectiveCustomResourcePolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['execute-api:Invoke'],
                            resources: [`arn:aws:execute-api:${this.props.region}:${this.props.account}:${chatAdminRestApi.restApiId}/${this.props.stage}/*/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sts:GetCallerIdentity'],
                            resources: ['*']
                        })
                    ]
                })
            }
        });

        const semanticDirectiveCustomResourceLambda = new nodejs.NodejsFunction(this, 'SemanticDirectiveCustomResourceLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/semantic-directive-custom-resource/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 256,
            role: semanticDirectiveCustomResourceRole,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                CHAT_ADMIN_API_ID: chatAdminRestApi.restApiId,
                STAGE: this.props.stage
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        new ssm.StringParameter(this, 'SemanticDirectiveCustomResourceArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/lambda/semantic_directive_custom_resource_arn`,
            stringValue: semanticDirectiveCustomResourceLambda.functionArn,
            description: 'ARN of the Semantic Directive Custom Resource Lambda function'
        });

        this.applyComponentTags(semanticDirectiveCustomResourceLambda, 'SemanticDirectiveCustomResourceLambda');
    }

    private createTagDefinitionCustomResource(chatAdminRestApi: apigateway.RestApi): void {
        const tagDefinitionCustomResourceRole = new iam.Role(this, 'TagDefinitionCustomResourceRole', {
            roleName: `tag-definition-custom-resource-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                TagDefinitionCustomResourcePolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['execute-api:Invoke'],
                            resources: [`arn:aws:execute-api:${this.props.region}:${this.props.account}:${chatAdminRestApi.restApiId}/${this.props.stage}/*/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sts:GetCallerIdentity'],
                            resources: ['*']
                        })
                    ]
                })
            }
        });

        const tagDefinitionCustomResourceLambda = new nodejs.NodejsFunction(this, 'TagDefinitionCustomResourceLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/tag-definition-resource/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 256,
            role: tagDefinitionCustomResourceRole,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                CHAT_ADMIN_API_ID: chatAdminRestApi.restApiId,
                STAGE: this.props.stage
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        new ssm.StringParameter(this, 'TagDefinitionCustomResourceArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/lambda/tag_definition_custom_resource_arn`,
            stringValue: tagDefinitionCustomResourceLambda.functionArn,
            description: 'ARN of the Tag Definition Custom Resource Lambda function'
        });

        this.applyComponentTags(tagDefinitionCustomResourceLambda, 'TagDefinitionCustomResourceLambda');
    }

    private createDomainIndexCustomResource(): lambda.Function {
        const domainIndexCustomResourceRole = new iam.Role(this, 'DomainIndexCustomResourceRole', {
            roleName: `domain-index-custom-resource-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                DomainIndexCustomResourcePolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['es:*'],
                            resources: ['*'] // Need broad permissions to create indices in any OpenSearch domain
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sts:GetCallerIdentity'],
                            resources: ['*']
                        })
                    ]
                })
            }
        });

        const domainIndexCustomResourceLambda = new nodejs.NodejsFunction(this, 'DomainIndexCustomResourceLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/domainindex/domain-index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 256,
            role: domainIndexCustomResourceRole,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                STAGE: this.props.stage,
                ...this.getTagEnvironmentVariables()
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        new ssm.StringParameter(this, 'DomainIndexCustomResourceArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/lambda/domain_index_custom_resource_arn`,
            stringValue: domainIndexCustomResourceLambda.functionArn,
            description: 'ARN of the Domain Index Custom Resource Lambda function'
        });

        this.applyComponentTags(domainIndexCustomResourceLambda, 'DomainIndexCustomResourceLambda');
        return domainIndexCustomResourceLambda;
    }

    private createMemoryCustomResource(): lambda.Function {
        const memoryCustomResourceRole = new iam.Role(this, 'MemoryCustomResourceRole', {
            roleName: `memory-custom-resource-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                MemoryCustomResourcePolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock-agentcore:CreateEvent',
                                'bedrock-agentcore:GetEvent',
                                'bedrock-agentcore:DeleteEvent',
                                'bedrock-agentcore:RetrieveMemoryRecords',
                                'bedrock-agentcore:ListMemoryRecords',
                                'bedrock-agentcore:CreateMemory',
                                'bedrock-agentcore:GetMemory',
                                'bedrock-agentcore-control:ListMemories',
                                'bedrock-agentcore-control:GetMemory',
                                'bedrock-agentcore-control:CreateMemory',
                                'bedrock-agentcore-control:ListMemories'
                            ],
                            resources: ['*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['ssm:GetParameter', 'ssm:PutParameter', 'ssm:GetParameters'],
                            resources: [`arn:aws:ssm:${this.props.region}:${this.props.account}:parameter/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sts:GetCallerIdentity'],
                            resources: ['*']
                        })
                    ]
                })
            }
        });

        const memoryCustomResourceLambda = new nodejs.NodejsFunction(this, 'MemoryCustomResourceLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/memory-custom-resource/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 256,
            role: memoryCustomResourceRole,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                STAGE: this.props.stage,
                ...this.getTagEnvironmentVariables()
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        new ssm.StringParameter(this, 'MemoryCustomResourceArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/lambda/memory_custom_resource_arn`,
            stringValue: memoryCustomResourceLambda.functionArn,
            description: 'ARN of the Memory Custom Resource Lambda function'
        });

        this.applyComponentTags(memoryCustomResourceLambda, 'MemoryCustomResourceLambda');
        return memoryCustomResourceLambda;
    }

    private createInferenceProfileCustomResource(): lambda.Function {
        const inferenceProfileCustomResourceRole = new iam.Role(this, 'InferenceProfileCustomResourceRole', {
            roleName: `inference-profile-custom-resource-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                InferenceProfileCustomResourcePolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sts:AssumeRole'],
                            resources: [`arn:aws:iam::${this.props.account}:role/${this.props.stackName}-*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock:InvokeModel',
                                'bedrock:CreateInferenceProfile',
                                'bedrock:GetInferenceProfile',
                                'bedrock:ListInferenceProfiles',
                                'bedrock:DeleteInferenceProfile',
                                'bedrock:TagResource',
                                'bedrock:UntagResource',
                                'bedrock:ListTagsForResource'
                            ],
                            resources: ['arn:aws:bedrock:*::foundation-model/*', 'arn:aws:bedrock:*:*:inference-profile/*', 'arn:aws:bedrock:*:*:application-inference-profile/*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sts:GetCallerIdentity'],
                            resources: ['*']
                        })
                    ]
                })
            }
        });

        const inferenceProfileCustomResourceLambda = new nodejs.NodejsFunction(this, 'InferenceProfileCustomResourceLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/inference-profile-custom-resource/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 256,
            role: inferenceProfileCustomResourceRole,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                STAGE: this.props.stage,
                AWS_ACCOUNT_ID: this.props.account,
                ...this.getTagEnvironmentVariables()
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        new ssm.StringParameter(this, 'InferenceProfileCustomResourceArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/lambda/inference_profile_custom_resource_arn`,
            stringValue: inferenceProfileCustomResourceLambda.functionArn,
            description: 'ARN of the Inference Profile Custom Resource Lambda function'
        });

        this.applyComponentTags(inferenceProfileCustomResourceLambda, 'InferenceProfileCustomResourceLambda');
        return inferenceProfileCustomResourceLambda;
    }

    //TODO: get these from the config and let users override which models are used where
    private createInferenceProfileInstances(inferenceProfileCustomResourceLambda: lambda.Function): Record<string, string> {
        // Define the three Claude models we want to create inference profiles for
        // These map to the model keys in MODELS.ANTHROPIC in model-types-utils.ts
        const profiles = [
            {
                name: 'Claude4Sonnet',
                profileName: 'claude-sonnet-4',
                modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                provider: 'ANTHROPIC',
                modelKey: 'Claude4Sonnet'
            },
            {
                name: 'Claude4_5Haiku',
                profileName: 'claude-haiku-4-5',
                modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
                provider: 'ANTHROPIC',
                modelKey: 'Claude4_5Haiku'
            },
            {
                name: 'Claude4_5Sonnet',
                profileName: 'claude-sonnet-4-5',
                modelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
                provider: 'ANTHROPIC',
                modelKey: 'Claude4_5Sonnet'
            }
        ];

        const inferenceProfileArns: Record<string, string> = {};

        // Create inference profiles for cost tracking
        profiles.forEach((profile) => {
            // Prepare tags for this inference profile
            const tags: Array<{ key: string; value: string }> = [];

            // Add stack tags from config if provided, filtering out AWS system tags
            if (this.props.stackTags) {
                Object.entries(this.props.stackTags).forEach(([key, value]) => {
                    // AWS Bedrock does not allow system tags (aws:, cloudformation:, etc.)
                    if (!key.toLowerCase().startsWith('aws:') && !key.toLowerCase().startsWith('cloudformation:')) {
                        tags.push({ key, value });
                    } else {
                        console.log(`Skipping system tag for inference profile: ${key}`);
                    }
                });
            }

            // Add component-specific tag
            tags.push({
                key: 'component',
                value: `${profile.name}InferenceProfile`
            });

            // Log tags being applied for debugging
            console.log(`Creating inference profile ${profile.name} with ${tags.length} tag(s):`, JSON.stringify(tags, null, 2));

            // Create the custom resource for this inference profile
            const customResource = new cdk.CustomResource(this, `${profile.name}InferenceProfile`, {
                resourceType: 'Custom::CreateInferenceProfile',
                serviceToken: inferenceProfileCustomResourceLambda.functionArn,
                properties: {
                    inferenceProfileName: `${this.props.stackName}-${profile.profileName}`,
                    modelSource: {
                        copyFrom: `arn:aws:bedrock:${this.props.region}:${this.props.account}:inference-profile/${profile.modelId}`
                    },
                    description: `${profile.name} inference profile for ${this.props.projNameHuman}`,
                    tags: tags,
                    // Force CloudFormation to re-invoke the custom resource on each deployment
                    timestamp: new Date().toISOString()
                }
            });

            // Capture the ARN (physical resource ID) for use in Lambda environment variables
            // Format: {PROVIDER}_{MODEL_KEY} to match applyInferenceProfilesFromEnv pattern
            const envKey = `${profile.provider}_${profile.modelKey}`;
            inferenceProfileArns[envKey] = customResource.ref;

            // Store the ARN in SSM Parameter Store for local development
            new ssm.StringParameter(this, `${profile.name}InferenceProfileArnParameter`, {
                parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/inference-profile/${profile.modelKey}`,
                stringValue: customResource.ref,
                description: `Inference profile ARN for ${profile.name} (${profile.provider}.${profile.modelKey})`,
                tier: ssm.ParameterTier.STANDARD
            });
        });

        return inferenceProfileArns;
    }

    private createMemoryCustomResourceInstance(memoryCustomResourceLambda: lambda.Function): [string, Partial<Record<UserMemoryStrategy, string>>] {
        // Create custom resource to create/manage the memory
        const memoryCustomResource = new cdk.CustomResource(this, 'MemoryCustomResource', {
            serviceToken: memoryCustomResourceLambda.functionArn,
            properties: {
                MemoryName: this.sanitizeMemoryName(`${this.props.stackName}_user_memory`),
                Stage: this.props.stage,
                ProjNameKebabCase: this.props.projNameKebabCase,
                EventExpiryDuration: DEFAULT_EVENT_EXPIRY_DURATION,
                Strategies: DEFAULT_MEMORY_STRATEGIES,
                Timestamp: Date.now() // Forces update on every deploy
            }
        });

        const memoryId = memoryCustomResource.getAttString('MemoryId');

        // Extract strategy IDs from the custom resource response
        const strategiesRecord: Partial<Record<UserMemoryStrategy, string>> = {};
        for (const strategy of DEFAULT_MEMORY_STRATEGIES) {
            const strategyId = memoryCustomResource.getAttString(`StrategyId${strategy}`);
            strategiesRecord[strategy] = strategyId;
        }

        return [memoryId, strategiesRecord];
    }

    private createChatbotApi(chatbotApiFn: lambda.Function, userMemoryFeatureEnabled?: boolean): apigateway.RestApi {
        const api = new apigateway.RestApi(this, 'ChatbotApi', {
            restApiName: `chatbot-${this.props.stage}`,
            description: 'API for chatbot interactions',
            deployOptions: {
                stageName: this.props.stage
            },
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ['Content-Type', 'Authorization']
            },
            minCompressionSize: cdk.Size.mebibytes(1)
        });

        // Use proxy integration to avoid policy size limits
        const apiResource = api.root.addResource('api');
        const chat = apiResource.addResource('chat');

        // Create a single proxy resource that handles all routes
        const proxyResource = chat.addResource('{proxy+}');

        // Single integration for all HTTP methods
        const integration = new apigateway.LambdaIntegration(chatbotApiFn, {
            allowTestInvoke: false
        });

        proxyResource.addMethod('ANY', integration);
        chat.addMethod('ANY', integration);

        this.applyComponentTags(api, 'ChatbotApiGateway');
        return api;
    }

    private createOpenSearchDomain(stage: string, openSearchConfig: Record<string, SessionInsightsOpenSearchConfig> = {}): opensearch.Domain {
        let config: SessionInsightsOpenSearchConfig;

        const defaults: SessionInsightsOpenSearchConfig = {
            dedicatedMasterEnabled: false,
            zoneAwarenessEnabled: false,
            availabilityZoneCount: 0,
            dedicatedMasterCount: 0,
            dataNodeInstanceType: 'm5.large.search',
            masterNodeInstanceType: 'm5.large.search',
            dataNodeCount: 1,
            volumeSize: 10,
            volumeType: 'gp3'
        };

        if (openSearchConfig[stage]) {
            config = openSearchConfig[stage];
            config = { ...defaults, ...config };
        } else if (openSearchConfig.default) {
            config = openSearchConfig.default;
            config = { ...defaults, ...config };
        } else {
            config = defaults;
        }

        const domain = new opensearch.Domain(this, 'PikaDomain', {
            domainName: `${this.props.stackName}`,
            version: opensearch.EngineVersion.OPENSEARCH_2_19,
            enforceHttps: true,
            enableVersionUpgrade: true,
            encryptionAtRest: { enabled: true },
            nodeToNodeEncryption: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            ebs: {
                volumeSize: config.volumeSize ?? 10,
                volumeType: (config.volumeType ?? 'gp3') as ec2.EbsDeviceVolumeType
            },
            capacity: {
                dataNodeInstanceType: config.dataNodeInstanceType,
                dataNodes: config.dataNodeCount ?? 1,

                ...(config.dedicatedMasterEnabled
                    ? {
                          masterNodeInstanceType: config.masterNodeInstanceType,
                          masterNodes: config.dedicatedMasterCount ?? 0
                      }
                    : {})
            },
            zoneAwareness: config.zoneAwarenessEnabled
                ? {
                      enabled: true,
                      availabilityZoneCount: config.availabilityZoneCount ?? 2
                  }
                : { enabled: false }
        });

        new ssm.StringParameter(this, 'PikaDomainArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/opensearch/pika_domain_arn`,
            stringValue: domain.domainArn,
            description: 'ARN of the Pika OpenSearch Domain'
        });

        new ssm.StringParameter(this, 'PikaDomainNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/opensearch/pika_domain_name`,
            stringValue: domain.domainName,
            description: 'Name of the Pika OpenSearch Domain'
        });

        new ssm.StringParameter(this, 'PikaDomainEndpointParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/opensearch/pika_domain_endpoint`,
            stringValue: domain.domainEndpoint,
            description: 'Endpoint of the Pika OpenSearch Domain'
        });

        new ssm.StringParameter(this, 'PikaDomainIdParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/opensearch/pika_domain_id`,
            stringValue: domain.domainId,
            description: 'ID of the Pika OpenSearch Domain'
        });

        this.applyComponentTags(domain, 'OpenSearchDomain');
        return domain;
    }

    private createDomainIndexInitialization(openSearchDomain: opensearch.Domain, domainIndexCustomResourceLambda: lambda.Function): void {
        // Create custom resource to initialize session index
        const sessionIndexCustomResource = new cdk.CustomResource(this, 'SessionIndexCustomResource', {
            serviceToken: domainIndexCustomResourceLambda.functionArn,
            properties: {
                DomainEndpoint: openSearchDomain.domainEndpoint,
                DomainIndexName: 'session',
                Stage: this.props.stage,
                Timestamp: Date.now() // Forces update on every deploy
            }
        });

        // Ensure this custom resource runs after the domain is ready
        sessionIndexCustomResource.node.addDependency(openSearchDomain);

        // Create custom resource to initialize message index
        const messageIndexCustomResource = new cdk.CustomResource(this, 'MessageIndexCustomResource', {
            serviceToken: domainIndexCustomResourceLambda.functionArn,
            properties: {
                DomainEndpoint: openSearchDomain.domainEndpoint,
                DomainIndexName: 'message',
                Stage: this.props.stage,
                Timestamp: Date.now() // Forces update on every deploy
            }
        });

        // Ensure this custom resource runs after the domain is ready
        messageIndexCustomResource.node.addDependency(openSearchDomain);
    }

    private createGenerateSessionInsightsInfra(
        openSearchDomain: opensearch.Domain,
        chatSessionTable: dynamodb.Table,
        pikaS3Bucket: s3.Bucket,
        chatSessionFeedbackTable: dynamodb.Table,
        chatMessagesTable: dynamodb.Table
    ): void {
        // Create DynamoDB mutex table for session insights runner coordination
        const sessionRunnerMutexTable = this.createSessionRunnerMutexTable();

        // Create IAM role for session changed insights lambda
        const sessionChangedInsightsLambdaRole = new iam.Role(this, 'SessionChangedInsightsLambdaRole', {
            roleName: `session-changed-insights-lambda-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                MainPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:DescribeLogStreams', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:DescribeStream',
                                'dynamodb:GetRecords',
                                'dynamodb:GetShardIterator',
                                'dynamodb:ListStreams',
                                'dynamodb:PutItem',
                                'dynamodb:DeleteItem',
                                'dynamodb:UpdateItem',
                                'dynamodb:Query',
                                'dynamodb:Scan',
                                'dynamodb:BatchWriteItem'
                            ],
                            resources: [chatSessionTable.tableStreamArn!, chatSessionTable.tableArn, `${chatSessionTable.tableArn}/*`]
                        })
                    ]
                })
            }
        });

        // Create IAM role for insights runner lambda (main daemon)
        const sessionInsightsRunnerLambdaRole = new iam.Role(this, 'SessionInsightsRunnerLambdaRole', {
            roleName: `session-insights-runner-lambda-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                MainPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        // Bedrock permissions - copied from converse function
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'bedrock:InvokeModel',
                                'bedrock:InvokeModelWithResponseStream',
                                'bedrock:UseInferenceProfile',
                                'bedrock:GetInferenceProfile',
                                'bedrock:GetFoundationModel'
                            ],
                            resources: ['arn:aws:bedrock:*::foundation-model/*', 'arn:aws:bedrock:*:*:inference-profile/*', 'arn:aws:bedrock:*:*:application-inference-profile/*']
                        }),
                        // DynamoDB permissions for session and feedback operations
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:Query',
                                'dynamodb:Scan',
                                'dynamodb:GetItem',
                                'dynamodb:PutItem',
                                'dynamodb:UpdateItem',
                                'dynamodb:DeleteItem',
                                'dynamodb:BatchWriteItem',
                                'dynamodb:BatchGetItem'
                            ],
                            resources: [
                                chatMessagesTable.tableArn,
                                `${chatMessagesTable.tableArn}/*`,
                                chatSessionTable.tableArn,
                                `${chatSessionTable.tableArn}/*`,
                                chatSessionFeedbackTable.tableArn,
                                `${chatSessionFeedbackTable.tableArn}/*`
                            ]
                        }),
                        // S3 permissions for insights storage
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
                            resources: [`${pikaS3Bucket.bucketArn}/session-insights/*`]
                        }),
                        // DynamoDB permissions for mutex table
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:GetItem'],
                            resources: [sessionRunnerMutexTable.tableArn, `${sessionRunnerMutexTable.tableArn}/*`]
                        }),
                        // OpenSearch permissions
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['es:*'],
                            resources: [openSearchDomain.domainArn, `${openSearchDomain.domainArn}/*`]
                        })
                    ]
                })
            }
        });

        // Environment variables for insights lambdas
        const insightsEnvironment = {
            STAGE: this.props.stage,
            REGION: this.props.region,
            CHAT_MESSAGES_TABLE: chatMessagesTable.tableName,
            CHAT_SESSION_TABLE: chatSessionTable.tableName,
            CHAT_SESSION_FEEDBACK_TABLE: chatSessionFeedbackTable.tableName,
            PIKA_DOMAIN_ENDPOINT: openSearchDomain.domainEndpoint,
            PIKA_S3_BUCKET: pikaS3Bucket.bucketName,
            SESSION_RUNNER_MUTEX_TABLE: sessionRunnerMutexTable.tableName,
            WAIT_TO_COMPUTE_INSIGHTS_MS: '3600000', // 1 hour
            NOOP_EXECUTION: 'false'
        };

        // Create the session changed insights lambda
        const sessionChangedInsightsLambda = new nodejs.NodejsFunction(this, 'SessionChangedInsightsLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/session-changed-insights/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 256,
            role: sessionChangedInsightsLambdaRole,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                STAGE: this.props.stage,
                REGION: this.props.region,
                CHAT_SESSION_TABLE: chatSessionTable.tableName
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        // Create the session insights runner lambda (main daemon)
        const sessionInsightsRunnerLambda = new nodejs.NodejsFunction(this, 'SessionInsightsRunnerLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/session-insights-runner/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(15),
            memorySize: 1024,
            role: sessionInsightsRunnerLambdaRole,
            architecture: lambda.Architecture.ARM_64,
            environment: insightsEnvironment,
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        // Add DynamoDB stream event source to session changed insights lambda
        sessionChangedInsightsLambda.addEventSource(
            new DynamoEventSource(chatSessionTable, {
                startingPosition: lambda.StartingPosition.LATEST,
                batchSize: 10,
                maxBatchingWindow: cdk.Duration.seconds(5),
                retryAttempts: 10
            })
        );

        // Create EventBridge rule to trigger insights runner every minute
        const sessionInsightsSchedule = new events.Rule(this, 'SessionInsightsSchedule', {
            ruleName: `session-insights-schedule-${this.props.stackName}`,
            description: 'Triggers session insights runner every minute',
            schedule: events.Schedule.rate(cdk.Duration.minutes(1))
        });

        sessionInsightsSchedule.addTarget(
            new targets.LambdaFunction(sessionInsightsRunnerLambda, {
                retryAttempts: 0 // Don't retry - let next schedule handle it
            })
        );

        // Grant additional permissions
        chatSessionTable.grantReadWriteData(sessionInsightsRunnerLambda);
        chatSessionFeedbackTable.grantReadWriteData(sessionInsightsRunnerLambda);
        pikaS3Bucket.grantReadWrite(sessionInsightsRunnerLambda, 'session-insights/*');

        this.applyComponentTags(sessionChangedInsightsLambda, 'SessionChangedInsightsLambda');
        this.applyComponentTags(sessionInsightsRunnerLambda, 'SessionInsightsRunnerLambda');
    }

    /**
     * Sanitizes a memory name to meet AWS Bedrock memory naming requirements:
     * - Must start with a letter (a-z, A-Z)
     * - Can only contain letters, numbers, and underscores
     * - Maximum length of 48 characters
     */
    private sanitizeMemoryName(name: string): string {
        // Replace any character that's not a letter, number, or underscore with underscore
        let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');

        // Ensure it starts with a letter
        if (!/^[a-zA-Z]/.test(sanitized)) {
            sanitized = 'Memory_' + sanitized;
        }

        // Truncate to 48 characters if necessary
        if (sanitized.length > 48) {
            sanitized = sanitized.substring(0, 48);
        }

        return sanitized;
    }

    /**
     * Creates component tags based on the configured component tag names.
     * Returns an object with tag key-value pairs for all configured component tag names.
     * If no component tag names are configured, returns an empty object.
     *
     * @param componentValue The value to use for the component tag (e.g., 'ConverseLambda', 'ChatMessagesTable')
     * @returns Object with component tags, or empty object if no tag names configured
     *
     * @example
     * // If componentTagNames = ['component', 'resource-type']
     * // Returns: { component: 'ConverseLambda', 'resource-type': 'ConverseLambda' }
     * const tags = this.createComponentTags('ConverseLambda');
     */
    private createComponentTags(componentValue: string): Record<string, string> {
        if (!this.props.componentTagNames || this.props.componentTagNames.length === 0) {
            return {};
        }

        const tags: Record<string, string> = {};
        for (const tagName of this.props.componentTagNames) {
            tags[tagName] = componentValue;
        }
        return tags;
    }

    /**
     * Applies component tags to a CDK construct.
     * This is a convenience method to apply component tags to any CDK resource.
     * This method is public so it can be used by CustomStackDefs to tag custom resources.
     *
     * @param construct The CDK construct to tag
     * @param componentValue The value to use for the component tag
     *
     * @example
     * const lambda = new lambda.Function(this, 'MyLambda', { ... });
     * this.applyComponentTags(lambda, 'MyLambda');
     */
    public applyComponentTags(construct: Construct, componentValue: string): void {
        const tags = this.createComponentTags(componentValue);
        for (const [key, value] of Object.entries(tags)) {
            cdk.Tags.of(construct).add(key, value);
        }
    }

    /**
     * Validates that tag environment variables don't exceed size limits.
     * AWS Lambda has a 4KB total limit for environment variables.
     * We conservatively limit tags to 500 bytes to leave room for other env vars.
     *
     * @param envVars - The environment variables to validate
     * @throws Error if tag environment variables exceed the size limit
     */
    private validateTagEnvironmentVariableSize(envVars: Record<string, string>): void {
        const MAX_TAG_ENV_SIZE = 500; // Conservative limit to leave room for other env vars

        let totalSize = 0;
        if (envVars.STACK_TAGS) {
            totalSize += envVars.STACK_TAGS.length;
        }
        if (envVars.COMPONENT_TAG_NAMES) {
            totalSize += envVars.COMPONENT_TAG_NAMES.length;
        }

        if (totalSize > MAX_TAG_ENV_SIZE) {
            throw new Error(
                `Tag environment variables exceed size limit. ` +
                    `Total size: ${totalSize} bytes, maximum: ${MAX_TAG_ENV_SIZE} bytes. ` +
                    `STACK_TAGS size: ${envVars.STACK_TAGS?.length || 0} bytes, ` +
                    `COMPONENT_TAG_NAMES size: ${envVars.COMPONENT_TAG_NAMES?.length || 0} bytes. ` +
                    `Please reduce the number or length of tags in your pika-config.ts stackTags configuration.`
            );
        }
    }

    /**
     * Get environment variables for passing tags to Lambda custom resource functions.
     * Returns STACK_TAGS and COMPONENT_TAG_NAMES as JSON strings that can be parsed by the lambda.
     *
     * Use this to pass tagging configuration to custom resource lambdas so they can tag
     * the AWS resources they create (e.g., Bedrock inference profiles, OpenSearch indices, etc.).
     *
     * @returns Environment variables object to spread into Lambda environment config
     * @throws Error if tag environment variables exceed size limits
     *
     * @example
     * const lambda = new nodejs.NodejsFunction(this, 'MyCustomResource', {
     *     environment: {
     *         ...this.getTagEnvironmentVariables(),
     *         OTHER_VAR: 'value'
     *     }
     * });
     */
    private getTagEnvironmentVariables(): Record<string, string> {
        const envVars: Record<string, string> = {};

        // Add stack tags if configured
        if (this.props.stackTags && Object.keys(this.props.stackTags).length > 0) {
            envVars.STACK_TAGS = JSON.stringify(this.props.stackTags);
        }

        // Add component tag names if configured
        if (this.props.componentTagNames && this.props.componentTagNames.length > 0) {
            envVars.COMPONENT_TAG_NAMES = JSON.stringify(this.props.componentTagNames);
        }

        // Validate size limits
        this.validateTagEnvironmentVariableSize(envVars);

        return envVars;
    }
}
