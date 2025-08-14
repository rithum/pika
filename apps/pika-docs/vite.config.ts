import { defaultTheme } from '@sveltepress/theme-default';
import { sveltepress } from '@sveltepress/vite';
import { defineConfig, loadEnv } from 'vite';
import { createTwoslashOptions } from './scripts/twoslash-highlighter';

export default defineConfig(async ({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const hasDocsearch = Boolean(env.VITE_DOCSEARCH_APP_ID && env.VITE_DOCSEARCH_API_KEY && env.VITE_DOCSEARCH_INDEX_NAME);
    const twoslash = await createTwoslashOptions();

    const themeOptions: Record<string, unknown> = {
        navbar: [
            { title: 'Home', to: '/' },
            { title: 'GitHub', to: 'https://github.com/rithum/pika', external: true }
        ],
        sidebar: {
            '/docs/': [
                {
                    title: 'Cheatsheets',
                    collapsible: false,
                    items: [
                        { title: 'Pika Features Cheat Sheet', to: '/docs/cheatsheets/features-cheatsheet/' },
                        { title: 'Pika Features Overview', to: '/docs/cheatsheets/features/' }
                    ]
                },
                {
                    title: 'Developer Guide',
                    collapsible: true,
                    items: [
                        { title: 'Getting Started', to: '/docs/developer/getting-started/' },
                        { title: 'Installation', to: '/docs/developer/installation/' },
                        { title: 'Project Structure', to: '/docs/developer/project-structure/' },
                        { title: 'Local Development', to: '/docs/developer/local-development/' },
                        { title: 'Sync System', to: '/docs/developer/sync-system/' },
                        { title: 'Customization', to: '/docs/developer/customization/' },
                        { title: 'Authentication', to: '/docs/developer/authentication/' },
                        { title: 'Chat App Access Control', to: '/docs/developer/chat-app-access-control/' },
                        { title: 'Overriding Features', to: '/docs/developer/overriding-features/' },
                        { title: 'Traces Feature', to: '/docs/developer/traces-feature/' },
                        { title: 'Verify Response Feature', to: '/docs/developer/verify-response-feature/' },
                        { title: 'Chat Disclaimer Notice', to: '/docs/developer/chat-disclaimer-notice-feature/' },
                        { title: 'Overriding User Data', to: '/docs/developer/overriding-user-data/' },
                        { title: 'Entity Feature', to: '/docs/developer/entity-feature/' },
                        { title: 'Site Admin Feature', to: '/docs/developer/site-admin-feature/' },
                        { title: 'Content Admin', to: '/docs/developer/content-admin/' },
                        { title: 'Stack Management', to: '/docs/developer/stack-management/' },
                        { title: 'AWS Deployment', to: '/docs/developer/aws-deployment/' },
                        { title: 'Troubleshooting', to: '/docs/developer/troubleshooting/' }
                    ]
                },
                {
                    title: 'Overview',
                    collapsible: true,
                    items: [{ title: 'Docs Overview', to: '/docs/overview/' }]
                }
            ]
        },
        github: 'https://github.com/rithum/pika',
        editLink: 'https://github.com/rithum/pika/edit/main/apps/pika-docs/src/routes/:route',
        logo: '/assets/pika-logo.svg',
        highlighter: { twoslash: true, languages: ['svelte', 'ts', 'js', 'json', 'html', 'css', 'scss', 'md', 'sh'] },
        themeColor: { light: '#f2f2f2', dark: '#18181b' },
        preBuildIconifyIcons: {
            logos: ['svelte-kit', 'typescript-icon'],
            'vscode-icons': ['file-type-svelte', 'file-type-markdown', 'file-type-vite']
        }
    };

    if (hasDocsearch) {
        themeOptions.docsearch = {
            appId: env.VITE_DOCSEARCH_APP_ID,
            apiKey: env.VITE_DOCSEARCH_API_KEY,
            indexName: env.VITE_DOCSEARCH_INDEX_NAME
        };
    }

    return {
        plugins: [
            sveltepress({
                theme: defaultTheme({
                    ...themeOptions,
                    highlighter: {
                        ...(themeOptions as any).highlighter
                    }
                }),
                siteConfig: {
                    title: 'Pika Platform',
                    description: 'Build, deploy, and operate agentic apps with confidence'
                }
            })
        ]
    };
});
