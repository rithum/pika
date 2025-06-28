import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { pikaConfig } from '../../pika-config';
import { siteFeaturesVitePlugin } from './tools/site-features-vite-plugin/site-featuers-vite-plugin';

// https://vitejs.dev/config/
export default defineConfig(async () => {
    const viteConfig = pikaConfig.pika.viteConfig;

    return {
        plugins: [
            siteFeaturesVitePlugin(),
            sveltekit(),
            Icons({
                compiler: 'svelte',
            }),
        ],
        server: {
            // Use custom config if available, otherwise use defaults
            host: viteConfig?.server?.host ?? 'localhost',
            port: viteConfig?.server?.port ?? 3000,
            strictPort: viteConfig?.server?.strictPort ?? true,
            ...(viteConfig?.server?.https && {
                https: {
                    key: fs.readFileSync(path.resolve(__dirname, viteConfig.server.https.key)),
                    cert: fs.readFileSync(path.resolve(__dirname, viteConfig.server.https.cert)),
                },
            }),
        },
        preview: {
            // Use custom config if available, otherwise use defaults
            host: viteConfig?.preview?.host ?? 'localhost',
            port: viteConfig?.preview?.port ?? 3000,
            strictPort: viteConfig?.preview?.strictPort ?? true,
        },
    };
});
