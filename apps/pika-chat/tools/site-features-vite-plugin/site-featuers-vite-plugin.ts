import { existsSync, writeFileSync } from 'fs';
import { createJiti } from 'jiti';
import * as path from 'path';
import { format } from 'prettier';
import { serialize } from 'seroval';
import { fileURLToPath } from 'url';
import type { HmrContext, Plugin, ViteDevServer } from 'vite';
import type { PikaConfig, SiteFeatures } from '../../../../packages/shared/src/types/pika-types';

const __filename = fileURLToPath(import.meta.url);
const customSiteFeaturesFileName = 'custom-site-features.ts';
const chatWebAppServerDirName = 'apps/pika-chat/src/lib/server';
const pikaConfigFileName = 'pika-config.ts';

// This is the directory where the stack is located which is `apps/chatbot/infra/lib/stacks`
const __dirname = path.dirname(__filename);

export async function siteFeaturesVitePlugin(): Promise<Plugin> {
    let server: ViteDevServer | null = null;
    let pikaConfigAbsolutePath: string | undefined;

    return {
        name: 'site-features-vite-plugin',

        async buildStart() {
            await updateSiteFeaturesTsFileFromPikaConfig();
        },

        // store server instance for HMR
        configureServer: (_server) => {
            server = _server;
            pikaConfigAbsolutePath = findPathToPikaConfig();
            if (pikaConfigAbsolutePath) {
                _server.watcher.add(pikaConfigAbsolutePath);
            } else {
                console.warn('Could not find pika-config.ts to watch');
            }
        },

        // Detect if we changed the pika-config.ts file and update the custom-site-features.ts file
        async handleHotUpdate(ctx: HmrContext) {
            // Compare absolute paths instead of just filenames
            if (pikaConfigAbsolutePath && path.resolve(ctx.file) === path.resolve(pikaConfigAbsolutePath)) {
                try {
                    await updateSiteFeaturesTsFileFromPikaConfig();

                    ctx.server.ws.send({
                        type: 'full-reload',
                        path: '*'
                    });
                } catch (error) {
                    console.error('Failed to update site features:', error);
                }

                // Prevent the default HMR behavior
                return [];
            }
        }
    };
}

function findPathToPikaConfig(): string | undefined {
    let currentDir = __dirname;

    // Walk up the directory tree
    while (currentDir !== '/' && currentDir !== path.parse(currentDir).root) {
        const pikaConfigPathCandidate = path.join(currentDir, pikaConfigFileName);

        if (existsSync(pikaConfigPathCandidate)) {
            return path.resolve(pikaConfigPathCandidate); // Return absolute path
        }
        currentDir = path.dirname(currentDir);
    }

    return undefined;
}

async function updateSiteFeaturesTsFileFromPikaConfig() {
    // Walk the current directory until we either find a pika-config.ts file or we reach the root directory and get the path to the pika-config.ts file
    let pikaConfigPath: string | undefined = findPathToPikaConfig();

    if (!pikaConfigPath) {
        throw new Error(`${pikaConfigFileName} file not found and it is expected to be in the root directory of the project, see <root>/docs/developer/customization.md`);
    }

    // If the pikaConfigPath isn't a file, throw an error
    if (!existsSync(pikaConfigPath)) {
        throw new Error(
            `${pikaConfigFileName} file ${pikaConfigPath} is not a file, it is expected to be a file in the root directory of the project, up however many directories from this site-features-vite-plugin file`
        );
    }

    let siteFeatures: SiteFeatures | undefined;

    // Read the pika-config.ts file
    try {
        // Clear the module cache to ensure we get the latest version
        const jiti = createJiti(import.meta.url, {
            cache: false,
            requireCache: false
        });
        const pikaConfig = (await jiti.import(pikaConfigPath)) as { pikaConfig: PikaConfig };
        if (!pikaConfig.pikaConfig) {
            throw new Error(`${pikaConfigFileName} file ${pikaConfigPath} does not have an exported pikaConfig constant`);
        }

        siteFeatures = pikaConfig.pikaConfig.siteFeatures;
    } catch (e) {
        throw new Error(`Failed to import ${pikaConfigFileName} file from ${pikaConfigPath}, error: ${e}`);
    }

    const chatWebAppServerPath = path.join(path.dirname(pikaConfigPath), chatWebAppServerDirName);

    // Make sure that the path exists or throw an error
    if (!existsSync(chatWebAppServerPath)) {
        throw new Error(`Chat web app server path ${chatWebAppServerPath} does not exist, trying to find apps/pika-chat/src/lib/server in the same directory as pika-config.ts`);
    }

    const customSiteFeaturesPath = path.join(chatWebAppServerPath, customSiteFeaturesFileName);

    const rawSerialized = siteFeatures ? serialize(siteFeatures) : 'undefined';

    // Replace minified boolean literals with readable ones
    const readableSerialized = rawSerialized.replace(/!0/g, 'true').replace(/!1/g, 'false');

    const unformattedContent = `/** Do not change this file.  It is generated by the site-features-vite-plugin when you run locally or build. */

import type { SiteFeatures } from "@pika/shared/types/pika-types";

export const siteFeatures: SiteFeatures | undefined = ${readableSerialized};
`;

    // Format the content with Prettier
    const fileContent = await format(unformattedContent, {
        parser: 'typescript',
        tabWidth: 4,
        useTabs: false,
        singleQuote: true,
        trailingComma: 'es5',
        printWidth: 100
    });

    // Write the site-features.ts file
    writeFileSync(customSiteFeaturesPath, fileContent, 'utf8');
}
