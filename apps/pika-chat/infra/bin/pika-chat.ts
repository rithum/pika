#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getValueFromParameterStore } from './ssm.js';
import { getLoggedInAccountIdFromSts } from './sts.js';
import { PikaChatStack } from '../lib/stacks/pika-chat-stack.js';

const app = new cdk.App();

async function main() {
    // Get stage from context or use default
    const stage = app.node.tryGetContext('stage') || 'test';
    const vpcId = await getValueFromParameterStore(`/pika/${stage}/networking/vpc/id`);

    if (!vpcId) {
        throw new Error(`VPC ID not found for stage '${stage}'`);
    }

    const loggedInAccountId = await getLoggedInAccountIdFromSts();
    console.log(`Deploying to stage '${stage}' in account '${loggedInAccountId}'`);

    const env = {
        account: loggedInAccountId,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    };

    //TODO: get these from an environment variable or something
    // These are the values for the project name for the pika chat stack
    const projNameL = 'pikachat';
    const projNameKebabCase = 'pika-chat';
    const projNameTitleCase = 'PikaChat';
    const projNameCamel = 'pikaChat';
    const projNameHuman = 'Pika Chat';

    // This is the name that you chose for the project name for the pika service stack.  It is needed because we import
    // some pika service stack parameters in this the pika chat stack.
    const pikaServiceProjNameKebabCase = 'pika';

    // Create the Pika Chat stack
    new PikaChatStack(app, `${projNameKebabCase}-${stage}`, {
        env,
        stage,
        vpcId,
        description: `${projNameHuman} - ${stage} stage`,
        projNameL,
        projNameTitleCase,
        projNameCamel,
        projNameKebabCase,
        projNameHuman,
        pikaServiceProjNameKebabCase,
    });
}

main()
    .then(() => {
        app.synth();
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
