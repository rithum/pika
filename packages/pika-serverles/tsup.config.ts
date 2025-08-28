import { defineConfig } from 'tsup';
import * as fs from 'fs';
import * as path from 'path';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'types/index': 'src/types.ts',
        'utils/index': 'src/utils.ts'
    },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    minify: false,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    platform: 'node',
    target: 'node22',
    outDir: 'dist',
    bundle: true,
    skipNodeModulesBundle: true, // Don't bundle dependencies like pika-shared
    external: ['pika-shared', 'serverless', '@aws-sdk/client-bedrock-agent-runtime'],

    // Add this to help IDEs find source files
    esbuildOptions(options) {
        options.sourceRoot = '../src';
    },
    // Preserve the directory structure
    outExtension({ format }) {
        return {
            js: format === 'cjs' ? '.js' : '.mjs'
        };
    },
    async onSuccess() {
        // Read package.json using ESM-compatible path resolution
        const pkgPath = path.join(process.cwd(), 'package.json');
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
        fs.writeFileSync(path.join(process.cwd(), 'dist', 'build-info.json'), JSON.stringify(buildInfo, null, 2));

        // Copy static files
        const filesToCopy = ['../../LICENSE', 'README.md'];
        for (const file of filesToCopy) {
            try {
                fs.copyFileSync(path.join(process.cwd(), file), path.join(process.cwd(), 'dist', file));
            } catch (error) {
                console.warn(`Failed to copy ${file}:`, error);
            }
        }

        console.log('Pika Serverless Plugin built successfully');
    }
});
