/**
 * This is designed for you to customize the client size process if you need to.
 * It will not by synchronized with the framework.  Delete this file if you don't need it.
 */
import { type RequestEvent } from '@sveltejs/kit';

export async function load(event: RequestEvent<Record<string, string>>): Promise<{ customData: Record<string, unknown> | undefined }> {
    return { customData: event.locals.customData };
}
