import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/**/*.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    outDir: 'dist',
    // Add this to help IDEs find source files
    esbuildOptions(options) {
        options.sourceRoot = '../src';
    },
    // Preserve the directory structure
    outExtension({ format }) {
        return {
            js: format === 'cjs' ? '.js' : '.mjs'
        };
    }
});
