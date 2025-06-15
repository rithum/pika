import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PikaConstruct } from '../constructs/pika-construct';

export interface PikaStackProps extends cdk.StackProps {
    stage: string;
    projNameL: string; // All lowercase e.g. pika
    projNameKebabCase: string; // Kebab case e.g. pika
    projNameTitleCase: string; // Title case e.g. Pika
    projNameCamel: string; // Camel case e.g. pika
    projNameHuman: string; // Human readable e.g. Pika
}

export class PikaStack extends cdk.Stack {
    public readonly pikaConstruct: PikaConstruct;

    constructor(scope: Construct, id: string, props: PikaStackProps) {
        super(scope, id, props);

        // Create the chatbot construct with all the infrastructure
        this.pikaConstruct = new PikaConstruct(this, `${props.projNameTitleCase}Construct`, {
            stage: props.stage,
            stackName: this.stackName,
            region: this.region,
            account: this.account,
            projNameL: props.projNameL,
            projNameKebabCase: props.projNameKebabCase,
            projNameTitleCase: props.projNameTitleCase,
            projNameCamel: props.projNameCamel,
            projNameHuman: props.projNameHuman
        });
    }
}
