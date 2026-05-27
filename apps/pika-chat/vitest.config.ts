/**
 * Vitest configuration for Svelte component tests only.
 *
 * jsdom is used as the test environment (not happy-dom).
 * happy-dom has a rendering gap with Svelte 5: {#if}/{#each} blocks inside a
 * static <div> inside a component's children snippet silently fail to render.
 * jsdom does not have this gap. Production Svelte 5 renders both correctly;
 * this is a happy-dom incompatibility, not a Svelte 5 or template limitation.
 *
 * Jest remains the runner for all other tests (hooks, integration).
 * Run component tests via: pnpm test:components
 */
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

const mockDir = resolve(__dirname, 'test/__mocks__');

export default defineConfig({
    plugins: [svelte({ hot: false })],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./test/vitest-setup.ts'],
        include: ['test/components/**/*.test.ts', 'test/components/**/*.spec.ts'],
    },
    resolve: {
        // 'browser' ensures Svelte resolves to index-client.js (not index-server.js)
        conditions: ['browser', 'import', 'module', 'default'],
        alias: [
            // SvelteKit path aliases
            { find: '$lib', replacement: resolve(__dirname, 'src/lib') },
            { find: '$client', replacement: resolve(__dirname, 'src/lib/client') },
            // Workspace packages
            { find: 'pika-shared', replacement: resolve(__dirname, '../../packages/shared/src') },
            // pika-ux stubs — use passthrough components for structural assertions
            { find: 'pika-ux/shadcn/sidebar', replacement: resolve(mockDir, 'pika-ux-sidebar.ts') },
            { find: 'pika-ux/shadcn/button', replacement: resolve(mockDir, 'pika-ux-button.ts') },
            // Icon virtual modules — render nothing in tests (list each used in chat-nav)
            { find: '$icons/lucide/pin-off', replacement: resolve(mockDir, 'noop.svelte') },
            { find: '$icons/lucide/share-2', replacement: resolve(mockDir, 'noop.svelte') },
        ],
    },
});
