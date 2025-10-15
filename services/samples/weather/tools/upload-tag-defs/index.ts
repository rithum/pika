#!/usr/bin/env node
/**
 * Deploy weather tag definitions and web components to AWS
 *
 * This tool:
 * 1. Discovers required web component files from tag definitions
 * 2. Uploads the built .js files to S3 (gzipped)
 * 3. Registers/updates all tag definitions in DynamoDB
 *
 * Prerequisites:
 * - Pika service stack deployed
 * - Web components already built (run "pnpm run build" first)
 * - .env.local file with STAGE and PIKA_SERVICE_PROJ_NAME_KEBAB_CASE
 *
 * Usage:
 *   pnpm run build-upload-tag-defs  (builds + uploads)
 *   OR
 *   pnpm run build && pnpm run upload-tag-defs  (separate steps)
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

    console.log(`  ✓ Uploaded to s3://${bucketName}/${s3Key}`);
    console.log(`    Size: ${(gzipped.length / 1024).toFixed(2)} KB (gzipped)`);
    console.log(`    Hash: ${hash.substring(0, 16)}...`);

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
        ResponseURL: 'https://mock-response-url.local', // Mock URL for direct invocation
        StackId: `arn:aws:cloudformation:${AWS_REGION}:${Date.now()}:stack/weather-upload-tag-defs/${requestId}`,
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

    console.log('  ✓ Tag definition registered');
}

/**
 * Discover required web component files from tag definitions
 */
function discoverRequiredWebComponents(tagDefinitions: any[]): Map<string, string> {
    const buildDir = path.resolve(__dirname, '../../build');
    const fileMap = new Map<string, string>(); // s3Key -> local file path
    const missingFiles: string[] = [];

    for (const tagDef of tagDefinitions) {
        const s3Key = tagDef.widget?.webComponent?.s3?.s3Key;

        if (!s3Key) {
            continue; // Skip non-S3 web components (e.g., URL-based)
        }

        // Extract filename from S3 key (e.g., "wc/weather/weather.js.gz" -> "weather.js")
        const filename = path.basename(s3Key, '.gz');
        const localPath = path.join(buildDir, filename);

        // Check if file exists
        if (!fs.existsSync(localPath)) {
            missingFiles.push(`${filename} (required by ${tagDef.scope}.${tagDef.tag})`);
            continue;
        }

        // Add to map (deduplicate - multiple tags can reference same file)
        fileMap.set(s3Key, localPath);
    }

    if (missingFiles.length > 0) {
        console.error('\nMissing required web component files in build/:');
        missingFiles.forEach((file) => console.error(`  - ${file}`));
        console.error('\nRun "pnpm run build" to generate these files.');
        throw new Error('Missing required web component files');
    }

    return fileMap;
}

/**
 * Main deployment function
 */
async function main(): Promise<void> {
    console.log('='.repeat(60));
    console.log('Weather Tag Definitions Deployment');
    console.log('='.repeat(60));
    console.log(`Environment: ${STAGE}`);
    console.log(`Project: ${PROJ_NAME}`);
    console.log('');

    // 1. Load tag definitions
    console.log('Step 1: Loading tag definitions');
    console.log('-'.repeat(60));

    const tagDefsPath = path.resolve(__dirname, '../../lib/stacks/tag-definitions.ts');
    const tagDefsModule = await import(`file://${tagDefsPath}`);
    const tagDefinitions = tagDefsModule.weatherTagDefinitions;

    console.log(`  Found ${tagDefinitions.length} tag definition(s)`);
    console.log('');

    // 2. Discover required web component files
    console.log('Step 2: Discovering required web components');
    console.log('-'.repeat(60));

    const webComponentFiles = discoverRequiredWebComponents(tagDefinitions);
    console.log(`  Found ${webComponentFiles.size} unique web component file(s):`);
    webComponentFiles.forEach((localPath, s3Key) => {
        const filename = path.basename(localPath);
        console.log(`    - ${filename} → ${s3Key}`);
    });
    console.log('');

    // 3. Get AWS resources
    console.log('Step 3: Getting AWS resources');
    console.log('-'.repeat(60));
    const bucketName = await getSSMParameter(`/stack/${PROJ_NAME}/${STAGE}/s3/pika_bucket_name`);
    console.log(`  S3 Bucket: ${bucketName}`);

    const lambdaArn = await getSSMParameter(`/stack/${PROJ_NAME}/${STAGE}/lambda/tag_definition_custom_resource_arn`);
    console.log(`  Lambda ARN: ${lambdaArn.substring(0, 40)}...`);
    console.log('');

    // 4. Upload web components to S3
    console.log('Step 4: Uploading web components to S3');
    console.log('-'.repeat(60));

    // Track metadata for each S3 key
    const fileMetadata = new Map<string, { sizeBytes: number; sha256Base64: string }>();

    for (const [s3Key, localPath] of webComponentFiles.entries()) {
        const filename = path.basename(localPath);
        console.log(`\n  ${filename}:`);
        const metadata = await uploadWebComponentToS3(bucketName, s3Key, localPath);
        fileMetadata.set(s3Key, metadata);
    }
    console.log('');

    // 5. Register each tag definition
    console.log('Step 5: Registering tag definitions');
    console.log('-'.repeat(60));

    for (const tagDef of tagDefinitions) {
        console.log(`\n  ${tagDef.scope}.${tagDef.tag}:`);
        console.log(`    Title: ${tagDef.tagTitle}`);

        // Clone the tag definition and update file metadata
        const clonedTagDef = JSON.parse(JSON.stringify(tagDef));

        // Update web component metadata with actual values
        if (clonedTagDef.widget?.webComponent?.s3) {
            const s3Key = clonedTagDef.widget.webComponent.s3.s3Key;
            const metadata = fileMetadata.get(s3Key);

            if (metadata) {
                clonedTagDef.widget.webComponent.encodedSizeBytes = metadata.sizeBytes;
                clonedTagDef.widget.webComponent.encodedSha256Base64 = metadata.sha256Base64;
            }
        }

        // Gzip and base64 encode the tag definition
        const jsonString = JSON.stringify(clonedTagDef);
        const gzipped = gzipSync(jsonString);
        const tagDefData = gzipped.toString('base64');

        // Register via Lambda
        await registerTagDefinition(lambdaArn, tagDefData, tagDef.scope, tagDef.tag);
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('Deployment Complete');
    console.log('='.repeat(60));
    console.log(`  Tag definitions: ${tagDefinitions.length}`);
    console.log(`  Web components: ${webComponentFiles.size}`);
    webComponentFiles.forEach((localPath, s3Key) => {
        console.log(`    - s3://${bucketName}/${s3Key}`);
    });
    console.log('');
    console.log('Next steps for local development:');
    console.log('  1. Start local dev server: pnpm run dev:wc (terminal 1)');
    console.log('  2. Serve built files: pnpm run serve:wc (terminal 2)');
    console.log('  3. Set WEB_COMPONENT_URLS in pika-chat .env.local');
    console.log('  4. Start pika-chat: pnpm run dev (terminal 3)');
    console.log('');
}

main().catch((error) => {
    console.error('');
    console.error('='.repeat(60));
    console.error('Deployment failed ✗');
    console.error('='.repeat(60));
    console.error(error);
    process.exit(1);
});
