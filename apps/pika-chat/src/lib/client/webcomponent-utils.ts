import type { TagDefinition, TagDefinitionWidget, TagDefinitionWidgetWebComponent } from 'pika-shared/types/chatbot/chatbot-types';
import type { PikaWCContext, PikaWCContextRequestEvent, PikaWCContextWithoutInstanceId } from 'pika-shared/types/chatbot/webcomp-types';
import { v7 as uuidv7 } from 'uuid';

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
 * @param tagDef The tag definition Øcontaining web component info
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
 * Build a map of S3 file locations to canonical tag definitions.
 * This allows multiple tags pointing to the same S3 file to share a single URL.
 *
 * @param tagDefinitions All available tag definitions
 * @returns Map from S3 file ID to the canonical tag definition for that file
 */
function buildCanonicalTagMap(tagDefinitions: TagDefinition<TagDefinitionWidgetWebComponent>[]): Map<string, TagDefinition<TagDefinitionWidgetWebComponent>> {
    const canonicalMap = new Map<string, TagDefinition<TagDefinitionWidgetWebComponent>>();

    // Group tags by their S3 file location
    for (const tagDef of tagDefinitions) {
        if (tagDef.widget.type !== 'web-component') continue;

        // Skip tags with direct URLs - they manage their own loading
        if (tagDef.widget.webComponent.url) continue;

        // Skip if no S3 config
        if (!tagDef.widget.webComponent.s3) continue;

        const fileId = getWebComponentFileId(tagDef);

        // If this is the first tag for this file, or if this tag comes earlier alphabetically, use it as canonical
        const existingCanonical = canonicalMap.get(fileId);
        const currentKey = `${tagDef.scope}.${tagDef.tag}`;

        if (!existingCanonical) {
            canonicalMap.set(fileId, tagDef);
        } else {
            const existingKey = `${existingCanonical.scope}.${existingCanonical.tag}`;
            if (currentKey < existingKey) {
                canonicalMap.set(fileId, tagDef);
            }
        }
    }

    return canonicalMap;
}

// Global map of canonical tags, built once when needed
let canonicalTagMap: Map<string, TagDefinition<TagDefinitionWidgetWebComponent>> | null = null;

/**
 * Initialize or update the canonical tag map with current tag definitions.
 * Should be called when tag definitions are loaded or updated.
 */
export function initializeCanonicalTagMap(tagDefinitions: TagDefinition<TagDefinitionWidget>[]): void {
    const webComponentTags = tagDefinitions.filter((t): t is TagDefinition<TagDefinitionWidgetWebComponent> => t.widget.type === 'web-component');
    canonicalTagMap = buildCanonicalTagMap(webComponentTags);
}

/**
 * Resolve the URL for a web component from its tag definition.
 * For S3 files, uses a canonical scope/tag combination to ensure files are only
 * loaded once even when multiple tags share the same file.
 * This maintains security by only sending scope/tag to the server.
 */
