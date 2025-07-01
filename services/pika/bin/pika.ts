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
 *
 * To allow this file to be updated by framework syncs:
 * 1. Edit .pika-sync.json
 * 2. Add 'services/pika/bin/pika.ts' to the userUnprotectedAreas array
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PikaStack } from '../lib/stacks';
import { getLoggedInAccountIdFromSts } from './sts';
import { pikaConfig } from '../../../pika-config.js';

const app = new cdk.App();

async function main() {
    // Get stage from context - required for deployment
    const stage = app.node.tryGetContext('stage');
    if (!stage) {
        throw new Error('Stage is required. Please provide it using: pnpm run cdk:deploy --context stage=<stage-name> or set STAGE environment variable');
    }

    const loggedInAccountId = await getLoggedInAccountIdFromSts();
    console.log(`Deploying to stage '${stage}' in account '${loggedInAccountId}'`);

    const env = {
        account: loggedInAccountId,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
    };

    // This is the name that you chose for the project name for the pika service stack.  It is needed because we import
    // some pika service stack parameters in this the pika chat stack.
    const { pika } = pikaConfig;
    const projNameL = pika.projNameL;
    const projNameKebabCase = pika.projNameKebabCase;
    const projNameTitleCase = pika.projNameTitleCase;
    const projNameCamel = pika.projNameCamel;
    const projNameHuman = pika.projNameHuman;

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
