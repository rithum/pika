import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
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
 * Usage:
 *   pnpm run dev:wc     (builds once + watches for changes)
 *   pnpm run serve:wc   (serves built files on localhost:5173)
 *
 * Then set in pika-chat .env.local:
 *   WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js;weather.city-selector::http://localhost:5173/city-selector.js'
 */
export default defineConfig({
    plugins: [
        tailwindcss(),
        svelte({
            compilerOptions: {
                // Ensure custom elements are compiled correctly
                customElement: true
            }
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
        outDir: 'dev-dist', // Output to dev-dist/ to separate from production build/
        // Multi-entry library build
        // Each entry point imports the component + styles
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
                inlineDynamicImports: false
            }
        },
        cssCodeSplit: false,
        minify: false, // Don't minify in dev for easier debugging
        watch: {} // Enable watch mode
    }
});
