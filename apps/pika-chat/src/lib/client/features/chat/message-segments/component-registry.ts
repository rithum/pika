import type { Component } from 'svelte';
import type { MetadataTagHandler } from './segment-types';
import { defaultRenderers, defaultMetadataHandlers } from './default-components/index';
import { customRenderers, customMetadataHandlers } from './custom-components/index';

/**
 * This maintains a mapping of tag types to components for rendering.
 * A chat message may include a mix of text and XML tags.  There is a text renderer.  There are
 * some tags that are meant to be rendered inline and there are some tags that are just metadata
 * and that need to cause some side effect to be taken but don't render inline necessarily.
 *
 * For example, the <chart> tag is rendered as a chat.js chart by default.
 * Text is rendered as markdown by default.
 * A <trace> tag is a metadata tag that causes the trace to be added to the chat message's trace array.
 *
 * The `renderers` map is used to map tag types to components for rendering.
 * The `metadataHandler` map is used to map tag types to functions that handle metadata tags.
 *
 * The `renderers` map is populated with the default renderers (@see default-components/index.ts).
 * The `metadataHandler` map is populated with the default metadata handlers (@see default-components/index.ts).
 *
 * If you want to override the default renderers, you can do so by registering a new renderer for the tag type.
 * If you want to override the default metadata handlers, you can do so by registering a new metadata handler for the tag type.
 *
 * If you want to add a new tag type, you can do so by registering a new renderer for the tag type
 * in @see custom-components/index.ts.
 *
 * If you want to add a new metadata tag type, you can do so by registering a new metadata handler for the
 * tag type in @see custom-components/index.ts.
 */
export class ComponentRegistry {
    private renderers: Record<string, Component<any>> = {};
    private metadataHandlers: Record<string, MetadataTagHandler> = {};

    private constructor() {}

    /** Create a ComponentRegistry with all default and custom renderers and metadata handlers registered */
    static create(): ComponentRegistry {
        const registry = new ComponentRegistry();

        // Register default renderers
        for (const [type, renderer] of Object.entries(defaultRenderers)) {
            registry.registerRenderer(type, renderer);
        }

        // Register default metadata handlers
        for (const [type, handler] of Object.entries(defaultMetadataHandlers)) {
            registry.registerMetadataHandler(type, handler);
        }

        // Register custom renderers
        for (const [type, renderer] of Object.entries(customRenderers)) {
            registry.registerRenderer(type, renderer);
        }

        // Register custom metadata handlers
        for (const [type, handler] of Object.entries(customMetadataHandlers)) {
            registry.registerMetadataHandler(type, handler);
        }

        return registry;
    }

    /** Register a segment renderer */
    registerRenderer(type: string, renderer: Component<any>): void {
        this.renderers[type] = renderer;
    }

    /** Get a registered renderer by type */
    getRenderer(type: string): Component<any> | undefined {
        return this.renderers[type];
    }

    /** Get a registered metadata handler by type */
    getMetadataHandler(type: string): MetadataTagHandler | undefined {
        return this.metadataHandlers[type];
    }

    /** Get all registered renderers */
    getAllRenderers(): Record<string, Component<any>> {
        return { ...this.renderers };
    }

    /** Get all registered metadata handlers */
    getAllMetadataHandlers(): Record<string, MetadataTagHandler> {
        return { ...this.metadataHandlers };
    }

    /** Check if a renderer is registered for a specific type */
    hasRenderer(type: string): boolean {
        return type in this.renderers;
    }

    /** Check if a metadata handler is registered for a specific type */
    hasMetadataHandler(type: string): boolean {
        return type in this.metadataHandlers;
    }

    /** Unregister a renderer */
    unregisterRenderer(type: string): boolean {
        if (this.renderers[type]) {
            delete this.renderers[type];
            return true;
        }
        return false;
    }

    /** Unregister a metadata handler */
    unregisterMetadataHandler(type: string): boolean {
        if (this.metadataHandlers[type]) {
            delete this.metadataHandlers[type];
            return true;
        }
        return false;
    }

    /** Get list of all registered renderer types */
    getRegisteredRendererTypes(): string[] {
        return Object.keys(this.renderers);
    }

    /** Get list of all registered metadata handler types */
    getRegisteredMetadataHandlerTypes(): string[] {
        return Object.keys(this.metadataHandlers);
    }

    /** Register a metadata handler */
    registerMetadataHandler(type: string, handler: MetadataTagHandler): void {
        this.metadataHandlers[type] = handler;
    }
}
