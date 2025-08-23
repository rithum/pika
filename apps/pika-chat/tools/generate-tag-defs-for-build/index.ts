#!/usr/bin/env node

/**
 * This script generates tag definitions for the build process by:
 * 1. Finding all tag definition files in default-components and custom-components directories
 * 2. Extracting the JSON definitions from each file
 * 3. Compressing and base64-encoding the JSON data
 * 4. Creating a tag-definitions.json file in the infra/build directory
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the components directories
const defaultComponentsPath = path.resolve(__dirname, '../../src/lib/client/features/chat/message-segments/default-components');
const customComponentsPath = path.resolve(__dirname, '../../src/lib/client/features/chat/message-segments/custom-components');

// Path to the build directory
const infraBuildPath = path.resolve(__dirname, '../../infra/build');

interface TagDefInJsonFile {
    tag: string;
    scope: string;
    gzippedBase64EncodedString: string;
}

interface TagDefinitionsJsonFile {
    tagDefs: TagDefInJsonFile[];
}

/**
 * Gzip and base64 encode a string (copied from pika-shared/util/server-utils)
 */
function gzipAndBase64EncodeString(string: string): string {
    const gzippedHexEncodedString = gzipSync(string).toString('hex');
    const gzippedBase64EncodedString = Buffer.from(gzippedHexEncodedString, 'hex').toString('base64');
    return gzippedBase64EncodedString;
}

/**
 * Finds all tag definition files in a directory
 */
function findTagDefinitionFiles(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) {
        console.log(`Directory ${dirPath} does not exist`);
        return [];
    }

    const files = fs.readdirSync(dirPath);
    return files.filter((file) => file.startsWith('tag-definition') && file.endsWith('.ts')).map((file) => path.resolve(dirPath, file));
}

/**
 * Dynamically imports a tag definition file and extracts the JSON data
 */
async function extractTagDefinition(filePath: string): Promise<TagDefInJsonFile | undefined> {
    try {
        console.log(`Processing ${filePath}`);

        // Convert file path to file:// URL for dynamic import
        const fileUrl = `file://${filePath}`;
        const module = await import(fileUrl);

        const tagDefinition = module.default;
        if (!tagDefinition) {
            console.error(`No default export found in ${filePath}`);
            return undefined;
        }

        if (!tagDefinition.tag || !tagDefinition.scope) {
            console.error(`Missing tag or scope in ${filePath}`);
            return undefined;
        }

        const jsonString = JSON.stringify(tagDefinition);
        const gzippedBase64EncodedString = gzipAndBase64EncodeString(jsonString);

        return {
            tag: tagDefinition.tag,
            scope: tagDefinition.scope,
            gzippedBase64EncodedString
        };
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
        return undefined;
    }
}

/**
 * Main function
 */
async function main(): Promise<void> {
    console.log('Generating tag definitions for build...');

    // Find all tag definition files
    const defaultFiles = findTagDefinitionFiles(defaultComponentsPath);
    const customFiles = findTagDefinitionFiles(customComponentsPath);
    const allFiles = [...defaultFiles, ...customFiles];

    console.log(`Found ${allFiles.length} tag definition files:`);
    allFiles.forEach((file) => console.log(`  - ${path.relative(process.cwd(), file)}`));

    if (allFiles.length === 0) {
        console.log('No tag definition files found. Creating empty tag-definitions.json');
    }

    // Process each file
    const tagDefs: TagDefInJsonFile[] = [];
    for (const filePath of allFiles) {
        const tagDef = await extractTagDefinition(filePath);
        if (tagDef) {
            tagDefs.push(tagDef);
            console.log(`  - Processed ${tagDef.scope}.${tagDef.tag}`);
        }
    }

    // Create the build directory if it doesn't exist
    if (!fs.existsSync(infraBuildPath)) {
        console.log(`Creating build directory: ${infraBuildPath}`);
        fs.mkdirSync(infraBuildPath, { recursive: true });
    }

    // Create the tag definitions JSON file
    const tagDefinitionsJsonFile: TagDefinitionsJsonFile = {
        tagDefs
    };

    const outputPath = path.resolve(infraBuildPath, 'tag-definitions.json');
    fs.writeFileSync(outputPath, JSON.stringify(tagDefinitionsJsonFile, null, 2));

    console.log(`Created ${outputPath} with ${tagDefs.length} tag definitions`);
    console.log('Tag definitions generation complete!');
}

main().catch((error) => {
    console.error('Error generating tag definitions:', error);
    process.exit(1);
});
