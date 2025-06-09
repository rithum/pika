import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';

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
}

export interface PikaConstructOutputs {
    uploadS3Bucket: s3.Bucket;
    fileArchiveBucket: s3.Bucket;
    chatMessagesTable: dynamodb.Table;
    chatSessionTable: dynamodb.Table;
    chatUserTable: dynamodb.Table;
    chatAppTable: dynamodb.Table;
    agentDefinitionsTable: dynamodb.Table;
    toolDefinitionsTable: dynamodb.Table;
    archiveStagingTable: dynamodb.Table;
    chatbotApi: apigateway.RestApi;
    chatAdminApi: apigateway.RestApi;
    converseFunctionUrl: string;
}

export class PikaConstruct extends Construct {
    public readonly outputs: PikaConstructOutputs;
    private readonly props: PikaConstructProps;

    constructor(scope: Construct, id: string, props: PikaConstructProps) {
        super(scope, id);
        
        this.props = props;

        // Create storage resources
        const storageResources = this.createStorageResources();
        
        // Create compute resources
        const computeResources = this.createComputeResources(storageResources);
        
        // Create API resources
        const apiResources = this.createApiResources(storageResources, computeResources);
        
        // Create SSM parameters
        this.createSsmParameters(storageResources, computeResources, apiResources);

        this.outputs = {
            uploadS3Bucket: storageResources.uploadS3Bucket,
            fileArchiveBucket: storageResources.fileArchiveBucket,
            archiveStagingTable: storageResources.archiveStagingTable,
            chatMessagesTable: storageResources.chatMessagesTable,
            chatSessionTable: storageResources.chatSessionTable,
            chatUserTable: storageResources.chatUserTable,
            chatAppTable: storageResources.chatAppTable,
            agentDefinitionsTable: storageResources.agentDefinitionsTable,
            toolDefinitionsTable: storageResources.toolDefinitionsTable,
            chatbotApi: apiResources.chatbotApi,
            chatAdminApi: apiResources.chatAdminApi,
            converseFunctionUrl: apiResources.converseFunctionUrl
        };
    }

    private createStorageResources() {
        // S3 Buckets
        const uploadS3Bucket = this.createUploadS3Bucket();
        const fileArchiveBucket = this.createFileArchiveBucket();
        
        // DynamoDB Tables
        const archiveStagingTable = this.createArchiveStagingTable();
        const chatMessagesTable = this.createChatMessagesTable(uploadS3Bucket, fileArchiveBucket, archiveStagingTable);
        const chatSessionTable = this.createChatSessionTable(fileArchiveBucket, archiveStagingTable);
        const chatUserTable = this.createChatUserTable();
        const chatAppTable = this.createChatAppTable();
        const agentDefinitionsTable = this.createAgentDefinitionsTable();
        const toolDefinitionsTable = this.createToolDefinitionsTable();

        // Create the archive processor after tables are created
        this.createArchiveProcessor(archiveStagingTable, fileArchiveBucket, uploadS3Bucket);

        return {
            uploadS3Bucket,
            fileArchiveBucket,
            archiveStagingTable,
            chatMessagesTable,
            chatSessionTable,
            chatUserTable,
            chatAppTable,
            agentDefinitionsTable,
            toolDefinitionsTable
        };
    }

    private createComputeResources(storageResources: any) {
        // Create IAM roles
        const bedrockChatRole = this.createBedrockChatRoleForInlineAgent();
        const lambdaRole = this.createChatLambdaRole(
            storageResources.chatMessagesTable,
            storageResources.chatSessionTable,
            storageResources.chatUserTable,
            bedrockChatRole
        );

        // Create Lambda functions
        const chatbotApiFn = this.createChatbotApiFunction(
            lambdaRole,
            storageResources.chatMessagesTable,
            storageResources.chatSessionTable,
            storageResources.chatUserTable
        );

        const [chatAdminApiFn, chatAdminRestApi] = this.createChatAdminApiFunction(
            storageResources.agentDefinitionsTable,
            storageResources.toolDefinitionsTable,
            storageResources.chatAppTable
        );

        // Create custom resources
        this.createAgentCustomResource(chatAdminRestApi);
        this.createChatAppCustomResource(chatAdminRestApi);

        const converseFnLambdaRole = this.createConverseFnLambdaRole(
            storageResources.chatMessagesTable,
            storageResources.chatSessionTable,
            storageResources.chatUserTable,
            chatAdminRestApi,
            storageResources.agentDefinitionsTable,
            storageResources.toolDefinitionsTable,
            storageResources.uploadS3Bucket,
            storageResources.chatAppTable
        );

        const converseFn = this.createConverseFunction(
            converseFnLambdaRole,
            storageResources.chatMessagesTable,
            storageResources.chatSessionTable,
            storageResources.chatUserTable,
            chatAdminRestApi,
            storageResources.agentDefinitionsTable,
            storageResources.toolDefinitionsTable,
            storageResources.uploadS3Bucket
        );

        return {
            bedrockChatRole,
            lambdaRole,
            converseFnLambdaRole,
            chatbotApiFn,
            chatAdminApiFn,
            chatAdminRestApi,
            converseFn
        };
    }

