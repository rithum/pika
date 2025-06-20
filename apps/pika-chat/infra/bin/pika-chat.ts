#!/usr/bin/env node
/**
 * Pika Chat Infrastructure Stack Definition
 *
 * This file defines the AWS CDK stack for the Pika Chat application.
 *
 * IMPORTANT: This file is protected from framework updates and is meant to be customized.
 * You should:
 * - Update the project name variables below to match your project
 * - Configure VPC IDs, account IDs, and regions for your environment
 * - Add any custom AWS resources your application needs
 * - Modify stack properties as needed for your deployment
 *
 * This file will NOT be overwritten when you run 'pika sync'.
 *
 * To allow this file to be updated by framework syncs:
 * 1. Edit .pika-sync.json
 * 2. Add 'apps/pika-chat/infra/bin/pika-chat.ts' to the userUnprotectedAreas array
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getValueFromParameterStore } from './ssm.js';
import { getLoggedInAccountIdFromSts } from './sts.js';
import { PikaChatStack } from '../lib/stacks/pika-chat-stack.js';

// We are copying the root pika-config.ts file to a local build directory so that it can be imported by the pika-chat stack cleanly.
import { pikaConfig } from '../build/pika-config.js';

const app = new cdk.App();

async function main() {
    // Get stage from context or use default
    const stage = app.node.tryGetContext('stage') || 'test';
    // const vpcId = await getValueFromParameterStore(`/pika/${stage}/networking/vpc/id`);

    // if (!vpcId) {
    //     throw new Error(`VPC ID not found for stage '${stage}'`);
    // }

    const loggedInAccountId = await getLoggedInAccountIdFromSts();
    console.log(`Deploying to stage '${stage}' in account '${loggedInAccountId}'`);

    const env = {
        account: loggedInAccountId,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
    };

    //TODO: get these from an environment variable or something
    // These are the values for the project name for the pika chat stack
    const { pikaChat } = pikaConfig;
    const projNameL = pikaChat.projNameL;
    const projNameKebabCase = pikaChat.projNameKebabCase;
    const projNameTitleCase = pikaChat.projNameTitleCase;
    const projNameCamel = pikaChat.projNameCamel;
    const projNameHuman = pikaChat.projNameHuman;

    // This is the name that you chose for the project name for the pika service stack.  It is needed because we import
    // some pika service stack parameters in this the pika chat stack.
    const pikaServiceProjNameKebabCase = pikaConfig.pika.projNameKebabCase;

    // Create the Pika Chat stack
    new PikaChatStack(app, `${projNameKebabCase}-${stage}`, {
        env,
        stage,
        description: `${projNameHuman} - ${stage} stage`,
        projNameL,
        projNameTitleCase,
        projNameCamel,
        projNameKebabCase,
        projNameHuman,
        pikaServiceProjNameKebabCase
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
