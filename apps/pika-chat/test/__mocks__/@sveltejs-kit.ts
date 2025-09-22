/**
 * Mock for @sveltejs/kit module
 *
 * This provides mocks for SvelteKit functions used in server-side code
 * so they work correctly in Jest tests.
 */

interface JsonOptions {
    status?: number;
    headers?: HeadersInit;
}

// TypeScript types (these don't need implementation, just type definitions)
export type RequestHandler = (event: RequestEvent) => Promise<Response> | Response;
export type ServerLoad = (event: LoadEvent) => Promise<any> | any;
export type Handle = (input: { event: RequestEvent; resolve: any }) => Promise<Response>;
export type ServerInit = (options: any) => void;

export interface RequestEvent {
    request: Request;
    url: URL;
    params: Record<string, string>;
    route: { id: string };
    platform: any;
    locals: Record<string, any>;
    cookies: any;
    fetch: typeof fetch;
    getClientAddress: () => string;
    isDataRequest: boolean;
    isSubRequest: boolean;
}

export interface LoadEvent extends RequestEvent {
    parent: () => Promise<Record<string, any>>;
    depends: (...deps: string[]) => void;
}

export interface Page {
    url: URL;
    params: Record<string, string>;
    route: { id: string };
    status: number;
    error: any;
    data: Record<string, any>;
    form?: any;
}

/**
 * Mock implementation of SvelteKit's json() function
 * Creates a Response with JSON content and appropriate headers
 */
export function json(data: any, options: JsonOptions = {}): Response {
    const { status = 200, headers = {} } = options;

    const responseHeaders = new Headers(headers);
    responseHeaders.set('content-type', 'application/json');

    return new Response(JSON.stringify(data), {
        status,
        headers: responseHeaders
    });
}

// Add other SvelteKit functions as needed
export const redirect = (status: number, location: string): Response => {
    return new Response(null, {
        status,
        headers: {
            location
        }
    });
};

/**
 * Mock implementation of SvelteKit's HttpError class
 */
export class HttpError {
    status: number;
    body: { message: string };

    constructor(status: number, body: string | { message: string }) {
        this.status = status;
        if (typeof body === 'string') {
            this.body = { message: body };
        } else {
            this.body = body;
        }
    }

    toString() {
        return JSON.stringify(this.body);
    }
}

export const error = (status: number, message?: string): never => {
    throw new HttpError(status, message || 'Error');
};
/**
 * Mock implementation of SvelteKit's isHttpError function
 * Checks if an error is a SvelteKit HTTP error
 */
export const isHttpError = (error: any): boolean => {
    return error instanceof HttpError;
};

/**
 * Wrapper that simulates SvelteKit's error handling behavior for testing.
 * In real SvelteKit, HttpError instances thrown from handlers are caught and converted to Response objects.
 */
export async function callWithSvelteKitErrorHandling(handler: Function, event: any): Promise<Response> {
    try {
        return await handler(event);
    } catch (error) {
        if (error instanceof HttpError) {
            // Simulate SvelteKit converting HttpError to Response
            return json(error.body, { status: error.status });
        }
        // Re-throw non-HttpError exceptions
        throw error;
    }
}
