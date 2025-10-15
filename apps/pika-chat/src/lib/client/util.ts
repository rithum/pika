import type { ShowToastFn } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Client-side error messages for different HTTP status codes.
 * These are user-friendly messages shown in toasts.
 */
const CLIENT_ERROR_MESSAGES = {
    400: 'Invalid request. Please check your input and try again.',
    401: 'You are not authorized to perform this action. Please sign in again.',
    403: 'You do not have permission to perform this action.',
    404: 'Resource not found.',
    500: 'Something unexpected happened. Please try again later.',
    default: 'Something unexpected happened. Please try again later.'
} as const;

/**
 * Checks fetch response status and shows appropriate toast messages.
 * Throws an error if the response is not ok.
 *
 * @param response The fetch response object
 * @param operation The operation name for error messages (e.g., "creating shared session")
 * @param resourceName Optional specific resource name for 403/404 messages (e.g., "shared session", "chat app")
 * @param showToast The toast function to show user messages
 */
export function checkClientResponse(response: Response, operation: string, showToast: ShowToastFn, resourceName?: string): void {
    if (!response.ok) {
        let message: string;

        switch (response.status) {
            case 400:
                message = CLIENT_ERROR_MESSAGES[400];
                break;
            case 401:
                message = CLIENT_ERROR_MESSAGES[401];
                break;
            case 403:
                message = resourceName ? `You do not have permission to access ${resourceName}.` : CLIENT_ERROR_MESSAGES[403];
                break;
            case 404:
                message = resourceName ? `${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)} not found.` : CLIENT_ERROR_MESSAGES[404];
                break;
            default:
                message = response.status >= 500 ? CLIENT_ERROR_MESSAGES[500] : CLIENT_ERROR_MESSAGES.default;
        }

        showToast(message, { type: 'error' });
        throw new Error(`${operation} failed: ${response.status}`);
    }
}

/**
 * Checks response body for success field and shows appropriate toast if failed.
 * Used after checkClientResponse when the response body has a success field.
 *
 * @param responseBody The parsed response body
 * @param operation The operation name for error messages (e.g., "creating shared session")
 * @param showToast The toast function to show user messages
 * @param customErrorMessage Optional custom error message instead of generic one
 */
export function checkClientResponseBody<T extends { success: boolean; error?: string }>(
    responseBody: T,
    operation: string,
    showToast: ShowToastFn,
    customErrorMessage?: string
): void {
    if (!responseBody.success) {
        const message = customErrorMessage || `Failed to ${operation}. Please try again.`;
        showToast(message, { type: 'error' });
        throw new ClientOperationError(responseBody.error || `${operation} failed`);
    }
}

export class ClientOperationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ClientError';
    }
}

/**
 * Handles unexpected errors in client-side try/catch blocks.
 * Shows a generic error toast if the error wasn't already handled.
 *
 * @param error The caught error
 * @param operation The operation name for error messages
 * @param showToast The toast function to show user messages
 * @param operationPrefix Optional prefix to identify already-handled errors (e.g., "Share session failed:")
 */
export function handleClientError(error: unknown, operation: string, showToast: ShowToastFn, operationPrefix?: string): void {
    // If it's an error we already handled (with the operation prefix), don't show another toast
    if (error instanceof ClientOperationError) {
        return; // Was already handled by checkClientResponse or checkClientResponseAndBody
    }

    console.error(`Unexpected error found in handleClientError: ${operation} ${operationPrefix} ${error instanceof Error ? error.message : String(error)}`);

    // Show generic error for unexpected errors
    showToast('Something unexpected happened. Please try again later.', { type: 'error' });
}

/**
 * Unified function that checks both response status and response body in one call.
 * This eliminates the duplicate toast issue from calling checkClientResponse + checkClientResponseBody.
 *
 * @param response The fetch response object
 * @param operation The operation name for error messages (e.g., "creating shared session")
 * @param showToast The toast function to show user messages
 * @param resourceName Optional specific resource name for 403/404 messages
 * @param customErrorMessage Optional custom error message for response body failures
 * @returns The parsed response body
 */
export async function checkClientResponseAndBody<T extends { success: boolean; error?: string }>(
    response: Response,
    operation: string,
    showToast: ShowToastFn,
    resourceName?: string,
    customErrorMessage?: string
): Promise<T> {
    // First check HTTP status
    if (!response.ok) {
        let message: string;

        switch (response.status) {
            case 400:
                message = CLIENT_ERROR_MESSAGES[400];
                break;
            case 401:
                message = CLIENT_ERROR_MESSAGES[401];
                break;
            case 403:
                message = resourceName ? `You do not have permission to access ${resourceName}.` : CLIENT_ERROR_MESSAGES[403];
                break;
            case 404:
                message = resourceName ? `${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)} not found.` : CLIENT_ERROR_MESSAGES[404];
                break;
            default:
                message = response.status >= 500 ? CLIENT_ERROR_MESSAGES[500] : CLIENT_ERROR_MESSAGES.default;
        }

        showToast(message, { type: 'error' });
        throw new ClientOperationError(`${operation} failed: ${response.status}`);
    }

    // Parse response body
    const responseBody = (await response.json()) as T;

    // Check response body success
    if (!responseBody.success) {
        const message = customErrorMessage || `Failed to ${operation}. Please try again.`;
        showToast(message, { type: 'error' });
        throw new ClientOperationError(responseBody.error || `${operation} failed`);
    }

    return responseBody;
}

/**
 * Standard resource names for consistent error messages.
 * Use these for the resourceName parameter in checkClientResponse.
 */
export const CLIENT_RESOURCE_NAMES = {
    SHARED_SESSION: 'shared session',
    CHAT_APP: 'chat app',
    SESSION: 'session',
    MESSAGE: 'message',
    USER: 'user',
    SETTINGS: 'settings',
    MEMORY: 'memory record',
    TAG_DEFINITION: 'tag definition',
    SEMANTIC_DIRECTIVE: 'semantic directive',
    FEEDBACK: 'feedback'
} as const;
