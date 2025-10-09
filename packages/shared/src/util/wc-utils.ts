import { PikaWCContext, PikaWCContextRequestDetail } from '../types/chatbot/webcomp-types';

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
            new CustomEvent<PikaWCContextRequestDetail>('pika-context-request', {
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
