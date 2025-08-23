#!/usr/bin/env node

/**
 * Manual Tag Definition Sync Tool
 *
 * This tool manually synchronizes tag definitions by:
 * 1. Building the tag definitions file using the existing generation tool
 * 2. Reading the generated tag-definitions.json file
 * 3. Retrieving the Lambda ARN from SSM
 * 4. Invoking the tag definition custom resource Lambda for each tag definition
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { v4 as uuidv4 } from 'uuid';

// Import pika config for project naming
let pikaConfigCache: any;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get pika config with caching
 */
async function getPikaConfig() {
    if (!pikaConfigCache) {
        const configModule = await import('../../../../pika-config.ts');
        pikaConfigCache = configModule.pikaConfig;
    }
    return pikaConfigCache;
}

interface TagDefInJsonFile {
    tag: string;
    scope: string;
    gzippedBase64EncodedString: string;
}

interface TagDefinitionsJsonFile {
    tagDefs: TagDefInJsonFile[];
}

interface CloudFormationEvent {
    RequestType: 'Create' | 'Update' | 'Delete';
    ResponseURL: string;
    StackId: string;
    RequestId: string;
    ResourceType: string;
    LogicalResourceId: string;
    ResourceProperties: {
        TagDefData: string;
        Stage: string;
        timestamp?: string;
    };
}

