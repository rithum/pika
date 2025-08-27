import { defineConfig } from 'tsup';
import * as fs from 'fs';
import * as path from 'path';
// import { fileURLToPath } from 'url';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

export default defineConfig({
    entry: ['src/**/*.ts'],
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
    skipNodeModulesBundle: false,

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
    }
});
