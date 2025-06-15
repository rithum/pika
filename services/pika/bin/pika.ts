#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PikaStack } from '../lib/stacks';
import { getLoggedInAccountIdFromSts } from './sts';

const app = new cdk.App();

async function main() {
    // Get stage from context or use default
    const stage = app.node.tryGetContext('stage') || 'test';

    const loggedInAccountId = await getLoggedInAccountIdFromSts();
    console.log(`Deploying to stage '${stage}' in account '${loggedInAccountId}'`);

    const env = {
        account: loggedInAccountId,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
    };

    // This is the name that you chose for the project name for the pika service stack.  It is needed because we import
    // some pika service stack parameters in this the pika chat stack.
    const projNameL = 'pika';
    const projNameKebabCase = 'pika';
    const projNameTitleCase = 'Pika';
    const projNameCamel = 'pika';
    const projNameHuman = 'Pika';

    // Create the Pika stack
    new PikaStack(app, `${projNameKebabCase}-${stage}`, {
        env,
        stage,
        description: `${projNameHuman} service infrastructure - ${stage} stage`,
        projNameL,
        projNameKebabCase,
        projNameTitleCase,
        projNameCamel,
        projNameHuman
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
