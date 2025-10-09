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
            '$icons/': '~icons/'
        }
    }
});