    private createApiResources(storageResources: any, computeResources: any) {
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
        const chatbotApi = this.createChatbotApi(computeResources.chatbotApiFn);

        return {
            chatbotApi,
            chatAdminApi: computeResources.chatAdminRestApi,
            converseFunctionUrl: converseUrl.url
        };
    }

    private createSsmParameters(storageResources: any, computeResources: any, apiResources: any) {
        // S3 bucket parameters
        new ssm.StringParameter(this, 'UploadS3BucketNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/s3/upload_bucket_name`,
            stringValue: storageResources.uploadS3Bucket.bucketName,
            description: 'Name of the S3 bucket for file uploads'
        });

        new ssm.StringParameter(this, 'UploadS3BucketArnParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/s3/upload_bucket_arn`,
            stringValue: storageResources.uploadS3Bucket.bucketArn,
            description: 'ARN of the S3 bucket for file uploads'
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
    }

    // Storage creation methods
    private createUploadS3Bucket(): s3.Bucket {
        console.log(`Creating upload S3 bucket file-uploads-${this.props.stackName}`);
        return new s3.Bucket(this, 'UploadS3Bucket', {
            bucketName: `file-uploads-${this.props.stackName}`,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            lifecycleRules: [
                {
                    id: 'DeleteUnconfirmedChatFiles',
                    enabled: true,
                    expiration: cdk.Duration.days(2),
                    tagFilters: {
                        chat: 'true',
                        confirmed: 'false'
                    }
                }
            ]
        });
    }

