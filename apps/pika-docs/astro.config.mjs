// @ts-check
import markdoc from '@astrojs/markdoc';
import starlight from '@astrojs/starlight';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import mermaid from 'astro-mermaid';
import { defineConfig } from 'astro/config';
import { badgePreprocessorIntegration } from './integrations/badge-preprocessor.mjs';
import starlightSidebarTopics from 'starlight-sidebar-topics';
import { sidebarOptions, sidebarTopics } from './sidebar-config.ts';

// https://astro.build/config
export default defineConfig({
    integrations: [
        badgePreprocessorIntegration(), // Must come before markdoc
        mermaid({
            theme: 'forest',
            autoTheme: true,
            mermaidConfig: {
                flowchart: {
                    curve: 'basis'
                }
            },

            // Register icon packs for use in diagrams
            iconPacks: [
                {
                    name: 'logos',
                    loader: () => fetch('https://unpkg.com/@iconify-json/logos@1/icons.json').then((res) => res.json())
                },
                {
                    name: 'iconoir',
                    loader: () => fetch('https://unpkg.com/@iconify-json/iconoir@1/icons.json').then((res) => res.json())
                }
            ]
        }),
        starlight({
            title: 'Pika Platform',
            description: 'An AWS agentic framework for chat apps and agents',
            social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/rithum/pika' }],
            logo: {
                src: './public/img/logos/pika-logo-only.png'
            },
            favicon: 'favicon-32x32.png',
            components: {
                TableOfContents: './src/overrides/TableOfContents.astro',
                MobileTableOfContents: './src/overrides/MobileTableOfContents.astro',
                PageTitle: './src/overrides/PageTitle.astro',
                ContentPanel: './src/overrides/ContentPanel.astro'
            },
            expressiveCode: {
                // Expressive Code is configured in ec.config.mjs
            },
            plugins: [starlightSidebarTopics(sidebarTopics, sidebarOptions)],
            customCss: ['./src/styles/global.css'],
            head: [
                {
                    tag: 'script',
                    attrs: {
                        src: '/src/scripts/toc-badges.ts',
                        type: 'module'
                    }
                }
            ]
        }),
        markdoc(),
        svelte()
    ],
    vite: {
        plugins: [tailwindcss()]
    }
});
