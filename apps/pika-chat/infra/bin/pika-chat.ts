#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getValueFromParameterStore } from './ssm.js';
import { getLoggedInAccountIdFromSts } from './sts.js';
import { PikaChatStack } from '../lib/stacks/pika-chat-stack.js';

const app = new cdk.App();

// Get stage from context or use default
const stage = app.node.tryGetContext('stage') || 'test';
const vpcId = await getValueFromParameterStore(`/pika/${stage}/networking/vpc/id`);

if (!vpcId) {
    throw new Error(`VPC ID not found for stage '${stage}'`);
}

// Define account mapping for allowed stages
const accountMapping: Record<string, string> = {
    test: 'AWS_ACCOUNT_ID_PLACEHOLDER ', // pika test
    prod: 'AWS_ACCOUNT_ID_PLACEHOLDER ', // pika prod
};

const accountId = accountMapping[stage];
if (!accountId) {
    throw new Error(`Deployment to '${stage}' stage is not allowed. Only 'test' and 'prod' stages are supported.`);
}

const loggedInAccountId = await getLoggedInAccountIdFromSts();
if (loggedInAccountId !== accountId) {
    throw new Error(`You are trying to deploy to '${stage}' which is account '${accountId}' but you are deploying as account '${loggedInAccountId}'`);
}

// Validate the stage is allowed
if (!accountMapping[stage]) {
    throw new Error(`Deployment to '${stage}' stage is not allowed. Only 'test' and 'prod' stages are supported.`);
}

// Set environment with the appropriate account for the stage
const env = {
    account: accountMapping[stage],
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
    pikaServiceProjNameKebabCase
});

app.synth();
