#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default components.json configuration
const defaultComponentsConfig = {
    $schema: 'https://shadcn-svelte.com/schema.json',
    tailwind: {
        css: 'src/app.css',
        baseColor: 'slate'
    },
    aliases: {
        components: '$lib/components',
        utils: '$lib/utils',
        ui: '$lib/components/ui',
        hooks: '$lib/hooks',
        lib: '$lib'
    },
    typescript: true,
    registry: 'https://tw3.shadcn-svelte.com/registry/new-york'
};

// Default alias configuration for svelte.config.js
const svelteAliases = {
    $ui: 'node_modules/pika-ux/src'
};

function findProjectRoot() {
    let currentDir = process.cwd();

    while (currentDir !== path.parse(currentDir).root) {
        if (fs.existsSync(path.join(currentDir, 'package.json'))) {
            return currentDir;
        }
        currentDir = path.dirname(currentDir);
    }

    throw new Error('Could not find project root (no package.json found)');
}

function setupComponentsJson(projectRoot) {
    const componentsJsonPath = path.join(projectRoot, 'components.json');

    if (!fs.existsSync(componentsJsonPath)) {
        console.log('Creating components.json...');
        fs.writeFileSync(componentsJsonPath, JSON.stringify(defaultComponentsConfig, null, 4));
        console.log('✅ Created components.json');
    } else {
        console.log('✅ components.json already exists');
    }
}

function updateSvelteConfig(projectRoot) {
    const svelteConfigPath = path.join(projectRoot, 'svelte.config.js');

    if (fs.existsSync(svelteConfigPath)) {
        console.log('Found svelte.config.js - please add these aliases manually:');
        console.log(JSON.stringify(svelteAliases, null, 2));
        console.log('Add them to your kit.alias configuration');
    }
}

function updateViteConfig(projectRoot) {
    const viteConfigPath = path.join(projectRoot, 'vite.config.js');
    const viteConfigTsPath = path.join(projectRoot, 'vite.config.ts');

    if (fs.existsSync(viteConfigPath) || fs.existsSync(viteConfigTsPath)) {
        console.log('Found vite config - please add these aliases manually:');
        console.log(JSON.stringify(svelteAliases, null, 2));
        console.log('Add them to your resolve.alias configuration');
    }
}

function main() {
    try {
        console.log('🔧 Setting up pika-ux...');

        const projectRoot = findProjectRoot();
        console.log(`Project root: ${projectRoot}`);

        setupComponentsJson(projectRoot);
        updateSvelteConfig(projectRoot);
        updateViteConfig(projectRoot);

        console.log('\n✅ Setup complete!');
        console.log('\nNext steps:');
        console.log('1. Update your svelte.config.js or vite.config.js with the suggested aliases');
        console.log('2. Import components: import { Button } from "pika-ux/shadcn/button"');
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

main();
