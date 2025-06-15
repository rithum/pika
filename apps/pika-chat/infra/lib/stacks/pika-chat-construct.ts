import * as cdk from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol, SslPolicy } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface PikaChatConstructProps {
    /**
     * The stage/environment name (e.g., 'dev', 'staging', 'prod')
     */
    stage: string;

    /**
     * VPC to deploy the service into
     */
    vpc: ec2.IVpc;

    /**
     * Certificate ARN for HTTPS
     */
    certificateArn: string;

    /**
     * Base domain name (e.g., 'example.com')
     */
    baseDomain: string;

    /**
     * Subdomain prefix for the pika chat webapp (e.g., 'chat' for chat.example.com)
     */
    subdomainPrefix?: string;

    /**
     * Hosted Zone ID for Route53
     */
    hostedZoneId: string;

    /**
     * Path to the directory containing the Dockerfile (relative to this construct file)
     */
    dockerBuildPath: string;

    /**
     * Additional environment variables to add to the ECS task
     */
    additionalEnvironmentVariables?: Record<string, string>;

    /**
     * CPU units for the Fargate task (default: 512)
     */
    cpu?: number;

    /**
     * Memory limit in MiB for the Fargate task (default: 2048)
     */
    memoryLimitMiB?: number;

    /**
     * Desired count of running tasks (default: 1)
     */
    desiredCount?: number;

    /**
     * Container port (default: 3000)
     */
    containerPort?: number;

    /**
     * Health check path (default: '/health')
     */
    healthCheckPath?: string;

    /**
     * Log retention period (default: ONE_WEEK)
     */
    logRetention?: RetentionDays;

    /**
     * Project name in all lowercase e.g. pikachat
     */
    projNameL: string;

    /**
     * Project name in title case e.g. PikaChat
     */
    projNameTitleCase: string;

    /**
     * Project name in camel case e.g. pikaChat
     */
    projNameCamel: string;

    /**
     * Project name in kebab case e.g. pika-chat
     */
    projNameKebabCase: string;

    /**
     * Project name in human readable e.g. Pika Chat
     */
    projNameHuman: string;

    /**
     * Project name in kebab case for the pika service stack e.g. pika
     */
    pikaServiceProjNameKebabCase: string;
}

export class PikaChatConstruct extends Construct {
    public readonly service: ecs_patterns.ApplicationLoadBalancedFargateService;
    public readonly cluster: ecs.Cluster;
    public readonly dockerImage: ecr_assets.DockerImageAsset;
    public readonly taskRole: iam.Role;
    public readonly domain: string;

