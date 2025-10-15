import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import Icons from 'unplugin-icons/vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        tailwindcss(),
        svelte(),
        Icons({
            compiler: 'svelte'
        }) as any // necessary since slightly different versions of vite are in use
    ],
    resolve: {
        alias: {
            $icons: '~icons',
            $ui: path.resolve('./src'),
            $lib: path.resolve('./src/lib')
        }
    }
});
