// ec.config.mjs
import { defineEcConfig } from 'astro-expressive-code';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginColorChips } from 'expressive-code-color-chips';

/**
 * Custom plugin to skip mermaid code blocks
 * Let astro-mermaid handle them instead
 */
function pluginSkipMermaid() {
    return {
        name: 'Skip Mermaid Blocks',
        hooks: {
            postprocessRenderedBlock: (context) => {
                // If this is a mermaid block, replace the rendered output with raw pre+code
                if (context.codeBlock.language === 'mermaid') {
                    console.log('Replacing mermaid block with raw HTML');

                    // Return raw HTML that astro-mermaid can process
                    const code = context.codeBlock.code;
                    context.renderData.blockAst = {
                        type: 'element',
                        tagName: 'pre',
                        properties: { className: ['mermaid'] },
                        children: [
                            {
                                type: 'text',
                                value: code
                            }
                        ]
                    };
                }
            }
        }
    };
}

export default defineEcConfig({
    plugins: [
        pluginSkipMermaid(), // Add this first to skip mermaid blocks
        pluginLineNumbers(),
        pluginCollapsibleSections(),
        pluginColorChips()
        // pluginCodeOutput(),
    ],

    // Global settings - integrate with Starlight's theme system
    themes: ['github-light', 'github-dark'],

    // Default props for all code blocks
    defaultProps: {
        showLineNumbers: false,
        wrap: false,
        preserveIndent: true
    },

    // Built-in frames plugin configuration
    frames: {
        showCopyToClipboardButton: true,
        removeCommentsWhenCopyingTerminalFrames: true,
        extractFileNameFromCode: true
    },

    // Built-in Shiki plugin configuration
    shiki: {
        langs: [] // Use all languages
    },
    // Style overrides for custom styling
    styleOverrides: {
        borderRadius: '6px',
        borderColor: '#e5e7eb',
        borderWidth: '1px',
        // Subtle gray background for code blocks in light theme (terminals use their own bg)
        codeBackground: '#f9fafb',
        // Custom CSS for frames
        frames: {
            frameBoxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            editorTabBarBackground: '#f9fafb',
            editorTabBorderRadius: '4px'
        },
        // Custom CSS for line numbers
        lineNumbers: {
            lineNumberColor: '#6b7280',
            highlightedLineNumberColor: '#374151'
        },
        // Custom CSS for text markers
        textMarkers: {
            markHue: '310',
            borderOpacity: '50%',
            markBackground: 'hsla(var(--ec-tm-markHue), 40%, 90%, 0.5)',
            insBackground: 'hsla(120, 40%, 90%, 0.5)',
            delBackground: 'hsla(0, 40%, 90%, 0.5)'
        }
    },

    // Accessibility settings
    minSyntaxHighlightingColorContrast: 5.5,

    // Performance settings
    tabWidth: 2,

    // Locale settings
    defaultLocale: 'en-US'
});
