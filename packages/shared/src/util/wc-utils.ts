import { PikaWCContext, PikaWCContextRequestDetail } from '../types/chatbot/webcomp-types';
import { SEMANTIC_COLOR_VARIABLES, type SemanticColorVariable } from '../types/chatbot/theme-types';

/**
 * Web component authors can use this function to get the Pika context when their web component is rendered.
 *
 * The type of the context object is defined in the PikaWCContext interface.
 *
 * @see PikaWCContext
 *
 * @example
 * ```ts
 * const ctx: PikaWCContext = await getPikaContext(el);
 * console.log(ctx.appState.identity.user.fullName);
 * ```
 */
export function getPikaContext(el: HTMLElement): Promise<PikaWCContext> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Pika context not provided - component must be rendered within a Pika chat app'));
        }, 1000);

        el.dispatchEvent(
            new CustomEvent<PikaWCContextRequestDetail>('pika-wc-context-request', {
                bubbles: true,
                composed: true,
                detail: {
                    callback: (ctx: PikaWCContext) => {
                        clearTimeout(timeout);
                        resolve(ctx);
                    }
                }
            })
        );
    });
}

/**
 * Get a single CSS variable value from the document.
 * Useful for web components that need to read theme values.
 *
 * @param name - Variable name without the -- prefix (e.g., 'primary', 'background')
 * @returns The computed value of the CSS variable, or empty string if not found
 *
 * @example
 * ```ts
 * const primaryColor = getThemeVariable('primary');
 * console.log(primaryColor); // 'oklch(0.514 0.146 255.748)'
 *
 * // Use in dynamic styles - value already includes oklch()
 * element.style.backgroundColor = getThemeVariable('primary');
 * ```
 *
 * @since 0.16.0
 */
export function getThemeVariable(name: string): string {
    if (typeof document === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

/**
 * Get all Pika semantic theme tokens as an object.
 * Useful for web components that need access to multiple theme values.
 *
 * Returns only the semantic color variables (primary, secondary, success, etc.),
 * not the full palette variables (gold-500, blueish-300, etc.).
 *
 * @returns Object mapping variable names to their computed values
 *
 * @example
 * ```ts
 * const tokens = getPikaThemeTokens();
 * console.log(tokens.primary);           // 'oklch(0.514 0.146 255.748)'
 * console.log(tokens.success);           // 'oklch(0.55 0.16 142)'
 * console.log(tokens['muted-foreground']); // 'oklch(0.551 0.027 264.364)'
 * ```
 *
 * @since 0.16.0
 */
export function getPikaThemeTokens(): Partial<Record<SemanticColorVariable, string>> {
    if (typeof document === 'undefined') return {};

    const style = getComputedStyle(document.documentElement);
    const tokens: Partial<Record<SemanticColorVariable, string>> = {};

    for (const name of SEMANTIC_COLOR_VARIABLES) {
        const value = style.getPropertyValue(`--${name}`).trim();
        if (value) {
            tokens[name] = value;
        }
    }

    return tokens;
}
