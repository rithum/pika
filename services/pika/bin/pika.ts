#!/usr/bin/env node
/**
 * Pika Service Infrastructure Stack Definition
 *
 * This file defines the AWS CDK stack for the Pika service infrastructure.
 *
 * IMPORTANT: This file is protected from framework updates and is meant to be customized.
 * You should:
 * - Update the project name variables below to match your project
 * - Configure account IDs and regions for your environment
 * - Add any custom AWS resources your services need
 * - Modify stack properties as needed for your deployment
 *
 * This file will NOT be overwritten when you run 'pika sync'.
 */

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