    private createFileArchiveBucket(): s3.Bucket {
        console.log(`Creating archive S3 bucket file-archive-${this.props.stackName}`);
        return new s3.Bucket(this, 'FileArchiveBucket', {
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

        return archiveStagingTable;
    }

    private createChatMessagesTable(
        uploadS3Bucket: s3.Bucket,
        fileArchiveBucket: s3.Bucket,
        archiveStagingTable: dynamodb.Table
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
                            resources: [uploadS3Bucket.bucketArn, `${uploadS3Bucket.bucketArn}/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:PutObject', 's3:PutObjectTagging', 's3:GetObject', 's3:GetObjectTagging', 's3:ListBucket'],
                            resources: [fileArchiveBucket.bucketArn, `${fileArchiveBucket.bucketArn}/*`]
                        })
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
                UPLOAD_S3_BUCKET: uploadS3Bucket.bucketName,
                STAGING_TABLE_NAME: archiveStagingTable.tableName,
                REGION: this.props.region
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

        return chatMessagesTable;
    }

    private createChatSessionTable(fileArchiveBucket: s3.Bucket, archiveStagingTable: dynamodb.Table): dynamodb.Table {
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
                            actions: ['dynamodb:DescribeStream', 'dynamodb:GetRecords', 'dynamodb:GetShardIterator', 'dynamodb:ListStreams'],
                            resources: [chatSessionTable.tableStreamArn!]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:PutObject', 's3:PutObjectTagging', 's3:GetObject', 's3:GetObjectTagging', 's3:ListBucket'],
                            resources: [fileArchiveBucket.bucketArn, `${fileArchiveBucket.bucketArn}/*`]
                        })
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
                REGION: this.props.region
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

        return chatSessionTable;
    }

    private createChatUserTable(): dynamodb.Table {
        return new dynamodb.Table(this, 'ChatUserTable', {
            partitionKey: {
                name: 'user_id',
                type: dynamodb.AttributeType.STRING
            },
            tableName: `chat-user-${this.props.stackName}`,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: this.props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY
        });
    }

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

        new ssm.StringParameter(this, 'AgentDefinitionsTableNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/agent_definitions`,
            stringValue: agentDefinitionsTable.tableName,
            description: 'DynamoDB Table Name for Agent Definitions'
        });

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

        new ssm.StringParameter(this, 'ToolDefinitionsTableNameParam', {
            parameterName: `/stack/${this.props.projNameKebabCase}/${this.props.stage}/ddb_table/tool_definitions`,
            stringValue: toolDefinitionsTable.tableName,
            description: 'DynamoDB Table Name for Tool Definitions'
        });

        return toolDefinitionsTable;
    }

    // Archive processor method
    private createArchiveProcessor(archiveStagingTable: dynamodb.Table, archiveBucket: s3.Bucket, uploadBucket: s3.Bucket): void {
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
                            resources: [uploadBucket.bucketArn, `${uploadBucket.bucketArn}/*`]
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
                UPLOAD_S3_BUCKET: uploadBucket.bucketName,
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
                            resources: ['arn:aws:bedrock:*::foundation-model/*', 'arn:aws:bedrock:*:*:inference-profile/*']
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
        bedrockChatRole: iam.Role
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
                            resources: ['arn:aws:bedrock:*::foundation-model/*', 'arn:aws:bedrock:*:*:inference-profile/*']
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
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['ssm:GetParameter', 'ssm:GetParameters'],
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
                            resources: [chatMessagesTable.tableArn, chatSessionTable.tableArn, chatUserTable.tableArn]
                        })
                    ]
                })
            }
        });

        chatMessagesTable.grantReadWriteData(lambdaRole);
        chatSessionTable.grantReadWriteData(lambdaRole);
        chatUserTable.grantReadWriteData(lambdaRole);

        return lambdaRole;
    }

    private createConverseFnLambdaRole(
        chatMessagesTable: dynamodb.Table,
        chatSessionTable: dynamodb.Table,
        chatUserTable: dynamodb.Table,
        chatAdminRestApi: apigateway.RestApi,
        agentDefinitionsTable: dynamodb.Table,
        toolDefinitionsTable: dynamodb.Table,
        uploadS3Bucket: s3.Bucket,
        chatAppTable: dynamodb.Table
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
                            actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
                            resources: [
                                'arn:aws:bedrock:*::foundation-model/*',
                                'arn:aws:bedrock:*:*:inference-profile/*'
                            ]
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
                                chatUserTable.tableArn,
                                agentDefinitionsTable.tableArn,
                                toolDefinitionsTable.tableArn,
                                chatAppTable.tableArn
                            ]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['ssm:GetParameter', 'ssm:GetParameters'],
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
                            actions: ['execute-api:Invoke'],
                            resources: [`arn:aws:execute-api:${this.props.region}:${this.props.account}:${chatAdminRestApi.restApiId}/${this.props.stage}/*/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:GetObject'],
                            resources: [`arn:aws:s3:::${uploadS3Bucket.bucketName}/*`]
                        })
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
        chatUserTable: dynamodb.Table
    ): lambda.Function {
        return new nodejs.NodejsFunction(this, 'ChatbotApiFunction', {
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
                STAGE: this.props.stage,
                PIKA_SERVICE_PROJ_NAME_KEBAB_CASE: this.props.projNameKebabCase
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });
    }

    private createChatAdminApiFunction(
        agentDefinitionsTable: dynamodb.Table,
        toolDefinitionsTable: dynamodb.Table,
        chatAppTable: dynamodb.Table
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
                            actions: ['ssm:GetParameter', 'ssm:GetParameters'],
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
                            resources: [agentDefinitionsTable.tableArn, toolDefinitionsTable.tableArn, chatAppTable.tableArn]
                        })
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
                STAGE: this.props.stage
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
            }
        });

        const apiResource = api.root.addResource('api');
        const chatAdmin = apiResource.addResource('chat-admin');

        // Agent data endpoint
        const agentData = chatAdmin.addResource('agent-data');
        agentData.addMethod('POST', new apigateway.LambdaIntegration(chatAdminApiFn), {
            authorizationType: apigateway.AuthorizationType.IAM
        });

        // Agent management endpoints
        const agent = chatAdmin.addResource('agent');
        agent.addMethod('GET', new apigateway.LambdaIntegration(chatAdminApiFn));
        agent.addMethod('POST', new apigateway.LambdaIntegration(chatAdminApiFn));

        const agentById = agent.addResource('{agentId}');
        agentById.addMethod('GET', new apigateway.LambdaIntegration(chatAdminApiFn));
        agentById.addMethod('PUT', new apigateway.LambdaIntegration(chatAdminApiFn));

        // Tool management endpoints
        const tool = chatAdmin.addResource('tool');
        tool.addMethod('GET', new apigateway.LambdaIntegration(chatAdminApiFn));
        tool.addMethod('POST', new apigateway.LambdaIntegration(chatAdminApiFn));
        tool.addMethod('PUT', new apigateway.LambdaIntegration(chatAdminApiFn));

        const toolSearch = tool.addResource('search');
        toolSearch.addMethod('POST', new apigateway.LambdaIntegration(chatAdminApiFn));

        const toolById = tool.addResource('{toolId}');
        toolById.addMethod('GET', new apigateway.LambdaIntegration(chatAdminApiFn));

        // Chat App management endpoints
        const chatApp = chatAdmin.addResource('chat-app');
        const chatAppData = chatAdmin.addResource('chat-app-data');
        chatAppData.addMethod('POST', new apigateway.LambdaIntegration(chatAdminApiFn), {
            authorizationType: apigateway.AuthorizationType.IAM
        });

        chatApp.addMethod('GET', new apigateway.LambdaIntegration(chatAdminApiFn));
        chatApp.addMethod('POST', new apigateway.LambdaIntegration(chatAdminApiFn));

        const chatAppById = chatApp.addResource('{chatAppId}');
        chatAppById.addMethod('GET', new apigateway.LambdaIntegration(chatAdminApiFn));
        chatAppById.addMethod('PUT', new apigateway.LambdaIntegration(chatAdminApiFn));

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

        return [chatAdminApiFn, api];
    }

    private createConverseFunction(
        converseFnLambdaRole: iam.Role,
        chatMessagesTable: dynamodb.Table,
        chatSessionTable: dynamodb.Table,
        chatUserTable: dynamodb.Table,
        chatAdminRestApi: apigateway.RestApi,
        agentDefinitionsTable: dynamodb.Table,
        toolDefinitionsTable: dynamodb.Table,
        uploadS3Bucket: s3.Bucket
    ): lambda.Function {
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
                UPLOAD_S3_BUCKET: uploadS3Bucket.bucketName,
                STAGE: this.props.stage,
                PIKA_SERVICE_PROJ_NAME_KEBAB_CASE: this.props.projNameKebabCase
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: 'node22',
                externalModules: ['@aws-sdk']
            }
        });

        return converseFn;
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
    }

    private createChatbotApi(chatbotApiFn: lambda.Function): apigateway.RestApi {
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
            }
        });

        const apiResource = api.root.addResource('api');
        const chats = apiResource.addResource('chat');
        const sessionResource = chats.addResource('{sessionId}');

        // GET /api/chat/{sessionId}/messages
        const messages = sessionResource.addResource('messages');
        messages.addMethod('GET', new apigateway.LambdaIntegration(chatbotApiFn));

        // POST /api/chat/{sessionId}/message
        sessionResource.addMethod('POST', new apigateway.LambdaIntegration(chatbotApiFn));

        // POST /api/chat/{sessionId}/title
        const title = sessionResource.addResource('title');
        title.addMethod('POST', new apigateway.LambdaIntegration(chatbotApiFn));

        // GET /api/chat/conversations
        const conversations = chats.addResource('conversations');
        conversations.addMethod('GET', new apigateway.LambdaIntegration(chatbotApiFn));

        // GET /api/chat/user
        const userResource = chats.addResource('user');
        userResource.addMethod('GET', new apigateway.LambdaIntegration(chatbotApiFn));

        // POST /api/chat/user
        userResource.addMethod('POST', new apigateway.LambdaIntegration(chatbotApiFn));

        return api;
    }
} 