import MarkdownIt from 'markdown-it';
import type { MarkdownRendererConfig } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Factory for creating and caching markdown-it renderer instances.
 * Instances are cached based on their configuration to avoid recreating
 * renderers with the same settings.
 */
export class MarkdownRendererFactory {
    private cache = new Map<string, MarkdownIt>();

    /**
     * Get a markdown renderer with the specified configuration.
     * Returns a cached instance if one exists with the same config.
     * @param config - Configuration options for the markdown renderer
     * @returns A configured markdown-it instance
     */
    getRenderer(config?: MarkdownRendererConfig): MarkdownIt {
        // Use default config if none provided
        const effectiveConfig: MarkdownRendererConfig = {
            html: true,
            linkify: true,
            typographer: true,
            breaks: true,
            ...config
        };

        // Create cache key from config
        const cacheKey = this.createCacheKey(effectiveConfig);

        // Return cached instance if it exists
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Create new instance with config
        const renderer = new MarkdownIt(effectiveConfig);

        // Cache and return
        this.cache.set(cacheKey, renderer);
        return renderer;
    }

    /**
     * Create a cache key from the configuration object.
     * For configs with highlight functions, uses the highlightCacheKey to identify them.
     */
    private createCacheKey(config: MarkdownRendererConfig): string {
        // Create a serializable version of the config for caching
        const cacheableConfig = {
            html: config.html,
            linkify: config.linkify,
            typographer: config.typographer,
            breaks: config.breaks,
            // Use highlightCacheKey if highlight function is provided
            highlight: config.highlight ? config.highlightCacheKey || 'custom-highlight' : undefined
        };
        return JSON.stringify(cacheableConfig);
    }

    /**
     * Clear the cache of all renderer instances.
     * Useful for memory management in long-running applications.
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get the number of cached renderer instances
     */
    getCacheSize(): number {
        return this.cache.size;
    }
}

