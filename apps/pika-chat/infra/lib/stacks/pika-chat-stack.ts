import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { PikaChatConstruct, PikaChatConstructProps } from './pika-chat-construct.js';
import { addStackResoucesAfterWeCreateThePikaChatConstruct, addStackResoucesBeforeWeCreateThePikaChatConstruct, getPikaChatConstructProps } from './custom-stack-defs.js';

const __filename = fileURLToPath(import.meta.url);

// This is the directory where the stack is located which is `apps/chatbot/infra/lib/stacks`
const __dirname = path.dirname(__filename);

export interface PikaChatStackProps extends cdk.StackProps {
    stage: string;
    vpcId: string;
    projNameL: string; // All lowercase e.g. pikachat
    projNameTitleCase: string; // Title case e.g. PikaChat
    projNameCamel: string; // Camel case e.g. pikaChat
    projNameKebabCase: string; // Kebab case e.g. pika-chat
    projNameHuman: string; // Human readable e.g. Pika Chat
    pikaServiceProjNameKebabCase: string; // Kebab case for the pika service stack e.g. pika
}

export class PikaChatStack extends cdk.Stack {
    private stage: string;
    public readonly webapp: PikaChatConstruct;

    constructor(scope: Construct, id: string, props: PikaChatStackProps) {
        super(scope, id, props);

        this.stage = props.stage;

        // Get VPC
        const vpc = ec2.Vpc.fromLookup(this, `${props.projNameCamel}Vpc`, {
            vpcId: props.vpcId
        });

        //BXTODO
        // Get pika-specific configurations from SSM
        const baseDomain = ssm.StringParameter.valueForStringParameter(this, `/pika/${this.stage}/route53/public-domain-name`);

        //BXTODO
        const certificateArn = ssm.StringParameter.valueForStringParameter(this, `/pika/${this.stage}/acm/certificate-arn`);

        //BXTODO
        const hostedZoneId = ssm.StringParameter.valueForStringParameter(this, `/pika/${this.stage}/route53/public-hosted-zone-id`);

        addStackResoucesBeforeWeCreateThePikaChatConstruct(this);

        const pikaChatConstructProps: PikaChatConstructProps = getPikaChatConstructProps(
            {
                stage: this.stage,
                vpc: vpc,
                certificateArn: certificateArn,
                baseDomain: baseDomain,
                subdomainPrefix: 'chat',
                hostedZoneId: hostedZoneId,
                dockerBuildPath: path.resolve(__dirname, '../../../'), // Path to the root of your project where Dockerfile is located
                additionalEnvironmentVariables: {},
                projNameL: props.projNameL,
                projNameTitleCase: props.projNameTitleCase,
                projNameCamel: props.projNameCamel,
                projNameKebabCase: props.projNameKebabCase,
                projNameHuman: props.projNameHuman,
                pikaServiceProjNameKebabCase: props.pikaServiceProjNameKebabCase
            },
            this
        );

        // Create the chatbot webapp using the construct
        this.webapp = new PikaChatConstruct(this, 'PikaChatConstruct', pikaChatConstructProps);

        addStackResoucesAfterWeCreateThePikaChatConstruct(this);
    }
}
