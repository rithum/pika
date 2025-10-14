import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import Icons from 'unplugin-icons/vite';
import { resolve } from 'path';

/**
 * Vite config for local web component development.
 *
 * This config builds individual web components to dev-dist/:
 * - dev-dist/favorite-cities.js
 * - dev-dist/city-selector.js
 * - etc.
 *
 * Web components DO NOT bundle CSS - they rely on the parent app (pika-chat) to provide
 * Tailwind CSS. This is safer and avoids web components injecting global styles.
 *
 * Usage:
 *   pnpm run dev:wc     (builds once + watches for changes)
 *   pnpm run serve:wc   (serves built files on localhost:5173)
 *
 * Then set in pika-chat .env.local:
 *   WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js;weather.city-selector::http://localhost:5173/city-selector.js'
 */
export default defineConfig({
    plugins: [
        svelte({
            compilerOptions: {
                customElement: true
            },
            emitCss: false // Don't emit CSS - parent app provides Tailwind
        }),
        Icons({
            compiler: 'svelte'
        })
    ],
    resolve: {
        alias: {
            '$icons/': '~icons/',
            $lib: resolve(__dirname, 'src/webcomponent/lib')
        }
    },
    build: {
        outDir: 'dev-dist',
        lib: {
            entry: {
                'favorite-cities': resolve(__dirname, 'dev-entry/favorite-cities.ts'),
                'city-selector': resolve(__dirname, 'dev-entry/city-selector.ts'),
                'weather-alerts': resolve(__dirname, 'dev-entry/weather-alerts.ts'),
                'temperature-trend': resolve(__dirname, 'dev-entry/temperature-trend.ts'),
                'weather-comparison': resolve(__dirname, 'dev-entry/weather-comparison.ts'),
                'weather-fun-fact': resolve(__dirname, 'dev-entry/weather-fun-fact.ts'),
                'quick-weather-search': resolve(__dirname, 'dev-entry/quick-weather-search.ts'),
                'full-forecast': resolve(__dirname, 'dev-entry/full-forecast.ts')
            },
            formats: ['es'],
            fileName: (format, entryName) => `${entryName}.js`
        },
        rollupOptions: {
            external: [],
            output: {
                manualChunks: undefined
            }
        },
        minify: false, // Don't minify in dev for easier debugging
        watch: {}
    }
});
