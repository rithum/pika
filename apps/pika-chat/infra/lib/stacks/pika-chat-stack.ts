import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CustomStackDefs } from './custom-stack-defs.js';
import { PartialPikaChatConstructProps, PikaChatConstruct, PikaChatConstructProps } from './pika-chat-construct.js';

const __filename = fileURLToPath(import.meta.url);

// This is the directory where the stack is located which is `apps/chatbot/infra/lib/stacks`
const __dirname = path.dirname(__filename);

export interface PikaChatStackProps extends cdk.StackProps {
    stage: string;
    projNameL: string; // All lowercase e.g. pikachat
    projNameTitleCase: string; // Title case e.g. PikaChat
    projNameCamel: string; // Camel case e.g. pikaChat
    projNameKebabCase: string; // Kebab case e.g. pika-chat
    projNameHuman: string; // Human readable e.g. Pika Chat
    pikaServiceProjNameKebabCase: string; // Kebab case for the pika service stack e.g. pika
}

/**
 * You must make changes to the CustomStackDefs class to add your own customizations to the pika stack.
 */
export class PikaChatStack extends cdk.Stack {
    private stage: string;
    public readonly webapp: PikaChatConstruct;
    public stageParam: cdk.CfnParameter;
    public stageCappedParam: cdk.CfnParameter;

    constructor(scope: Construct, id: string, props: PikaChatStackProps) {
        super(scope, id, props);

        this.stage = props.stage;

        //TODO: check for the existence of an input param named stage and if not provided, add it as a required input param with no default value
        this.stageParam = new cdk.CfnParameter(this, 'stage', {
            type: 'String',
            description: 'The stage/environment name (e.g., dev, staging, prod)',
            allowedPattern: '^[a-zA-Z0-9-]+$',
            constraintDescription: 'Stage must contain only alphanumeric characters and hyphens',
        });

        this.stageCappedParam = new cdk.CfnParameter(this, 'Stage', {
            type: 'String',
            description: 'The stage/environment name capitalized (e.g., Dev, Staging, Prod)',
            allowedPattern: '^[a-zA-Z0-9-]+$',
            constraintDescription: 'Stage must contain only alphanumeric characters and hyphens',
        });

        const customStackDefs = new CustomStackDefs(this);

        // Get VPC
        // const vpc = ec2.Vpc.fromLookup(this, `${props.projNameCamel}Vpc`, {
        //     vpcId: props.vpcId
        // });

        //BXTODO
        // Get pika-specific configurations from SSM
        //const baseDomain = ssm.StringParameter.valueForStringParameter(this, `/pika/${this.stage}/route53/public-domain-name`);
        // const baseDomain = 'bogus-fix.com';

        //BXTODO
        //const certificateArn = ssm.StringParameter.valueForStringParameter(this, `/pika/${this.stage}/acm/certificate-arn`);
        // const certificateArn = 'bogus-fix-cert-arn';

        //BXTODO
        //const hostedZoneId = ssm.StringParameter.valueForStringParameter(this, `/pika/${this.stage}/route53/public-hosted-zone-id`);
        // const hostedZoneId = 'bogus-fix-hosted-zone-id';

        customStackDefs.addStackResoucesBeforeWeCreateThePikaChatConstruct();

        const partialProps: PartialPikaChatConstructProps = {
            stage: this.stage,
            dockerBuildPath: path.resolve(__dirname, '../../../'), // Path to the root of your project where Dockerfile is located
            additionalEnvironmentVariables: {},
            projNameL: props.projNameL,
            projNameTitleCase: props.projNameTitleCase,
            projNameCamel: props.projNameCamel,
            projNameKebabCase: props.projNameKebabCase,
            projNameHuman: props.projNameHuman,
            pikaServiceProjNameKebabCase: props.pikaServiceProjNameKebabCase,
        };

        const pikaChatConstructProps: PikaChatConstructProps = customStackDefs.getPikaChatConstructProps(partialProps);

        // Create the chatbot webapp using the construct
        this.webapp = new PikaChatConstruct(this, 'PikaChatConstruct', pikaChatConstructProps);

        customStackDefs.addStackResoucesAfterWeCreateThePikaChatConstruct();
    }
}
