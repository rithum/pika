#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WeatherDirectStack } from '../lib/stacks';
import { getLoggedInAccountIdFromSts } from './sts';
import { pikaConfig } from '../../../../pika-config.js';

const app = new cdk.App();

async function main() {
    // Get stage from context or use default
    const stage = app.node.tryGetContext('stage') || 'test';

    const loggedInAccountId = await getLoggedInAccountIdFromSts();
    console.log(`Deploying weather-direct to stage '${stage}' in account '${loggedInAccountId}'`);

    const env = {
        account: loggedInAccountId,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
    };

    if (!pikaConfig.pika || !pikaConfig.pika.projNameKebabCase) {
        throw new Error('Pika service project config not found in pika-config.ts, expected pika.projNameKebabCase');
    }

    const pikaServiceProjNameKebabCase = pikaConfig.pika.projNameKebabCase;

    let projNameL = 'weather-direct';
    let projNameKebabCase = 'weather-direct';
    let projNameTitleCase = 'WeatherDirect';
    let projNameCamel = 'weatherDirect';
    let projNameHuman = 'Weather Direct';

    // Create the Weather Direct stack
    new WeatherDirectStack(app, `${projNameKebabCase}-${stage}`, {
        env,
        stage,
        description: `Weather Direct agent service (no chat app) - ${stage} stage`,
        pikaServiceProjNameKebabCase,
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
    .catch((e) => {
        console.error('Deployment failed', e);
        process.exit(1);
    });