    constructor(scope: Construct, id: string, props: PikaChatConstructProps) {
        super(scope, id);

        //BXTODO
        // Build the full domain name
        const subdomainPrefix = props.subdomainPrefix || 'chat';
        this.domain = `${subdomainPrefix}.${props.baseDomain}`;

        // Create Docker image asset
        this.dockerImage = new ecr_assets.DockerImageAsset(this, `${props.projNameTitleCase}Image`, {
            directory: props.dockerBuildPath,
            buildArgs: {
                BUILDPLATFORM: 'linux/amd64',
            },
            platform: ecr_assets.Platform.LINUX_AMD64,
        });

        // Store the image URI in SSM for reference by other services
        new ssm.StringParameter(this, `${props.projNameTitleCase}EcrImageUriParam`, {
            parameterName: `/stack/${props.projNameKebabCase}/${props.stage}/ecr/${props.projNameKebabCase}-image-uri`,
            stringValue: this.dockerImage.imageUri,
            description: `URI of the ${props.projNameHuman} Docker image in ECR`,
        });

        // Create ECS cluster
        this.cluster = new ecs.Cluster(this, `${props.projNameTitleCase}Cluster`, {
            vpc: props.vpc,
        });

        // Param comes from the pika service stack
        const apiId = ssm.StringParameter.valueForStringParameter(
            this,
            `/stack/${props.pikaServiceProjNameKebabCase}/${props.stage}/api/id`
        );

        // Param comes from the pika service stack
        const chatAdminApiId = ssm.StringParameter.valueForStringParameter(
            this,
            `/stack/${props.pikaServiceProjNameKebabCase}/${props.stage}/api/chat_admin_id`
        );

        // Param comes from the pika service stack
        const converseFnUrl = ssm.StringParameter.valueForStringParameter(
            this,
            `/stack/${props.pikaServiceProjNameKebabCase}/${props.stage}/function/converse_url`
        );

        // Param comes from the pika service stack
        const chatAppTableArn = ssm.StringParameter.valueForStringParameter(
            this,
            `/stack/${props.pikaServiceProjNameKebabCase}/${props.stage}/ddb_table/chat_app_table_arn`
        );

        // Param comes from the pika service stack
        const uploadS3Bucket = ssm.StringParameter.valueForStringParameter(
            this,
            `/stack/${props.pikaServiceProjNameKebabCase}/${props.stage}/s3/upload_bucket_name`
        );

        // Param comes from the pika service stack
        const uploadS3BucketArn = ssm.StringParameter.valueForStringParameter(
            this,
            `/stack/${props.pikaServiceProjNameKebabCase}/${props.stage}/s3/upload_bucket_arn`
        );

        // Create task role with necessary permissions
        this.taskRole = new iam.Role(this, `${props.projNameTitleCase}TaskRole`, {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            inlinePolicies: {
                ExecuteApiPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['execute-api:Invoke'],
                            resources: [
                                `arn:aws:execute-api:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:${apiId}/*`,
                                `arn:aws:execute-api:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:${chatAdminApiId}/*`,
                            ],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['ssm:GetParameter', 'ssm:GetParameters'],
                            resources: [`arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/*`],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['lambda:InvokeFunctionUrl', 'lambda:InvokeFunction'],
                            resources: [
                                ssm.StringParameter.valueForStringParameter(
                                    this,
                                    `/stack/${props.pikaServiceProjNameKebabCase}/${props.stage}/function/converse_arn` // Comes from the pika service stack
                                ),
                            ],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['sts:GetCallerIdentity'],
                            resources: ['*'],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:Scan', 'dynamodb:BatchGetItem'],
                            resources: [chatAppTableArn],
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:GetObject',
                                's3:PutObject',
                                's3:DeleteObject',
                                's3:GetObjectAcl',
                                's3:PutObjectAcl',
                                's3:PutObjectTagging',
                            ],
                            resources: [uploadS3BucketArn, `${uploadS3BucketArn}/*`],
                        }),
                    ],
                }),
            },
        });

        // Build environment variables
        const baseEnvironmentVariables = {
            STAGE: props.stage,
            ENV: props.stage,
            AWS_REGION: cdk.Aws.REGION,
            AWS_ACCOUNT_ID: cdk.Aws.ACCOUNT_ID,
            CHAT_API_ID: apiId,
            CHAT_ADMIN_API_ID: chatAdminApiId,
            WEBAPP_URL: `https://${this.domain}`,
            UPLOAD_S3_BUCKET: uploadS3Bucket,
            CONVERSE_FUNCTION_URL: converseFnUrl,
        };

        const environmentVariables = {
            ...baseEnvironmentVariables,
            ...props.additionalEnvironmentVariables,
        };

        // Create log group first to preserve logical ID
        const logGroup = new LogGroup(this, `${props.projNameTitleCase}LogGroup`, {
            logGroupName: `/ecs/${props.projNameTitleCase}-${props.stage}`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            retention: props.logRetention || RetentionDays.ONE_WEEK,
        });

        // Create the Fargate service
        this.service = new ecs_patterns.ApplicationLoadBalancedFargateService(
            this,
            `${props.projNameTitleCase}FargateService`,
            {
                cluster: this.cluster,
                cpu: props.cpu || 512,
                desiredCount: props.desiredCount || 1,
                protocol: ApplicationProtocol.HTTPS,
                sslPolicy: SslPolicy.RECOMMENDED_TLS,
                enableExecuteCommand: false,
                memoryLimitMiB: props.memoryLimitMiB || 2048,
                publicLoadBalancer: true,
                taskImageOptions: {
                    containerName: `${props.projNameTitleCase}Task-${props.stage}`,
                    image: ecs.ContainerImage.fromDockerImageAsset(this.dockerImage),
                    containerPort: props.containerPort || 3000,
                    environment: environmentVariables,
                    taskRole: this.taskRole,
                    enableLogging: true,
                    logDriver: ecs.LogDriver.awsLogs({
                        streamPrefix: `${props.projNameTitleCase}-${props.stage}`,
                        logGroup: logGroup,
                    }),
                },
                certificate: Certificate.fromCertificateArn(
                    this,
                    `${props.projNameTitleCase}Certificate-${props.stage}`,
                    props.certificateArn
                ),
                enableECSManagedTags: true,
                domainName: this.domain,
                domainZone: HostedZone.fromHostedZoneAttributes(
                    this,
                    `${props.projNameTitleCase}DomainZone-${props.stage}`,
                    {
                        hostedZoneId: props.hostedZoneId,
                        zoneName: props.baseDomain,
                    }
                ),
                redirectHTTP: true,
                loadBalancerName: `${props.projNameTitleCase}LoadBalancer-${props.stage}`,
                minHealthyPercent: 50,
            }
        );

        // Configure health check
        this.service.targetGroup.configureHealthCheck({
            path: props.healthCheckPath || '/health',
            port: 'traffic-port',
            unhealthyThresholdCount: 5,
            timeout: cdk.Duration.seconds(60),
            interval: cdk.Duration.seconds(90),
        });

        // Output the service URL
        new cdk.CfnOutput(this, 'ServiceUrl', {
            value: `https://${this.domain}`,
            description: `${props.projNameHuman} Service URL`,
        });

        // Output the load balancer DNS name
        new cdk.CfnOutput(this, `${props.projNameTitleCase}LoadBalancerDns`, {
            value: this.service.loadBalancer.loadBalancerDnsName,
            description: `${props.projNameHuman} Load Balancer DNS Name`,
        });
    }
}
