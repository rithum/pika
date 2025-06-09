#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WeatherStack } from '../lib/stacks';

const app = new cdk.App();

// Get stage from context or use default
const stage = app.node.tryGetContext('stage') || 'test';

// Define account mapping for allowed stages
const accountMapping: Record<string, string> = {
    test: 'AWS_ACCOUNT_ID_PLACEHOLDER ', // pika test
    prod: 'AWS_ACCOUNT_ID_PLACEHOLDER ' // pika prod
};

// Validate the stage is allowed
if (!accountMapping[stage]) {
    throw new Error(`Deployment to '${stage}' stage is not allowed. Only 'test' and 'prod' stages are supported.`);
}

// Set environment with the appropriate account for the stage
const env = {
    account: accountMapping[stage],
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
};

// This is the name that you chose for the project name for the pika service stack.  It is needed because we import
// some pika service stack parameters in this the pika chat stack.
const pikaServiceProjNameKebabCase = 'pika';

// Create the Weather stack
new WeatherStack(app, `weather-${stage}`, {
    env,
    stage,
    description: `Weather service infrastructure - ${stage} stage`,
    pikaServiceProjNameKebabCase
});

app.synth();
