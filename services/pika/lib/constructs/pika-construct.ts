import { SessionInsightsFeature, SessionInsightsOpenSearchConfig } from '@pika/shared/types/chatbot/chatbot-types';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource, SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { CustomResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
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
    sessionInsightsFeature: SessionInsightsFeature;
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

        // Create storage resources
        const storageResources = this.createStorageResources(openSearchDomain);

        if (openSearchDomain && storageResources.chatSessionFeedbackTable) {
            this.createGenerateSessionInsightsInfra(openSearchDomain, storageResources.chatSessionTable, storageResources.pikaS3Bucket, storageResources.chatSessionFeedbackTable);
        }

        // Create compute resources
        const computeResources = this.createComputeResources(storageResources, openSearchDomain);

        // Create API resources
        const apiResources = this.createApiResources(storageResources, computeResources);

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
        const chatMessagesTable = this.createChatMessagesTable(pikaS3Bucket, fileArchiveBucket, archiveStagingTable);
        const chatSessionTable = this.createChatSessionTable(pikaS3Bucket, fileArchiveBucket, archiveStagingTable, openSearchDomain);

        // If they didn't turn on insights, they don't get the feedback feature
        const chatSessionFeedbackTable: cdk.aws_dynamodb.Table | undefined = openSearchDomain ? this.createChatSessionFeedbackTable(openSearchDomain, chatSessionTable) : undefined;

        const chatUserTable = this.createChatUserTable();
        const chatAppTable = this.createChatAppTable();
        const agentDefinitionsTable = this.createAgentDefinitionsTable();
        const toolDefinitionsTable = this.createToolDefinitionsTable();

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
            toolDefinitionsTable
        };
    }

    private createComputeResources(storageResources: any, openSearchDomain?: opensearch.Domain) {
        // Create IAM roles
        const bedrockChatRole = this.createBedrockChatRoleForInlineAgent();
        const lambdaRole = this.createChatLambdaRole(
            storageResources.chatMessagesTable,
            storageResources.chatSessionTable,
            storageResources.chatUserTable,
            bedrockChatRole,
            storageResources.chatSessionFeedbackTable,
            openSearchDomain
        );

        // Create Lambda functions
        const chatbotApiFn = this.createChatbotApiFunction(
            lambdaRole,
            storageResources.chatMessagesTable,
            storageResources.chatSessionTable,
            storageResources.chatUserTable,
            storageResources.chatSessionFeedbackTable,
            openSearchDomain
        );

        const [chatAdminApiFn, chatAdminRestApi] = this.createChatAdminApiFunction(
            storageResources.agentDefinitionsTable,
            storageResources.toolDefinitionsTable,
            storageResources.chatAppTable,
            storageResources.chatUserTable,
            storageResources.chatSessionFeedbackTable,
            openSearchDomain
        );

        // Create custom resources
        this.createAgentCustomResource(chatAdminRestApi);
        this.createChatAppCustomResource(chatAdminRestApi);
        const domainIndexCustomResourceLambda = this.createDomainIndexCustomResource();

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
            storageResources.pikaS3Bucket,
            storageResources.chatAppTable,
            storageResources.chatSessionFeedbackTable,
            openSearchDomain
        );

        const converseFn = this.createConverseFunction(
            converseFnLambdaRole,
            storageResources.chatMessagesTable,
            storageResources.chatSessionTable,
            storageResources.chatUserTable,
            chatAdminRestApi,
            storageResources.agentDefinitionsTable,
            storageResources.toolDefinitionsTable,
            storageResources.pikaS3Bucket,
            openSearchDomain
        );

        return {
            bedrockChatRole,
            lambdaRole,
            converseFnLambdaRole,
            chatbotApiFn,
            chatAdminApiFn,
            chatAdminRestApi,
            converseFn,
            openSearchDomain
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
    private createPikaS3Bucket(): s3.Bucket {
        console.log(`Creating pika S3 bucket ${this.props.stackName}`);
        return new s3.Bucket(this, 'PikaS3Bucket', {
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

    private createChatMessagesTable(pikaS3Bucket: s3.Bucket, fileArchiveBucket: s3.Bucket, archiveStagingTable: dynamodb.Table): dynamodb.Table {
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
                PIKA_S3_BUCKET: pikaS3Bucket.bucketName,
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

        chatSessionTable.addGlobalSecondaryIndex({
            indexName: 'user-chat-app-index',
            partitionKey: {
                name: 'user_id',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'chat_app_id',
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
        bedrockChatRole: iam.Role,
        chatSessionFeedbackTable?: dynamodb.Table,
        openSearchDomain?: opensearch.Domain
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
                            resources: [
                                chatMessagesTable.tableArn,
                                chatSessionTable.tableArn,
                                `${chatSessionTable.tableArn}/*`,
                                chatUserTable.tableArn,
                                `${chatUserTable.tableArn}/index/*`,
                                ...(chatSessionFeedbackTable ? [chatSessionFeedbackTable.tableArn, `${chatSessionFeedbackTable.tableArn}/*`] : [])
                            ]
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
                            resources: ['arn:aws:bedrock:*::foundation-model/*', 'arn:aws:bedrock:*:*:inference-profile/*']
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
                                chatAppTable.tableArn,
                                ...(chatSessionFeedbackTable ? [chatSessionFeedbackTable.tableArn, `${chatSessionFeedbackTable.tableArn}/*`] : [])
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
        chatSessionFeedbackTable?: dynamodb.Table,
        openSearchDomain?: opensearch.Domain
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
                PIKA_SERVICE_PROJ_NAME_KEBAB_CASE: this.props.projNameKebabCase,
                ...(chatSessionFeedbackTable ? { CHAT_SESSION_FEEDBACK_TABLE: chatSessionFeedbackTable.tableName } : {}),
                ...(openSearchDomain ? { PIKA_DOMAIN_ENDPOINT: openSearchDomain.domainEndpoint } : {})
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
        chatAppTable: dynamodb.Table,
        chatUserTable: dynamodb.Table,
        chatSessionFeedbackTable?: dynamodb.Table,
        openSearchDomain?: opensearch.Domain
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
                            resources: [
                                agentDefinitionsTable.tableArn,
                                toolDefinitionsTable.tableArn,
                                chatAppTable.tableArn,
                                ...(chatSessionFeedbackTable ? [chatSessionFeedbackTable.tableArn, `${chatSessionFeedbackTable.tableArn}/*`] : [])
                            ]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:BatchGetItem',
                                'dynamodb:DescribeTable',
                                'dynamodb:GetItem',
                                'dynamodb:GetRecords',
                                'dynamodb:GetShardIterator',
                                'dynamodb:Query',
                                'dynamodb:Scan'
                            ],
                            resources: [chatUserTable.tableArn, `${chatUserTable.tableArn}/index/*`]
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
                STAGE: this.props.stage,
                ...(chatSessionFeedbackTable ? { CHAT_SESSION_FEEDBACK_TABLE: chatSessionFeedbackTable.tableName } : {}),
                ...(openSearchDomain ? { PIKA_DOMAIN_ENDPOINT: openSearchDomain.domainEndpoint } : {})
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

        const chatAppByRules = chatAdmin.addResource('chat-app-by-rules');
        chatAppByRules.addMethod('POST', new apigateway.LambdaIntegration(chatAdminApiFn), {
            authorizationType: apigateway.AuthorizationType.IAM
        });

        chatApp.addMethod('GET', new apigateway.LambdaIntegration(chatAdminApiFn));
        chatApp.addMethod('POST', new apigateway.LambdaIntegration(chatAdminApiFn));

        const chatAppById = chatApp.addResource('{chatAppId}');
        chatAppById.addMethod('GET', new apigateway.LambdaIntegration(chatAdminApiFn));
        chatAppById.addMethod('PUT', new apigateway.LambdaIntegration(chatAdminApiFn));

        const chatAppOverride = chatAppById.addResource('override');
        chatAppOverride.addMethod('POST', new apigateway.LambdaIntegration(chatAdminApiFn));
        chatAppOverride.addMethod('DELETE', new apigateway.LambdaIntegration(chatAdminApiFn));

        // Session management endpoints
        const session = chatAdmin.addResource('session');

        // POST /api/chat-admin/session/search
        const sessionSearch = session.addResource('search');
        sessionSearch.addMethod('POST', new apigateway.LambdaIntegration(chatAdminApiFn));

        // POST /api/chat-admin/session/feedback
        const feedback = session.addResource('feedback');
        feedback.addMethod('POST', new apigateway.LambdaIntegration(chatAdminApiFn));

        // PUT /api/chat-admin/session/feedback
        feedback.addMethod('PUT', new apigateway.LambdaIntegration(chatAdminApiFn));

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
        pikaS3Bucket: s3.Bucket,
        openSearchDomain?: opensearch.Domain
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
                PIKA_S3_BUCKET: pikaS3Bucket.bucketName,
                STAGE: this.props.stage,
                PIKA_SERVICE_PROJ_NAME_KEBAB_CASE: this.props.projNameKebabCase,
                ...(openSearchDomain ? { PIKA_DOMAIN_ENDPOINT: openSearchDomain.domainEndpoint } : {})
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
                STAGE: this.props.stage
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

        return domainIndexCustomResourceLambda;
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

        // GET /api/chat/conversations/{chatAppId}
        const conversationsByChatAppId = conversations.addResource('{chatAppId}');
        conversationsByChatAppId.addMethod('GET', new apigateway.LambdaIntegration(chatbotApiFn));

        // GET /api/chat/user
        const userResource = chats.addResource('user');
        userResource.addMethod('GET', new apigateway.LambdaIntegration(chatbotApiFn));

        // GET /api/chat/user/search/{partialUserId}
        const search = userResource.addResource('search');
        const searchByPartialUserId = search.addResource('{partialUserId}');
        searchByPartialUserId.addMethod('GET', new apigateway.LambdaIntegration(chatbotApiFn));

        // POST /api/chat/user
        userResource.addMethod('POST', new apigateway.LambdaIntegration(chatbotApiFn));

        // POST /api/chat/feedback
        const feedback = chats.addResource('feedback');
        feedback.addMethod('POST', new apigateway.LambdaIntegration(chatbotApiFn));

        // GET /api/chat/feedback/{sessionId}
        const feedbackBySessionId = feedback.addResource('{sessionId}');
        feedbackBySessionId.addMethod('GET', new apigateway.LambdaIntegration(chatbotApiFn));

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
    }

    private createGenerateSessionInsightsInfra(
        openSearchDomain: opensearch.Domain,
        chatSessionTable: dynamodb.Table,
        pikaS3Bucket: s3.Bucket,
        chatSessionFeedbackTable: dynamodb.Table
    ): void {
        // Create SQS queue for session insights runner scheduling
        const sessionInsightsRunnerQueue = new sqs.Queue(this, 'SessionInsightsRunnerQueue', {
            queueName: `session-insights-queue-${this.props.stackName}`,
            visibilityTimeout: cdk.Duration.minutes(16), // 16 minutes for 15-minute lambda timeout
            //TODO: do we want to use a dead letter queue? Do we need an alert for this then?
            deadLetterQueue: {
                queue: new sqs.Queue(this, 'SessionInsightsRunnerDeadLetterQueue', {
                    queueName: `session-insights-dlq-${this.props.stackName}`
                }),
                maxReceiveCount: 3
            }
        });

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
                            resources: ['arn:aws:bedrock:*::foundation-model/*', 'arn:aws:bedrock:*:*:inference-profile/*']
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
                            resources: [chatSessionTable.tableArn, `${chatSessionTable.tableArn}/*`, chatSessionFeedbackTable.tableArn, `${chatSessionFeedbackTable.tableArn}/*`]
                        }),
                        // S3 permissions for insights storage
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
                            resources: [`${pikaS3Bucket.bucketArn}/session-insights/*`]
                        }),
                        // SQS permissions for scheduling
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
                            resources: [sessionInsightsRunnerQueue.queueArn]
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

        // Create IAM role for initial trigger lambda
        const sessionInsightsInitialTriggerLambdaRole = new iam.Role(this, 'SessionInsightsInitialTriggerLambdaRole', {
            roleName: `session-insights-initial-trigger-lambda-role-${this.props.stackName}`,
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                MainPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['arn:aws:logs:*:*:*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sqs:SendMessage'],
                            resources: [sessionInsightsRunnerQueue.queueArn]
                        })
                    ]
                })
            }
        });

        // Environment variables for insights lambdas
        const insightsEnvironment = {
            STAGE: this.props.stage,
            REGION: this.props.region,
            CHAT_SESSION_TABLE: chatSessionTable.tableName,
            CHAT_SESSION_FEEDBACK_TABLE: chatSessionFeedbackTable.tableName,
            PIKA_DOMAIN_ENDPOINT: openSearchDomain.domainEndpoint,
            PIKA_S3_BUCKET: pikaS3Bucket.bucketName,
            SESSION_INSIGHTS_RUNNER_QUEUE: sessionInsightsRunnerQueue.queueUrl,
            WAIT_TO_COMPUTE_INSIGHTS_MS: '3600000', // 1 hour
            EXECUTE_RUNNER_EVERY_MS: '60000', // 1 minute
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

        // Create the initial trigger lambda
        const sessionInsightsInitialTriggerLambda = new nodejs.NodejsFunction(this, 'SessionInsightsInitialTriggerLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: 'src/lambda/session-insights-initial-trigger/index.ts',
            handler: 'handler',
            timeout: cdk.Duration.minutes(5),
            memorySize: 256,
            role: sessionInsightsInitialTriggerLambdaRole,
            architecture: lambda.Architecture.ARM_64,
            environment: {
                SESSION_INSIGHTS_RUNNER_QUEUE: sessionInsightsRunnerQueue.queueUrl
            },
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

        // Add SQS event source to session insights runner lambda
        sessionInsightsRunnerLambda.addEventSource(
            new SqsEventSource(sessionInsightsRunnerQueue, {
                batchSize: 1,
                maxBatchingWindow: cdk.Duration.seconds(1)
            })
        );

        // Create custom resource to trigger initial insights runner execution
        const sessionInsightsInitialTriggerCustomResource = new CustomResource(this, 'SessionInsightsInitialTriggerCustomResource', {
            serviceToken: sessionInsightsInitialTriggerLambda.functionArn,
            properties: {
                QueueUrl: sessionInsightsRunnerQueue.queueUrl,
                // Force update on every deployment
                Timestamp: Date.now()
            }
        });

        // Ensure custom resource depends on queue and session table
        sessionInsightsInitialTriggerCustomResource.node.addDependency(sessionInsightsRunnerQueue);
        sessionInsightsInitialTriggerCustomResource.node.addDependency(chatSessionTable);

        // Grant additional permissions
        chatSessionTable.grantReadWriteData(sessionInsightsRunnerLambda);
        chatSessionFeedbackTable.grantReadWriteData(sessionInsightsRunnerLambda);
        pikaS3Bucket.grantReadWrite(sessionInsightsRunnerLambda, 'session-insights/*');
    }
}
