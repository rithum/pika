import type { TagDefinition, TagDefinitionWidget, WidgetRenderingContextType } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Registry for multi-context widgets (spotlight, canvas, dialog).
 * Unlike ComponentRegistry which handles inline message segments,
 * WidgetRegistry manages web components that render in various contexts.
 */
export class WidgetRegistry {
    private tagDefinitions: Map<string, TagDefinition<TagDefinitionWidget>> = new Map();

    /**
     * Register tag definitions from the server.
     * Called during chat app initialization.
     */
    registerTagDefinitions(tagDefs: TagDefinition<TagDefinitionWidget>[]) {
        for (const tagDef of tagDefs) {
            const key = `${tagDef.scope}.${tagDef.tag}`;
            this.tagDefinitions.set(key, tagDef);
        }
    }

    /**
     * Get a tag definition by scope and tag name.
     */
    getTagDefinition(scope: string, tag: string): TagDefinition<TagDefinitionWidget> | undefined {
        return this.tagDefinitions.get(`${scope}.${tag}`);
    }

    /**
     * Get all tag definitions that support a specific rendering context.
     */
    getTagsForContext(renderingContext: WidgetRenderingContextType): TagDefinition<TagDefinitionWidget>[] {
        return Array.from(this.tagDefinitions.values()).filter((tagDef) => tagDef.renderingContexts?.[renderingContext]?.enabled === true);
    }

    /**
     * Get all registered tag definitions.
     */
    getAllTagDefinitions(): TagDefinition<TagDefinitionWidget>[] {
        return Array.from(this.tagDefinitions.values());
    }
}
