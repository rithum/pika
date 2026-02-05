import type { StarlightSidebarTopicsUserConfig } from 'starlight-sidebar-topics';

export const sidebarTopics: StarlightSidebarTopicsUserConfig = [
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
                    { label: 'AI-Driven UI Architecture', slug: 'why/approach/ai-driven-ui' },
                    { label: 'Production-Ready', slug: 'why/approach/production-ready' },
                    { label: 'From Toy to Tool', slug: 'why/approach/toy-to-tool' }
                ]
            },
            { label: 'Who Is Pika For?', slug: 'why/who-is-pika-for' }
        ]
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
        icon: 'puzzle',
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
                    { label: 'Intent Router', slug: 'capabilities/intelligence/intent-router' },
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
                    { label: 'Context-Aware Widgets', slug: 'capabilities/customization/context-aware-widgets' },
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
        label: 'Guides',
        link: '/guides/',
        id: 'guides',
        icon: 'open-book',
        items: [
            { label: 'Overview', slug: 'guides' },
            {
                label: 'Deployment',
                collapsed: true,
                items: [
                    { label: 'Deploy to AWS with CDK', slug: 'guides/deployment/aws-cdk' },
                    { label: 'Deploy Using Serverless Framework', slug: 'guides/deployment/serverless-framework' },
                    { label: 'Set Up Local Development Environment', slug: 'guides/deployment/local-development' },
                    { label: 'Configure AWS Resource Tags', slug: 'guides/deployment/aws-resource-tags' }
                ]
            },
            {
                label: 'Agent Development',
                collapsed: true,
                items: [
                    { label: 'Define Agents Using Configuration', slug: 'guides/agent-development/define-agents' },
                    { label: 'Enable Multi-Agent Collaboration', slug: 'guides/agent-development/multi-agent-collaboration' },
                    { label: 'Implement Tool Use with Inline Tools', slug: 'guides/agent-development/inline-tools' },
                    { label: 'Integrate External APIs', slug: 'guides/agent-development/external-apis' },
                    { label: 'Use Model Context Protocol (MCP)', slug: 'guides/agent-development/mcp' }
                ]
            },
            {
                label: 'Authentication & Access',
                collapsed: true,
                items: [
                    { label: 'Integrate Your Authentication System', slug: 'guides/authentication/integrate-auth' },
                    { label: 'Configure Chat App Access Control', slug: 'guides/authentication/access-control' },
                    { label: 'Set Up User-to-Organization Mapping', slug: 'guides/authentication/user-org-mapping' }
                ]
            },
            {
                label: 'Customization',
                collapsed: true,
                items: [
                    { label: 'Customize the UI', slug: 'guides/customization/ui' },
                    { label: 'UI Theming', slug: 'guides/customization/theming' },
                    { label: 'Custom Logout Dialog', slug: 'guides/customization/custom-logout-dialog' },
                    { label: 'Client Lifecycle Hooks', slug: 'guides/customization/client-lifecycle-hooks' },
                    { label: 'Build Custom Web Components', slug: 'guides/customization/build-web-components' },
                    { label: 'Provide Context from Widgets', slug: 'guides/customization/widget-context' },
                    { label: 'Deploy Custom Web Components', slug: 'guides/customization/deploy-web-components' },
                    { label: 'Override Default Features', slug: 'guides/customization/override-features' },
                    { label: 'Extend User Data Models', slug: 'guides/customization/user-data-models' },
                    { label: 'Chat Disclaimer', slug: 'guides/customization/chat-disclaimer' }
                ]
            },
            {
                label: 'Data & Sessions',
                collapsed: true,
                items: [
                    { label: 'Configure User Memory', slug: 'guides/data-sessions/user-memory' },
                    { label: 'Manage User Sessions', slug: 'guides/data-sessions/session-management' },
                    { label: 'Work with Entities', slug: 'guides/data-sessions/entities' },
                    { label: 'Use Custom Message Tags', slug: 'guides/data-sessions/message-tags' }
                ]
            },
            {
                label: 'Intelligence Features',
                collapsed: true,
                items: [
                    { label: 'Intent Router', slug: 'guides/intelligence/intent-router' },
                    { label: 'Enable Self-Correcting Responses', slug: 'guides/intelligence/self-correcting' },
                    { label: 'Configure Answer Verification', slug: 'guides/intelligence/answer-verification' },
                    { label: 'Use Instruction Assistance', slug: 'guides/intelligence/instruction-assistance' },
                    { label: 'Implement Instruction Augmentation', slug: 'guides/intelligence/instruction-augmentation' }
                ]
            },
            {
                label: 'Admin & Operations',
                collapsed: true,
                items: [
                    { label: 'Set Up the Admin Site', slug: 'guides/admin/admin-site' },
                    { label: 'Manage Content', slug: 'guides/admin/content-admin' },
                    { label: 'Use Stack Management', slug: 'guides/admin/stack-management' },
                    { label: 'Monitor with Traces', slug: 'guides/admin/traces' },
                    { label: 'Track AI Model Costs', slug: 'guides/admin/track-costs' }
                ]
            },
            {
                label: 'Advanced Topics',
                collapsed: true,
                items: [
                    { label: 'Direct Agent Invocation', slug: 'guides/advanced/direct-invocation' },
                    { label: 'Custom Widget Tag Definitions', slug: 'guides/advanced/widget-tags' },
                    { label: 'Work with Pika UX Module', slug: 'guides/advanced/pika-ux-module' },
                    { label: 'Configure Sync System', slug: 'guides/advanced/sync-system' }
                ]
            }
        ]
    },
    {
        label: 'Concepts',
        link: '/concepts/',
        id: 'concepts',
        icon: 'document',
        items: [
            { label: 'Overview', slug: 'concepts' },
            {
                label: 'Platform Overview',
                collapsed: true,
                items: [
                    { label: 'What is Pika?', slug: 'concepts/overview/what-is-pika' },
                    { label: 'Core Philosophy', slug: 'concepts/overview/core-philosophy' },
                    { label: 'When to Use Pika', slug: 'concepts/overview/when-to-use' }
                ]
            },
            {
                label: 'Architecture',
                collapsed: true,
                items: [
                    { label: 'System Architecture', slug: 'concepts/architecture/system' },
                    { label: 'AWS Infrastructure', slug: 'concepts/architecture/aws' },
                    { label: 'Frontend Architecture', slug: 'concepts/architecture/frontend' },
                    { label: 'Security Architecture', slug: 'concepts/architecture/security' },
                    { label: 'Scalability Model', slug: 'concepts/architecture/scalability' }
                ]
            },
            {
                label: 'Key Concepts',
                collapsed: true,
                items: [
                    { label: 'Agents as Configuration', slug: 'concepts/key-concepts/agents-as-config' },
                    { label: 'Session Management', slug: 'concepts/key-concepts/sessions' },
                    { label: 'User Memory System', slug: 'concepts/key-concepts/user-memory' },
                    { label: 'Model Context Protocol', slug: 'concepts/key-concepts/mcp' },
                    { label: 'Self-Correcting Loop', slug: 'concepts/key-concepts/self-correcting' },
                    { label: 'Authentication & Access', slug: 'concepts/key-concepts/auth-access' },
                    { label: 'Entities & Multi-Tenancy', slug: 'concepts/key-concepts/entities' }
                ]
            },
            {
                label: 'How Pika Works',
                collapsed: true,
                items: [
                    { label: 'Request Lifecycle', slug: 'concepts/how-pika-works/request-lifecycle' },
                    { label: 'Agent Execution Flow', slug: 'concepts/how-pika-works/agent-execution' },
                    { label: 'Tool Invocation Process', slug: 'concepts/how-pika-works/tool-invocation' },
                    { label: 'Web Component Rendering', slug: 'concepts/how-pika-works/web-components' },
                    { label: 'Sync System Mechanics', slug: 'concepts/how-pika-works/sync-system' },
                    { label: 'Project Structure', slug: 'concepts/how-pika-works/project-structure' }
                ]
            }
        ]
    },
    {
        label: 'Reference',
        link: '/reference/',
        id: 'reference',
        icon: 'list-format',
        items: [
            { label: 'Overview', slug: 'reference' },
            {
                label: 'Configuration',
                collapsed: true,
                items: [
                    { label: 'Agent Configuration', slug: 'reference/configuration/agent' },
                    { label: 'Chat App Configuration', slug: 'reference/configuration/chat-app' },
                    { label: 'Tool Configuration', slug: 'reference/configuration/tool' },
                    { label: 'Platform Settings', slug: 'reference/configuration/platform-settings' },
                    { label: 'Site Features', slug: 'reference/configuration/site-features' },
                    { label: 'Stack Tags Configuration', slug: 'reference/configuration/stack-tags' },
                    { label: 'Inference Profile Names', slug: 'reference/configuration/inference-profiles' },
                    { label: 'Environment Variables', slug: 'reference/configuration/environment-variables' }
                ]
            },
            {
                label: 'API',
                collapsed: true,
                items: [
                    { label: 'REST API', slug: 'reference/api/rest' },
                    { label: 'Tag Definitions API', slug: 'reference/api/tag-definitions' },
                    { label: 'Markdown Conversion API', slug: 'reference/api/markdown-conversion' }
                ]
            },
            {
                label: 'CLI',
                items: [{ label: 'CLI Commands', slug: 'reference/cli' }]
            },
            {
                label: 'Types & Interfaces',
                collapsed: true,
                items: [
                    { label: 'Types Overview', slug: 'reference/types' },
                    { label: 'Agent & Tool Types', slug: 'reference/types/agent-tool' },
                    { label: 'Session & User Types', slug: 'reference/types/session-user' },
                    { label: 'Widget Context API', slug: 'reference/types/widget-context' }
                ]
            },
            {
                label: 'UI Components',
                collapsed: true,
                items: [
                    { label: 'pika-ux Module', slug: 'reference/ui-components/pika-ux' },
                    { label: 'Widget System', slug: 'reference/ui-components/widget-system' },
                    { label: 'Custom Components', slug: 'reference/ui-components/custom-components' }
                ]
            }
        ]
    },
    {
        label: 'Platform Info',
        link: '/platform/',
        id: 'platform',
        icon: 'information',
        items: [
            { label: 'Overview', slug: 'platform' },
            {
                label: 'Releases',
                collapsed: true,
                items: [
                    { label: 'Release Overview', slug: 'platform/releases' },
                    { label: 'Changelog', slug: 'platform/releases/changelog' },
                    {
                        label: 'Migration Guides',
                        collapsed: true,
                        items: [
                            { label: 'Overview', slug: 'platform/releases/migration-guides' },
                            { label: 'Upgrading to 0.17.0', slug: 'platform/releases/migration-guides/upgrading-to-0-17-0' },
                            { label: 'Upgrading to 0.15.0', slug: 'platform/releases/migration-guides/upgrading-to-0-15-0' },
                            { label: 'Upgrading to 0.11.0', slug: 'platform/releases/migration-guides/upgrading-to-0-11-0' },
                            { label: 'Upgrading to 0.5.0', slug: 'platform/releases/migration-guides/upgrading-to-0-5-0' }
                        ]
                    }
                ]
            },
            { label: 'Contributing', slug: 'platform/contributing' },
            { label: 'Troubleshooting', slug: 'platform/troubleshooting' },
            { label: 'Community & Support', slug: 'platform/community' }
        ]
    },
    {
        label: 'AI and LLMs',
        link: '/ai/',
        id: 'ai',
        icon: 'heart',
        items: [{ label: 'Overview', slug: 'ai' }]
    }
];

export const sidebarOptions = {
    exclude: ['/doc-instructions/**/*', '/course/**/*', '/ai/**/*']
};
