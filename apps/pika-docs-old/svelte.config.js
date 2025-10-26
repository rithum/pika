import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

/**
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
    extensions: ['.svelte', '.md'],
    preprocess: [vitePreprocess()],
    kit: {
        adapter: adapter({
            pages: 'dist'
        }),
        alias: {
            'pika-shared': path.resolve('../../packages/shared/src'),
            'pika-shared/*': path.resolve('../../packages/shared/src/*')
        }
    }
};

export default config;
