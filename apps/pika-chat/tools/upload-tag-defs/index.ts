#!/usr/bin/env node
/**
 * Deploy tag definitions to AWS for development/testing
 *
 * This tool deploys BOTH:
 * 1. Built-in Pika tag definitions (from infra/build/tag-definitions.json)
 * 2. Mock tag definitions (from src/lib/mock-tags/definitions/)
 *
 * Prerequisites:
 * - Pika service stack deployed
 * - .env.local file with STAGE and PIKA_SERVICE_PROJ_NAME_KEBAB_CASE
 * - Built-in tags must be generated first: npm run build
 *
 * Usage:
 * - npm run upload-tag-defs
 */

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { createHash } from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
const envLocalPath = path.resolve(__dirname, '../../.env.local');
console.log(`Loading environment variables from ${envLocalPath}`);
dotenv.config({ path: envLocalPath });

const STAGE = process.env.STAGE;
const PROJ_NAME = process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

if (!STAGE || !PROJ_NAME) {
    console.error('ERROR: Missing required environment variables in .env.local:');
    console.error('  - STAGE');
    console.error('  - PIKA_SERVICE_PROJ_NAME_KEBAB_CASE');
    process.exit(1);
}

const s3Client = new S3Client({ region: AWS_REGION });
const ssmClient = new SSMClient({ region: AWS_REGION });
const lambdaClient = new LambdaClient({ region: AWS_REGION });

interface TagDefConfig {
    scope: string;
    tag: string;
    gzippedBase64EncodedString: string;
    isMock?: boolean;
}

interface MockTagConfig {
    definition: any;
    webComponentPath?: string;
}

/**
 * Get SSM parameter value
 */
async function getSSMParameter(name: string): Promise<string> {
    const command = new GetParameterCommand({ Name: name });
    const response = await ssmClient.send(command);
    if (!response.Parameter?.Value) {
        throw new Error(`SSM parameter ${name} not found`);
    }
    return response.Parameter.Value;
}

/**
 * Upload gzipped file to S3 and return file metadata
 */
async function uploadWebComponentToS3(bucketName: string, s3Key: string, filePath: string): Promise<{ sizeBytes: number; sha256Base64: string }> {
    // Read and gzip the file
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const gzipped = gzipSync(fileContent);

    // Calculate SHA256 hash of the gzipped bytes for integrity checking
    const hash = createHash('sha256').update(gzipped).digest('base64');

    // Upload to S3
    await s3Client.send(
        new PutObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
            Body: gzipped,
            ContentType: 'application/javascript',
            ContentEncoding: 'gzip'
        })
    );

    console.log(`    - Uploaded to s3://${bucketName}/${s3Key} (${gzipped.length} bytes)`);

    return {
        sizeBytes: gzipped.length,
        sha256Base64: hash
    };
}

/**
 * Invoke Tag Definition Custom Resource Lambda
 */
