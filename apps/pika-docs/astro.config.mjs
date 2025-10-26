// @ts-check
import markdoc from '@astrojs/markdoc';
import starlight from '@astrojs/starlight';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import mermaid from 'astro-mermaid';
import { defineConfig } from 'astro/config';
import { badgePreprocessorIntegration } from './integrations/badge-preprocessor.mjs';
import starlightSidebarTopics from 'starlight-sidebar-topics';

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
                PageTitle: './src/overrides/PageTitle.astro'
            },
            expressiveCode: {
                // Configure to use our custom config that skips mermaid
                useStarlightDarkModeSwitch: true
            },
            plugins: [
                starlightSidebarTopics(
                    [
                        {
                            label: 'Why Pika',
                            link: '/why/',
                            id: 'why',
                            icon: 'star',
                            items: [
                                { label: 'Overview', slug: 'why' },
                                { label: 'Why Not Build It Yourself?', slug: 'why/why-not-build' },
                                {
                                    label: 'The Pika Approach',
                                    collapsed: false,
                                    items: [
                                        { label: 'Overview', slug: 'why/approach' },
                                        { label: 'AWS Foundation', slug: 'why/approach/aws-foundation' },
                                        { label: 'Agent-as-Config', slug: 'why/approach/agent-as-config' },
                                        { label: 'Production-Ready', slug: 'why/approach/production-ready' },
                                        { label: 'From Toy to Tool', slug: 'why/approach/toy-to-tool' }
                                    ]
                                },
                                { label: 'Who Is Pika For?', slug: 'why/who-is-pika-for' }
                            ]
                        },
                        {
                            label: 'Course',
                            link: '/course/',
                            id: 'course',
                            icon: 'rocket',
                            items: [{ label: 'Welcome', slug: 'course' }]
                        },
                        {
                            label: 'Getting Started',
                            link: '/getting-started/',
                            id: 'getting-started',
                            icon: 'rocket',
                            items: [
                                { label: 'Overview', slug: 'getting-started' },
                                { label: 'Quick Start', slug: 'getting-started/quickstart' },
                                { label: 'Installation Guide', slug: 'getting-started/installation' },
                                { label: 'Hello World Tutorial', slug: 'getting-started/hello-world' },
                                { label: 'Review Weather Sample', slug: 'getting-started/weather-sample' },
                                { label: 'Next Steps', slug: 'getting-started/next-steps' }
                            ]
                        },
                        {
                            label: 'Capabilities',
                            link: '/capabilities/',
                            id: 'capabilities',
                            icon: 'star',
                            items: [
                                { label: 'Overview', slug: 'capabilities' },
                                {
                                    label: 'Core Platform',
                                    collapsed: false,
                                    items: [
                                        { label: 'Advanced Chat Apps', slug: 'capabilities/core/advanced-chat-apps' },
                                        { label: 'Multi-Agent Orchestration', slug: 'capabilities/core/multi-agent' },
                                        { label: 'Agent-as-Configuration', slug: 'capabilities/core/agents-as-config' },
                                        { label: 'Production-Grade Security', slug: 'capabilities/core/security' }
                                    ]
                                },
                                {
                                    label: 'Intelligence',
                                    collapsed: true,
                                    items: [
                                        { label: 'Intelligent Prompt Engineering', slug: 'capabilities/customization/prompt-engineering' },
                                        { label: 'Self-Correcting Responses', slug: 'capabilities/intelligence/self-correcting' },
                                        { label: 'Answer Reasoning', slug: 'capabilities/intelligence/answer-reasoning' },
                                        { label: 'LLM-Generated Feedback', slug: 'capabilities/intelligence/llm-feedback' },
                                        { label: 'AI-Driven Insights', slug: 'capabilities/intelligence/insights' }
                                    ]
                                },
                                {
                                    label: 'Integration',
                                    collapsed: true,
                                    items: [
                                        { label: 'Model Context Protocol', slug: 'capabilities/integration/mcp' },
                                        { label: 'Inline Tools', slug: 'capabilities/integration/inline-tools' },
                                        { label: 'Direct Agent Invocation', slug: 'capabilities/integration/direct-invocation' }
                                    ]
                                },
                                {
                                    label: 'Customization',
                                    collapsed: true,
                                    items: [
                                        { label: 'Custom Web Components', slug: 'capabilities/customization/web-components' },
                                        { label: 'AI-Driven UI', slug: 'capabilities/customization/ai-ui' },
                                        { label: 'Feature Overrides', slug: 'capabilities/customization/feature-overrides' }
                                    ]
                                },
                                {
                                    label: 'Data & Memory',
                                    collapsed: true,
                                    items: [
                                        { label: 'User Memory', slug: 'capabilities/data-memory/user-memory' },
                                        { label: 'Session Management', slug: 'capabilities/data-memory/session-management' }
                                    ]
                                },
                                {
                                    label: 'Enterprise',
                                    collapsed: true,
                                    items: [
                                        { label: 'Admin Site', slug: 'capabilities/enterprise/admin-site' },
                                        { label: 'Access Control', slug: 'capabilities/enterprise/access-control' },
                                        { label: 'Multi-Tenancy', slug: 'capabilities/enterprise/multi-tenancy' },
                                        { label: 'Entity Management', slug: 'capabilities/enterprise/entity-management' }
                                    ]
                                }
                            ]
                        },
                        {
                            label: 'Concepts',
                            link: '/concepts/',
                            id: 'concepts',
                            icon: 'puzzle',
                            items: [{ label: 'Overview', slug: 'concepts' }]
                        },
                        {
                            label: 'Reference',
                            link: '/reference/',
                            id: 'reference',
                            icon: 'information',
                            items: [{ label: 'Overview', slug: 'reference' }]
                        },
                        {
                            label: 'AI and LLMs',
                            link: '/ai/',
                            id: 'ai',
                            icon: 'star',
                            items: [{ label: 'Overview', slug: 'ai' }]
                        }
                    ],
                    {
                        exclude: ['/doc-instructions/**/*']
                    }
                )
            ],
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
