import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * Astro integration to preprocess .mdoc files and transform :badge[text] syntax
 * This runs before Markdoc processes the files
 */
export function badgePreprocessorIntegration() {
    return {
        name: 'badge-preprocessor',
        hooks: {
            'astro:config:setup': ({ updateConfig, config }) => {
                // Add a Vite plugin that preprocesses .mdoc files
                updateConfig({
                    vite: {
                        plugins: [
                            {
                                name: 'mdoc-badge-transform',
                                enforce: 'pre',

                                transform(code, id) {
                                    // Only process .mdoc files
                                    if (!id.endsWith('.mdoc')) {
                                        return null;
                                    }

                                    // Transform :badge[text] or :badge[text]{variant="tip"}
                                    // into {% badge text="text" variant="tip" /%}
                                    const transformed = code.replace(/:badge\[([^\]]+)\](?:\{([^}]+)\})?/g, (match, text, attrs) => {
                                        const attributes = attrs ? ` ${attrs}` : '';
                                        return `{% badge text="${text}"${attributes} /%}`;
                                    });

                                    // Only return if we made changes
                                    if (transformed !== code) {
                                        return {
                                            code: transformed,
                                            map: null
                                        };
                                    }

                                    return null;
                                }
                            }
                        ]
                    }
                });
            }
        }
    };
}
