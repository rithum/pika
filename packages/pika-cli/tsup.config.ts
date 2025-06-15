import { defineConfig } from 'tsup';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'], // ESM format for modern Node.js
    dts: true, // Generate .d.ts files
    clean: true, // Clean output directory before build
    minify: false, // Don't minify for CLI tools
    sourcemap: true, // Generate source maps
    splitting: false, // Don't split chunks for CLI
    treeshake: true, // Remove unused code
    platform: 'node', // Target Node.js
    target: 'node22', // Target Node.js 22 (as specified in package.json)
    outDir: 'dist',
    // Add shebang to the output file
    banner: {
        js: '#!/usr/bin/env node'
    },
    // Define build-time constants
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
        'process.env.PIKA_CLI_VERSION': JSON.stringify(process.env.npm_package_version || '0.0.0')
    },
    bundle: true,
    // Skip certain files from being processed
    skipNodeModulesBundle: false,
    // Generate build info and copy static files
    async onSuccess() {
        // Read package.json using ESM-compatible path resolution
        const pkgPath = path.join(__dirname, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        // Generate build info
        const buildInfo = {
            name: pkg.name,
            version: pkg.version,
            buildDate: new Date().toISOString(),
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        };

        // Write build info
        fs.writeFileSync(path.join(__dirname, 'dist', 'build-info.json'), JSON.stringify(buildInfo, null, 2));

        // Copy static files
        const filesToCopy = ['LICENSE', 'README.md'];
        for (const file of filesToCopy) {
            try {
                fs.copyFileSync(path.join(__dirname, file), path.join(__dirname, 'dist', file));
            } catch (error) {
                console.warn(`Failed to copy ${file}:`, error);
            }
        }

        //TODO: don't need to do this since tsup does it automatically, true or false?
        // Make CLI executable on Unix systems
        // if (process.platform !== 'win32') {
        //     try {
        //         childProcess.execSync('chmod +x dist/index.js');
        //     } catch (error) {
        //         console.warn('Failed to make CLI executable:', error);
        //     }
        // }
    }
});
