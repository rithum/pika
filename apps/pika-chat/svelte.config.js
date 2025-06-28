import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    trailingSlash: 'always',
    kit: {
        adapter: adapter({
            out: 'build/apps/pika-chat',
        }),
        csp: {
            mode: 'auto',
        },
        csrf: {
            checkOrigin: true,
        },
        alias: {
            $lib: path.resolve('./src/lib'),
            '$lib/*': path.resolve('./src/lib/*'),
            $comps: path.resolve('./src/lib/components'),
            '$comps/*': path.resolve('./src/lib/components/*'),
            $icons: path.resolve('./src/lib/icons'),
            '$icons/*': path.resolve('./src/lib/icons/*'),
            $client: path.resolve('./src/lib/client'),
            '$client/*': path.resolve('./src/lib/client/*'),
            '@pika/shared': path.resolve('../../packages/shared/src'),
            '@pika/shared/*': path.resolve('../../packages/shared/src/*'),
        },
    },
};

export default config;
