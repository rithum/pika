import { createChatUser, getChatUser } from '$lib/server/chat-apis';
import { appConfig } from '$lib/server/config';
import { addSecurityHeaders, clearAuthenticatedUserCookies, deserializeAuthenticatedUserFromCookies, serializeAuthenticatedUserToCookies } from '$lib/server/utils';
import { AUTHENTICATED_USER_ACCESS_TOKEN_COOKIE_NAME } from '$lib/shared-types';
import type { AuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { loadAuthProvider, NotAuthenticatedError, ForceUserToReauthenticateError } from '$lib/server/auth';
import type { AuthProvider } from '$lib/server/auth/types';

let authProvider: AuthProvider | undefined;

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

    // Login page - accessible without authentication
    if (pathName === '/login') {
        // Allow access to login page without authentication
        return addSecurityHeaders(await resolve(event));
    }

    // ===== Protected Routes (Auth Required) =====

    let user: AuthenticatedUser<unknown> | undefined;
    authProvider = authProvider || (await loadAuthProvider());

    // Try to deserialize user from cookies
    user = deserializeAuthenticatedUserFromCookies(event, appConfig.masterCookieKey, appConfig.masterCookieInitVector);

    if (!user) {
        // No user cookie - attempt initial authentication
        try {
            // Attempt authentication
            const authResult = await authProvider.authenticate(event);

            if (authResult instanceof Response) {
                // Handle redirects, OAuth flows, etc.
                return authResult;
            }

            // User authenticated successfully
            user = authResult;

            // Serialize the user to cookies (handles large data automatically)
            serializeAuthenticatedUserToCookies(event, user, appConfig.masterCookieKey, appConfig.masterCookieInitVector);

            // Handle chat user creation/retrieval
            console.log('Checking for existing chat user...');
            let chatUser = await getChatUser(user.userId);

            if (!chatUser) {
                console.log('Chat user not found, creating new chat user...');
                // Clone and get rid of the auth data which should not be stored in the chat database
                const newChatUser = { ...user } as any;
                delete newChatUser.authData;
                chatUser = await createChatUser(newChatUser);
                console.log('New chat user created:', {
                    userId: chatUser?.userId,
                    features: Object.keys(chatUser?.features || {})
                });
            } else {
                console.log('Existing chat user found:', {
                    userId: chatUser.userId,
                    features: Object.keys(chatUser.features || {})
                });
            }
        } catch (error) {
            if (error instanceof NotAuthenticatedError) {
                // Clear any invalid cookies
                clearAuthenticatedUserCookies(event);
                // Redirect to login
                throw redirect(302, '/login');
            }
            // Re-throw other errors
            throw error;
        }
    }

    // Give the auth provider a chance to validate/refresh the user's authentication
    if (authProvider.validateUser && user) {
        try {
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
                clearAuthenticatedUserCookies(event);
                throw redirect(302, '/login');
            }
            // Re-throw other errors
            throw error;
        }
    }

    // Handle access token cookie (for backward compatibility)
    let userAccessTokenCookie = event.cookies.get(AUTHENTICATED_USER_ACCESS_TOKEN_COOKIE_NAME);
    if (!userAccessTokenCookie && user) {
        // Set a default access token if none exists (for backward compatibility)
        const accessToken = (user as any).authData?.accessToken || '123';
        // Note: We're not setting this cookie anymore since we handle everything in the main user cookie
        // This is just for backward compatibility if needed
    }

    // Set user and config in locals for server-side use
    event.locals = { user, appConfig };

    // Process the request to whatever route they were going to with security headers
    return addSecurityHeaders(await resolve(event));
};
