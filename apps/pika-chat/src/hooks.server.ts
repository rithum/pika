import { ForceUserToReauthenticateError, loadAuthProvider, NotAuthenticatedError } from '$lib/server/auth';
import type { AuthProvider } from '$lib/server/auth/types';
import { createChatUser, getChatUser } from '$lib/server/chat-apis';
import { appConfig } from '$lib/server/config';
import {
    clearAllCookies,
    deserializeAuthenticatedUserFromCookies,
    deserializeContentAdminDataFromCookies,
    deserializeUserOverrideDataFromCookies,
    serializeAuthenticatedUserToCookies
} from '$lib/server/cookies';
import { addSecurityHeaders, isUserAllowedToUseUserDataOverrides, isUserContentAdmin, mergeAuthenticatedUserWithExistingChatUser } from '$lib/server/utils';
import type { AuthenticatedUser, RecordOrUndef } from '@pika/shared/types/chatbot/chatbot-types';
import { redirect, type Handle, type RequestEvent, type ServerInit } from '@sveltejs/kit';

let authProvider: AuthProvider<RecordOrUndef, RecordOrUndef> | undefined;

// Initialize server configuration
export const init: ServerInit = async () => {
    await appConfig.init();
};

export const handle: Handle = async ({ event, resolve }) => {
    // ===== Special Route Handlers =====

    // Handle Chrome DevTools protocol for local development
    if (appConfig.isLocal && event.url.pathname.startsWith('/.well-known/appspecific/com.chrome.devtools')) {
        return new Response('OK', { status: 200 });
    }

    // Normalize pathname by removing trailing slash
    const pathName = event.url.pathname.endsWith('/') ? event.url.pathname.slice(0, -1) : event.url.pathname;

    // ===== Public Routes (No Auth Required) =====

    // Health check endpoint - accessible without authentication
    if (pathName === '/health') {
        // Return minimal response for load balancer health checks
        return new Response('OK', {
            status: 200,
            headers: {
                'Content-Type': 'text/plain'
            }
        });
    }

    let user: AuthenticatedUser<RecordOrUndef, RecordOrUndef> | undefined;
    authProvider = authProvider || (await loadAuthProvider());

    // Login page - accessible without authentication
    if (pathName === '/login') {
        await addToLocalsFromAuthProvider(pathName, event, authProvider, user);
        // Allow access to login page without authentication
        return addSecurityHeaders(await resolve(event));
    }

    if (pathName === '/auth/client-auth') {
        await addToLocalsFromAuthProvider(pathName, event, authProvider, user);
        // Allow access to client auth page without authentication
        return addSecurityHeaders(await resolve(event));
    }

    // ===== Protected Routes (Auth Required) =====

    // Try to deserialize user from cookies
    user = deserializeAuthenticatedUserFromCookies(event, appConfig.masterCookieKey, appConfig.masterCookieInitVector);

    if (!user) {
        // No user cookie - attempt initial authentication
        try {
            // Attempt authentication
            const authResult = await authProvider.authenticate(event);

            if (authResult.authenticatedUser) {
                // User authenticated successfully
                user = authResult.authenticatedUser;

                // Handle chat user creation/retrieval
                let chatUser = await getChatUser(user.userId);

                if (!chatUser) {
                    // Clone and get rid of the auth data which should not be stored in the chat database
                    const newChatUser = { ...user } as any;
                    delete newChatUser.authData;
                    chatUser = await createChatUser(newChatUser);
                } else {
                    // We need to merge in any existing pika:xxx roles that exist in the chat user database that may have been added indepently of the auth provider
                    mergeAuthenticatedUserWithExistingChatUser(user, chatUser);
                }

                // Serialize the user to cookies (handles large data automatically)
                serializeAuthenticatedUserToCookies(event, user, appConfig.masterCookieKey, appConfig.masterCookieInitVector);
            }

            if (authResult.redirectTo) {
                // Handle redirects, OAuth flows, etc.
                return authResult.redirectTo;
            }

            if (!user) {
                // No user - we are not authenticated and need to redirect to the login page
                return redirect(302, '/login');
            }
        } catch (error) {
            if (error instanceof NotAuthenticatedError) {
                // Clear any invalid cookies
                clearAllCookies(event);
                // Redirect to login
                return redirect(302, '/login');
            }
            // Re-throw other errors
            throw error;
        }
    }

    // Give the auth provider a chance to validate/refresh the user's authentication
    if (authProvider.validateUser && user) {
        try {
            // Only validate if needed (let the provider decide based on time/expiry)
            const validationResult = await authProvider.validateUser(event, user);

            if (validationResult) {
                // Provider returned updated user with refreshed tokens
                user = validationResult;

                // Update the user cookies with the refreshed data
                serializeAuthenticatedUserToCookies(event, user, appConfig.masterCookieKey, appConfig.masterCookieInitVector);
            }
            // If validationResult is undefined, no action needed
        } catch (error) {
            if (error instanceof ForceUserToReauthenticateError) {
                // Clear cookies and redirect to login
                clearAllCookies(event);
                return redirect(302, '/login');
            }
            // Re-throw other errors
            throw error;
        }
    }

    // If the user is allowed to use the user data overrides feature, we need to deserialize the user override data from cookies
    // and merge it with the user object.
    if (isUserAllowedToUseUserDataOverrides(user)) {
        const userOverrideData = deserializeUserOverrideDataFromCookies(event, appConfig.masterCookieKey, appConfig.masterCookieInitVector);
        if (userOverrideData) {
            user.overrideData = userOverrideData.data;
        }
    }

    // If the user is allowed to use the content admin feature, we need to deserialize the content admin data from cookies
    // and merge it with the user object.
    if (isUserContentAdmin(user)) {
        const contentAdminData = deserializeContentAdminDataFromCookies(event, appConfig.masterCookieKey, appConfig.masterCookieInitVector);
        if (contentAdminData) {
            user.viewingContentFor = contentAdminData.data;
        }
    }

    // Set user and config in locals for server-side use
    event.locals = { user, appConfig };

    await addToLocalsFromAuthProvider(pathName, event, authProvider, user);

    // Process the request to whatever route they were going to with security headers
    return addSecurityHeaders(await resolve(event));
};

/**
 * Add data to the locals from the auth provider.  This is useful for adding values to the locals for the route that are not part of the
 * AuthenticatedUser object.  For example, lets say that you redirect to /auth/client-auth since you need to start authentication
 * from the client side.  Maybe you need some URLs in the client side so you can start the auth process.  You can add them to the
 * locals object and then access them in the +page.server.ts of your route and then pass then into your +page.svelte.
 *
 * @param event - The request event (so you can check the path)
 * @param authProvider - The auth provider
 * @param user - The authenticated user (if there is one)
 */
async function addToLocalsFromAuthProvider(
    pathName: string,
    event: RequestEvent<Partial<Record<string, string>>, string | null>,
    authProvider: AuthProvider<RecordOrUndef, RecordOrUndef> | undefined,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef> | undefined
): Promise<void> {
    if (!authProvider || !authProvider.addValueToLocalsForRoute) {
        return;
    }

    const dataToAddToLocals = await authProvider.addValueToLocalsForRoute(pathName, event, user);
    if (dataToAddToLocals) {
        event.locals = { ...(event.locals ?? {}), customData: dataToAddToLocals };
    }
}
