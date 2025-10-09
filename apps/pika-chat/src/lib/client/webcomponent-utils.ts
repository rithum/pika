import type { TagDefinition, TagDefinitionWidgetWebComponent } from 'pika-shared/types/chatbot/chatbot-types';
import type { PikaWCContext, PikaWCContextRequestEvent } from 'pika-shared/types/chatbot/webcomp-types';

// Global registry of loaded URLs (per page load)
const loadedWebComponentUrls = new Set<string>();

// Global registry of loaded web component files by their actual file location
// Tracks which files have been loaded to prevent duplicate loads
// A single file can define multiple custom elements, so we just track the file, not the element names
const loadedWebComponentFiles = new Set<string>();

/**
 * Get a unique identifier for the actual web component file.
 * This is used to track which files have been loaded and prevent the same file
 * from being loaded multiple times, even if accessed via different proxy URLs.
 *
 * @param tagDef The tag definition containing web component info
 * @returns A unique identifier for the file (e.g., "s3:bucket/key" or "url:https://...")
 */
function getWebComponentFileId(tagDef: TagDefinition<TagDefinitionWidgetWebComponent>): string {
    const webComp = tagDef.widget.webComponent;

    if (webComp.url) {
        // For direct URLs, use the URL itself as the identifier
        return `url:${webComp.url}`;
    } else if (webComp.s3) {
        // For S3 files, use bucket+key as the identifier
        // This ensures the same S3 file is only loaded once
        return `s3:${webComp.s3.s3Bucket}/${webComp.s3.s3Key}`;
    }

    throw new Error(`Web component for ${tagDef.scope}.${tagDef.tag} must have either url or s3 defined`);
}

/**
 * Resolve the URL for a web component from its tag definition.
 */
export function resolveWebComponentUrl(tagDef: TagDefinition<TagDefinitionWidgetWebComponent>): string {
    const webComp = tagDef.widget.webComponent;

    if (webComp.url) {
        return webComp.url; // Use direct URL
    } else if (webComp.s3) {
        // Construct S3 proxy URL
        return `/api/webcomponent/${tagDef.scope}/${tagDef.tag}`;
    } else {
        throw new Error(`Web component for ${tagDef.scope}.${tagDef.tag} must have either url or s3 defined`);
    }
}

/**
 * Dynamically load a web component from a URL.
 * Intelligently handles:
 * - Already loaded URLs (skip re-loading)
 * - Already registered custom elements (skip re-registration)
 * - Widget bundles (multiple components in one file)
 */
export async function loadWebComponentByUrl(tagName: string, url: string): Promise<void> {
    if (typeof window === 'undefined') return;

    // Check if this specific custom element is already registered
    if (customElements.get(tagName)) {
        // console.log(`[Web Component Loader] ${tagName} already registered, skipping load`);
        return;
    }

    // Check if we've already loaded this URL
    if (loadedWebComponentUrls.has(url)) {
        // console.log(`[Web Component Loader] URL ${url} already loaded`);

        // URL is loaded but custom element isn't registered
        // This might mean:
        // 1. The file didn't properly register the element (error)
        // 2. The element is registered under a different name (error in tag def)
        if (!customElements.get(tagName)) {
            throw new Error(`Custom element ${tagName} not found even though ${url} was loaded. ` + `Possible causes: file doesn't define '${tagName}', or tag name mismatch.`);
        }
        return;
    }

    // Load the JavaScript file
    // console.log(`[Web Component Loader] Loading ${tagName} from ${url}`);
    try {
        await import(/* @vite-ignore */ url);

        // Mark this URL as loaded
        loadedWebComponentUrls.add(url);

        // Verify the expected custom element was registered
        // Note: The file might register multiple elements (widget bundle)
        if (!customElements.get(tagName)) {
            throw new Error(`Custom element ${tagName} not defined after loading ${url}. ` + `Check that the file calls customElements.define('${tagName}', ...)`);
        }

        // console.log(`[Web Component Loader] Successfully loaded and registered ${tagName}`);
    } catch (error) {
        console.error(`[Web Component Loader] Error loading web component ${tagName} from ${url}:`, error);
        throw error;
    }
}

/**
 * Inject a web component into a DOM element with Pika context.
 * Handles URL resolution automatically based on tag definition.
 *
 * @param tagDef The tag definition containing web component info
 * @param el The container element to inject into
 * @param contextRequest The Pika context to provide
 * @param replaceEl If true, replaces all children; if false, appends
 */
export async function injectChatAppWebComponent(
    tagDef: TagDefinition<TagDefinitionWidgetWebComponent>,
    el: HTMLElement,
    contextRequest: PikaWCContext,
    replaceEl: boolean = true
): Promise<void> {
    // Use customElementName if provided, otherwise construct from scope.tag
    const customElementName = tagDef.widget.webComponent.customElementName || `${tagDef.scope}.${tagDef.tag}`;
    const url = resolveWebComponentUrl(tagDef);
    const fileId = getWebComponentFileId(tagDef);

    // console.log(`[Web Component Loader] Injecting ${customElementName} from ${url}`, {
    //     tagDef: `${tagDef.scope}.${tagDef.tag}`,
    //     customElementName,
    //     fileId,
    //     contextRequest,
    //     replaceEl
    // });

    // 1. Check if this file has been loaded before (by actual file location, not proxy URL)
    if (loadedWebComponentFiles.has(fileId)) {
        // File was already loaded - verify the custom element we need is registered
        // console.log(`[Web Component Loader] File ${fileId} already loaded, checking for element ${customElementName}`);

        if (!customElements.get(customElementName)) {
            throw new Error(
                `Custom element ${customElementName} not found even though file ${fileId} was previously loaded. ` +
                    `This indicates the JavaScript file "${fileId}" doesn't define a custom element named "${customElementName}". ` +
                    `Check that the file calls customElements.define('${customElementName}', ...) or update the tag definition's customElementName.`
            );
        }

        // console.log(`[Web Component Loader] Element ${customElementName} found, ready to use`);
    } else {
        // File hasn't been loaded yet - load it and track it by file location
        // console.log(`[Web Component Loader] Loading file ${fileId} for element ${customElementName}`);

        // Check if custom element is already registered (shouldn't be, but safety check)
        if (customElements.get(customElementName)) {
            // console.log(`[Web Component Loader] ${customElementName} already registered, skipping load`);
        } else {
            // Load the JavaScript file
            try {
                await import(/* @vite-ignore */ url);

                // Verify the expected custom element was registered
                if (!customElements.get(customElementName)) {
                    throw new Error(
                        `Custom element ${customElementName} not defined after loading ${url}. ` + `Check that the file calls customElements.define('${customElementName}', ...)`
                    );
                }

                // console.log(`[Web Component Loader] Successfully loaded and registered ${customElementName}`);
            } catch (error) {
                console.error(`[Web Component Loader] Error loading web component ${customElementName} from ${url}:`, error);
                throw new Error(`[Web Component Loader] Error loading web component ${customElementName} from ${url}`, { cause: error });
            }
        }

        // Mark this file as loaded (by actual file location, not proxy URL)
        loadedWebComponentFiles.add(fileId);
        // console.log(`[Web Component Loader] File ${fileId} loaded and registered`);
    }

    // 2. Create instance
    const newEl = document.createElement(customElementName);

    // 3. Set up context provider
    newEl.addEventListener('pika-context-request', (event: PikaWCContextRequestEvent) => {
        event.detail.callback(contextRequest);
    });

    // 4. Inject into DOM
    if (replaceEl) {
        el.replaceChildren(newEl);
    } else {
        el.appendChild(newEl);
    }
}