export function resolveWebComponentUrl(tagDef: TagDefinition<TagDefinitionWidgetWebComponent>): string {
    const webComp = tagDef.widget.webComponent;

    if (webComp.url) {
        return webComp.url; // Use direct URL
    } else if (webComp.s3) {
        // For S3 files, find the canonical tag for this file and use its scope/tag in the URL
        // This ensures multiple tags pointing to the same S3 file use the same URL
        const fileId = getWebComponentFileId(tagDef);
        const canonicalTag = canonicalTagMap?.get(fileId);

        if (canonicalTag) {
            // Use the canonical tag's scope and tag for the URL
            return `/api/webcomponent/${canonicalTag.scope}/${canonicalTag.tag}`;
        } else {
            // Fallback to this tag's own scope/tag if no canonical mapping exists
            return `/api/webcomponent/${tagDef.scope}/${tagDef.tag}`;
        }
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

    // console.log(`[Web Component Loader] loadWebComponentByUrl called:`, {
    //     tagName,
    //     url,
    //     alreadyRegistered: !!customElements.get(tagName),
    //     urlAlreadyLoaded: loadedWebComponentUrls.has(url)
    // });

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
            // console.error(`[Web Component Loader] Custom element ${tagName} not found even though ${url} was loaded.`, {
            //     loadedUrls: Array.from(loadedWebComponentUrls),
            //     registeredElements: Array.from(document.querySelectorAll('*'))
            //         .map((el) => el.tagName.toLowerCase())
            //         .filter((tag) => tag.includes('-')),
            //     expectedTagName: tagName
            // });
            throw new Error(`Custom element ${tagName} not found even though ${url} was loaded. ` + `Possible causes: file doesn't define '${tagName}', or tag name mismatch.`);
        }
        return;
    }

    // Load the JavaScript file
    // console.log(`[Web Component Loader] Loading ${tagName} from ${url}`);
    try {
        await import(/* @vite-ignore */ url);
        // console.log(`[Web Component Loader] Import completed for ${url}`);

        // Mark this URL as loaded
        loadedWebComponentUrls.add(url);

        // Verify the expected custom element was registered
        // Note: The file might register multiple elements (widget bundle)
        if (!customElements.get(tagName)) {
            // console.error(`[Web Component Loader] Custom element ${tagName} not defined after loading ${url}`, {
            //     expectedTagName: tagName,
            //     url,
            //     loadedUrls: Array.from(loadedWebComponentUrls)
            // });
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
 * @returns Promise that resolves to the unique instance ID for this component
 */
export async function injectChatAppWebComponent(
    tagDef: TagDefinition<TagDefinitionWidgetWebComponent>,
    el: HTMLElement,
    contextRequestWithoutInstanceId: PikaWCContextWithoutInstanceId,
    replaceEl: boolean = true
): Promise<string> {
    // Generate unique instance ID for this component
    const instanceId = uuidv7();

    // Use customElementName if provided, otherwise construct from scope.tag
    const customElementName = tagDef.widget.webComponent.customElementName || `${tagDef.scope}.${tagDef.tag}`;
    const url = resolveWebComponentUrl(tagDef);
    const fileId = getWebComponentFileId(tagDef);

    // console.log(`[Web Component Loader] Injecting ${customElementName} from ${url}`, {
    //     tagDef: `${tagDef.scope}.${tagDef.tag}`,
    //     customElementName,
    //     fileId,
    //     instanceId,
    //     contextRequestWithoutInstanceId,
    //     replaceEl
    // });

    // 1. Check if this file has been loaded before (by actual file location, not proxy URL)
    if (loadedWebComponentFiles.has(fileId)) {
        // File was already loaded - verify the custom element we need is registered
        // console.log(`[Web Component Loader] File ${fileId} already loaded, checking for element ${customElementName}`);

        if (!customElements.get(customElementName)) {
            // console.error(`[Web Component Loader] Custom element not found after file loaded:`, {
            //     customElementName,
            //     fileId,
            //     loadedFiles: Array.from(loadedWebComponentFiles)
            // });
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
            // console.log(`[Web Component Loader] ${customElementName} already registered before file load, skipping load`);
        } else {
            // Load the JavaScript file
            // console.log(`[Web Component Loader] Starting import of ${url}`);
            try {
                await import(/* @vite-ignore */ url);
                // console.log(`[Web Component Loader] Import completed for ${url}`);

                // Verify the expected custom element was registered
                const isRegistered = !!customElements.get(customElementName);
                // console.log(`[Web Component Loader] Checking if ${customElementName} is registered: ${isRegistered}`);

                if (!isRegistered) {
                    // console.error(`[Web Component Loader] Expected element not found after import:`, {
                    //     expectedElement: customElementName,
                    //     url,
                    //     fileId
                    // });
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
        // console.log(`[Web Component Loader] File ${fileId} marked as loaded. Total loaded files:`, Array.from(loadedWebComponentFiles));
    }

    // 2. Create instance
    // console.log(`[Web Component Loader] Creating element instance:`, {
    //     customElementName,
    //     elementConstructor: customElements.get(customElementName)
    // });
    const newEl = document.createElement(customElementName);

    // Set instance ID as data attribute for debugging and reference
    newEl.setAttribute('data-tag-instance-id', instanceId);

    // console.log(`[Web Component Loader] Element created:`, {
    //     tagName: newEl.tagName,
    //     constructor: newEl.constructor.name,
    //     instanceId
    // });

    // 3. Set up context provider with instance ID
    // console.log(`[Web Component Loader] Setting up context provider for ${customElementName}`);

    // Create context with instance ID for proper metadata tracking
    const contextWithInstance: PikaWCContext = {
        ...contextRequestWithoutInstanceId,
        instanceId: instanceId
    };

    newEl.addEventListener('pika-wc-context-request', (event: PikaWCContextRequestEvent) => {
        // console.log(`[Web Component Loader] Context requested by ${customElementName}`, {
        //     contextWithInstance,
        //     instanceId,
        //     eventDetail: event.detail
        // });
        event.detail.callback(contextWithInstance);
    });

    // 4. Inject into DOM
    // console.log(`[Web Component Loader] Injecting ${customElementName} into DOM`, {
    //     replaceEl,
    //     parentElement: el.tagName,
    //     instanceId
    // });
    if (replaceEl) {
        el.replaceChildren(newEl);
    } else {
        el.appendChild(newEl);
    }
    // console.log(`[Web Component Loader] Successfully injected ${customElementName} into DOM with instanceId: ${instanceId}`);

    // Return the instance ID for parent components to track
    return instanceId;
}