async function registerTagDefinition(lambdaArn: string, tagDefData: string, tagScope: string, tagName: string): Promise<void> {
    // Create a mock CloudFormation event structure for direct Lambda invocation
    const requestId = `direct-invoke-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const payload = {
        RequestType: 'Create',
        ServiceToken: lambdaArn,
        ResponseURL: 'https://mock-response-url.local', // Mock URL for direct invocation (don't change this, we look for it in the lambda code to know this is a direct invocation)
        StackId: `arn:aws:cloudformation:${AWS_REGION}:${Date.now()}:stack/direct-upload-tag-defs/${requestId}`,
        RequestId: requestId,
        LogicalResourceId: `TagDef-${tagScope}-${tagName}`,
        ResourceType: 'Custom::TagDefinition',
        ResourceProperties: {
            ServiceToken: lambdaArn,
            TagDefData: tagDefData,
            Stage: STAGE
        }
    };

    const command = new InvokeCommand({
        FunctionName: lambdaArn,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(payload)
    });

    const response = await lambdaClient.send(command);

    if (response.FunctionError) {
        const errorPayload = JSON.parse(Buffer.from(response.Payload!).toString());
        throw new Error(`Lambda invocation failed: ${JSON.stringify(errorPayload)}`);
    }

    console.log('    - Tag definition registered');
}

/**
 * Load built-in tag definitions from build directory
 */
function loadBuiltInTagDefinitions(): TagDefConfig[] {
    const tagDefsPath = path.resolve(__dirname, '../../infra/build/tag-definitions.json');

    if (!fs.existsSync(tagDefsPath)) {
        console.log('  Built-in tag definitions not found. Run "npm run build" first.');
        return [];
    }

    const content = fs.readFileSync(tagDefsPath, 'utf-8');
    const parsed = JSON.parse(content);

    return parsed.tagDefs || [];
}

/**
 * Find all mock tag definition files
 */
function findMockTagDefinitions(): string[] {
    const definitionsPath = path.resolve(__dirname, '../../src/lib/mock-tags/definitions');

    if (!fs.existsSync(definitionsPath)) {
        console.log('  Mock tags directory not found');
        return [];
    }

    const files = fs.readdirSync(definitionsPath);
    return files.filter((file) => file.endsWith('.ts')).map((file) => path.join(definitionsPath, file));
}

/**
 * Main deployment function
 */
async function main(): Promise<void> {
    console.log('='.repeat(60));
    console.log('Deploying Tag Definitions');
    console.log('='.repeat(60));
    console.log(`Environment: ${STAGE}`);
    console.log(`Project: ${PROJ_NAME}`);
    console.log('');

    // 1. Get S3 bucket name from SSM
    console.log('Getting S3 bucket name...');
    const bucketName = await getSSMParameter(`/stack/${PROJ_NAME}/${STAGE}/s3/pika_bucket_name`);
    console.log(`  Bucket: ${bucketName}`);
    console.log('');

    // 2. Get Tag Definition Lambda ARN from SSM
    console.log('Getting Tag Definition Lambda ARN...');
    const lambdaArn = await getSSMParameter(`/stack/${PROJ_NAME}/${STAGE}/lambda/tag_definition_custom_resource_arn`);
    console.log(`  ARN: ${lambdaArn}`);
    console.log('');

    // ========== PART 1: Deploy Built-in Tag Definitions ==========
    console.log('='.repeat(60));
    console.log('PART 1: Built-in Tag Definitions');
    console.log('='.repeat(60));

    const builtInTagDefs = loadBuiltInTagDefinitions();
    console.log(`Found ${builtInTagDefs.length} built-in tag definition(s)`);

    if (builtInTagDefs.length > 0) {
        console.log('Registering built-in tag definitions...');

        for (const tagDef of builtInTagDefs) {
            console.log(`  ${tagDef.scope}.${tagDef.tag}:`);
            await registerTagDefinition(lambdaArn, tagDef.gzippedBase64EncodedString, tagDef.scope, tagDef.tag);
        }

        console.log('');
    }

    // ========== PART 2: Deploy Mock Tag Definitions ==========
    // Skip mock tags in production
    if (STAGE === 'prod' || STAGE === 'production') {
        console.log('Skipping mock tags in production environment');
        console.log('');
        console.log('='.repeat(60));
        console.log('Deployment Complete!');
        console.log('='.repeat(60));
        return;
    }

    console.log('='.repeat(60));
    console.log('PART 2: Mock Tag Definitions (Non-Production Only)');
    console.log('='.repeat(60));

    const tagDefFiles = findMockTagDefinitions();
    console.log(`Found ${tagDefFiles.length} mock tag definition(s)`);
    console.log('');

    if (tagDefFiles.length === 0) {
        console.log('No mock tags to deploy');
        console.log('');
        console.log('='.repeat(60));
        console.log('Deployment Complete!');
        console.log('='.repeat(60));
        return;
    }

    // Track unique web component files to upload
    const webComponentFiles = new Set<string>();
    const mockTagConfigs: MockTagConfig[] = [];

    for (const filePath of tagDefFiles) {
        const fileUrl = `file://${filePath}`;
        const module = await import(fileUrl);
        const tagDef = module.default;

        if (!tagDef) {
            console.error(`  No default export in ${path.basename(filePath)}`);
            continue;
        }

        // Determine web component file path
        let webComponentPath: string | undefined;
        if (tagDef.widget?.webComponent?.s3?.s3Key) {
            const fileName = path.basename(tagDef.widget.webComponent.s3.s3Key, '.gz');
            // Web component files are stored as .js.txt to avoid TypeScript checking
            const txtFileName = `${fileName}.txt`;
            webComponentPath = path.resolve(__dirname, '../../src/lib/mock-tags/webcomponents', txtFileName);

            if (fs.existsSync(webComponentPath)) {
                webComponentFiles.add(webComponentPath);
            }
        }

        mockTagConfigs.push({
            definition: tagDef,
            webComponentPath
        });
    }

    // Upload web components to S3
    if (webComponentFiles.size > 0) {
        console.log(`Uploading ${webComponentFiles.size} web component(s) to S3...`);

        for (const wcPath of webComponentFiles) {
            const fileName = path.basename(wcPath);
            // Strip .txt extension for S3 key (file is stored as .js.txt locally, but .js.gz in S3)
            const jsFileName = fileName.replace(/\.txt$/, '');
            const s3Key = `wc/pika/${jsFileName}.gz`;

            console.log(`  ${fileName}:`);
            await uploadWebComponentToS3(bucketName, s3Key, wcPath);
        }
        console.log('');
    }

    // Register each mock tag definition
    console.log(`Registering ${mockTagConfigs.length} mock tag definition(s)...`);

    for (const config of mockTagConfigs) {
        const tagDef = config.definition;
        console.log(`  ${tagDef.scope}.${tagDef.tag}:`);

        // Populate S3 bucket in definition
        if (tagDef.widget?.webComponent?.s3) {
            tagDef.widget.webComponent.s3.s3Bucket = bucketName;

            // Get file metadata if web component exists
            if (config.webComponentPath && fs.existsSync(config.webComponentPath)) {
                const fileContent = fs.readFileSync(config.webComponentPath, 'utf-8');
                const gzipped = gzipSync(fileContent);

                // Calculate SHA256 hash of gzipped bytes for integrity checking
                const hash = createHash('sha256').update(gzipped).digest('base64');

                tagDef.widget.webComponent.encodedSizeBytes = gzipped.length;
                tagDef.widget.webComponent.encodedSha256Base64 = hash;
            }
        }

        // Gzip and base64 encode the tag definition
        const jsonString = JSON.stringify(tagDef);
        const gzipped = gzipSync(jsonString);
        const tagDefData = gzipped.toString('base64');

        // Register via Lambda
        await registerTagDefinition(lambdaArn, tagDefData, tagDef.scope, tagDef.tag);
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('Deployment Complete!');
    console.log('='.repeat(60));
    console.log(`  Built-in tags: ${builtInTagDefs.length}`);
    console.log(`  Mock tags: ${mockTagConfigs.length}`);
    console.log(`  Total: ${builtInTagDefs.length + mockTagConfigs.length}`);
}

main().catch((error) => {
    console.error('Deployment failed:', error);
    process.exit(1);
});
