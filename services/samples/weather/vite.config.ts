import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        tailwindcss(),
        svelte(),
        Icons({
            compiler: 'svelte'
        })
    ],
    resolve: {
        alias: {
            '$icons/': '~icons/',
            $lib: '/src/webcomponent/lib'
        }
    },
    build: {
        outDir: 'build', // Output to build/ so CDK can process into dist/
        lib: {
            entry: 'src/webcomponent/main.ts',
            formats: ['es'], // Only ES module, not UMD
            fileName: () => 'hello-world.js'
        },
        cssCodeSplit: false, // Don't split CSS into separate files
        rollupOptions: {
            external: [],
            output: {
                inlineDynamicImports: true
            }
        }
    }
});