interface LambdaContext {
    logStreamName: string;
    functionName: string;
    functionVersion: string;
    invokedFunctionArn: string;
    memoryLimitInMB: string;
    awsRequestId: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): { stage: string; region: string } {
    const args = process.argv.slice(2);
    let stage = 'test';
    let region = 'us-east-1';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--stage' || args[i] === '-s') {
            stage = args[i + 1];
            i++;
        } else if (args[i] === '--region' || args[i] === '-r') {
            region = args[i + 1];
            i++;
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
Usage: tsx tools/manual-tag-def-sync/index.ts [options]

Options:
  --stage, -s <stage>     AWS deployment stage (default: test)
  --region, -r <region>   AWS region (default: us-east-1)
  --help, -h              Show this help message

Examples:
  tsx tools/manual-tag-def-sync/index.ts
  tsx tools/manual-tag-def-sync/index.ts --stage prod --region us-west-2
`);
            process.exit(0);
        }
    }

    return { stage, region };
}

/**
 * Build tag definitions by running the existing generation tool
 */
function buildTagDefinitions(): void {
    console.log('Building tag definitions...');

    const generateToolPath = path.resolve(__dirname, '../generate-tag-defs-for-build/index.ts');
    if (!fs.existsSync(generateToolPath)) {
        throw new Error(`Tag definition generation tool not found at: ${generateToolPath}`);
    }

    try {
        execSync(`tsx ${generateToolPath}`, {
            stdio: 'inherit',
            cwd: path.resolve(__dirname, '../..')
        });
        console.log('Tag definitions built successfully');
    } catch (error) {
        throw new Error(`Failed to build tag definitions: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Read the generated tag definitions file
 */
function readTagDefinitionsFile(): TagDefinitionsJsonFile {
    console.log('Reading tag definitions file...');

    const tagDefsPath = path.resolve(__dirname, '../../infra/build/tag-definitions.json');
    if (!fs.existsSync(tagDefsPath)) {
        throw new Error(`Tag definitions file not found at: ${tagDefsPath}`);
    }

    try {
        const fileContent = fs.readFileSync(tagDefsPath, 'utf-8');
        const tagDefinitions = JSON.parse(fileContent) as TagDefinitionsJsonFile;

        console.log(`Found ${tagDefinitions.tagDefs.length} tag definitions`);
        tagDefinitions.tagDefs.forEach((tagDef) => {
            console.log(`   - ${tagDef.scope}.${tagDef.tag}`);
        });

        return tagDefinitions;
    } catch (error) {
        throw new Error(`Failed to read tag definitions file: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Get the Lambda ARN from SSM parameter
 */
async function getLambdaArn(ssmClient: SSMClient, stage: string): Promise<string> {
    console.log('Retrieving Lambda ARN from SSM...');

    const pikaConfig = await getPikaConfig();
    const parameterName = `/stack/${pikaConfig.pika.projNameL}/${stage}/lambda/tag_definition_custom_resource_arn`;
    console.log(`   Parameter: ${parameterName}`);

    try {
        const command = new GetParameterCommand({
            Name: parameterName,
            WithDecryption: false
        });

        const response = await ssmClient.send(command);
        const lambdaArn = response.Parameter?.Value;

        if (!lambdaArn) {
            throw new Error(`Parameter ${parameterName} not found or has no value`);
        }

        console.log(`Lambda ARN: ${lambdaArn}`);
        return lambdaArn;
    } catch (error) {
        throw new Error(`Failed to retrieve Lambda ARN: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Create a mock CloudFormation event for the Lambda
 */
function createMockEvent(tagDef: TagDefInJsonFile, stage: string): CloudFormationEvent {
    const requestId = uuidv4();
    const stackId = `arn:aws:cloudformation:us-east-1:123456789012:stack/manual-sync-${tagDef.scope}-${tagDef.tag}/${uuidv4()}`;

    return {
        RequestType: 'Create',
        ResponseURL: 'https://httpbin.org/put', // Use httpbin.org to receive CloudFormation responses
        StackId: stackId,
        RequestId: requestId,
        ResourceType: 'Custom::TagDefinition',
        LogicalResourceId: `TagDefinition-${tagDef.scope}-${tagDef.tag}`,
        ResourceProperties: {
            TagDefData: tagDef.gzippedBase64EncodedString,
            Stage: stage,
            timestamp: Date.now().toString()
        }
    };
}

/**
 * Create a mock Lambda context
 */
function createMockContext(tagDef: TagDefInJsonFile): LambdaContext {
    const requestId = uuidv4();

    return {
        logStreamName: `manual-sync-${tagDef.scope}-${tagDef.tag}-${Date.now()}`,
        functionName: 'tag-definition-custom-resource',
        functionVersion: '$LATEST',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:tag-definition-custom-resource',
        memoryLimitInMB: '128',
        awsRequestId: requestId
    };
}

/**
 * Invoke the Lambda function for a single tag definition
 */
async function invokeLambdaForTagDef(lambdaClient: LambdaClient, lambdaArn: string, tagDef: TagDefInJsonFile, stage: string): Promise<void> {
    console.log(`Syncing tag definition: ${tagDef.scope}.${tagDef.tag}`);

    const event = createMockEvent(tagDef, stage);
    console.log('Event:', JSON.stringify(event, null, 2));

    // Extract function name from ARN
    const functionName = lambdaArn.split(':').pop();
    if (!functionName) {
        throw new Error(`Invalid Lambda ARN format: ${lambdaArn}`);
    }

    try {
        const command = new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify(event)
        });

        const response = await lambdaClient.send(command);

        if (response.FunctionError) {
            const errorPayload = response.Payload ? Buffer.from(response.Payload).toString() : 'No error details';
            throw new Error(`Lambda function error: ${response.FunctionError}\nPayload: ${errorPayload}`);
        }

        const responsePayload = response.Payload ? JSON.parse(Buffer.from(response.Payload).toString()) : null;
        console.log(`Successfully synced ${tagDef.scope}.${tagDef.tag}`);

        if (responsePayload && responsePayload.statusCode) {
            console.log(`   Response status: ${responsePayload.statusCode}`);
        }
    } catch (error) {
        throw new Error(`Failed to invoke Lambda for ${tagDef.scope}.${tagDef.tag}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Main function
 */
async function main(): Promise<void> {
    try {
        console.log('Manual Tag Definition Sync Tool');
        console.log('=====================================\n');

        // Parse command line arguments
        const { stage, region } = parseArgs();
        console.log(`Configuration:`);
        console.log(`   Stage: ${stage}`);
        console.log(`   Region: ${region}`);

        const pikaConfig = await getPikaConfig();
        console.log(`   Project: ${pikaConfig.pika.projNameHuman}\n`);

        // Step 1: Build tag definitions
        buildTagDefinitions();
        console.log();

        // Step 2: Read tag definitions file
        const tagDefinitions = readTagDefinitionsFile();
        console.log();

        if (tagDefinitions.tagDefs.length === 0) {
            console.log('No tag definitions found. Exiting.');
            return;
        }

        // Step 3: Initialize AWS clients
        const ssmClient = new SSMClient({ region });
        const lambdaClient = new LambdaClient({ region });

        // Step 4: Get Lambda ARN
        const lambdaArn = await getLambdaArn(ssmClient, stage);
        console.log();

        // Step 5: Invoke Lambda for each tag definition
        console.log(`Syncing ${tagDefinitions.tagDefs.length} tag definitions...`);

        for (const tagDef of tagDefinitions.tagDefs) {
            try {
                await invokeLambdaForTagDef(lambdaClient, lambdaArn, tagDef, stage);
            } catch (error) {
                console.error(`Failed to sync ${tagDef.scope}.${tagDef.tag}:`, error instanceof Error ? error.message : String(error));
                process.exit(1);
            }
        }

        console.log('\nAll tag definitions synced successfully!');
    } catch (error) {
        console.error('\nError:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

// Only run main if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
