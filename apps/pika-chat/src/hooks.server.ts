import { refresh } from '$lib/server/auth';
import { createChatUser, getChatUser } from '$lib/server/chat-apis';
import { appConfig } from '$lib/server/config';
import { addSecurityHeaders, decryptCookieString, deleteCookies, encryptCookieString } from '$lib/server/utils';
import { AUTHENTICATED_USER_ACCESS_TOKEN_COOKIE_NAME, AUTHENTICATED_USER_COOKIE_NAME, type UserAuthData } from '$lib/shared-types';
import type { AuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';

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

    // ===== Authentication Routes =====
    
    
    // ===== Protected Routes (Auth Required) =====
    
    // Verify user is authenticated
    let userCookie = event.cookies.get(AUTHENTICATED_USER_COOKIE_NAME);
    if (!userCookie) {
        // Just make a mock cookie for now
        const user: AuthenticatedUser<UserAuthData> = {
            userId: '123',
            authData: {
                accessToken: '123',
                expiresAt: 1717987200,
                refreshToken: '123',
            },
            email: 'test@test.com',
            firstName: 'Test',
            lastName: 'User',
            companyId: '123',
            companyName: 'Test Company',
            companyType: 'retailer',
            features: {
                instruction: {
                    type: 'instruction',
                    instruction: 'You are a helpful assistant that can answer questions and help with tasks.',
                },
                history: {
                    type: 'history',
                    history: true,
                }
            }
        };

        event.cookies.set(
            AUTHENTICATED_USER_COOKIE_NAME,
            encryptCookieString(JSON.stringify(user), appConfig.masterCookieKey, appConfig.masterCookieInitVector),
            {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
            }
        );

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
                features: Object.keys(chatUser?.features || {}),
            });
        } else {
            console.log('Existing chat user found:', {
                userId: chatUser.userId,
                features: Object.keys(chatUser.features || {}),
            });
        }

        userCookie = event.cookies.get(AUTHENTICATED_USER_COOKIE_NAME);
    }

    // Parse and validate user data and user auth data
    let user: AuthenticatedUser<UserAuthData>;
    try {
        user = JSON.parse(decryptCookieString(userCookie!, appConfig.masterCookieKey, appConfig.masterCookieInitVector));
    } catch (e) {
        // Invalid cookie - clear it and redirect to login
        deleteCookies(event);
        throw redirect(302, '/auth/login');
    }

    let userAccessTokenCookie = event.cookies.get(AUTHENTICATED_USER_ACCESS_TOKEN_COOKIE_NAME);
    if (!userAccessTokenCookie) {
        event.cookies.set(
            AUTHENTICATED_USER_ACCESS_TOKEN_COOKIE_NAME,
            encryptCookieString('123', appConfig.masterCookieKey, appConfig.masterCookieInitVector),
            {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
            }
        );
        userAccessTokenCookie = event.cookies.get(AUTHENTICATED_USER_ACCESS_TOKEN_COOKIE_NAME);
        try {
            user = JSON.parse(decryptCookieString(userCookie!, appConfig.masterCookieKey, appConfig.masterCookieInitVector));
        } catch (e) {
            // Invalid cookie - clear it and redirect to login
            deleteCookies(event);
            throw redirect(302, '/auth/login');
        }
    }

    // Make sure the access token is valid
    let userAccessToken: string;
    try {
        userAccessToken = decryptCookieString(userAccessTokenCookie!, appConfig.masterCookieKey, appConfig.masterCookieInitVector);
    } catch (e) {
        // Invalid cookie - clear it and redirect to login
        deleteCookies(event);
        throw redirect(302, '/auth/login');
    }

    // Due to cookie size limits, we store the access token in a separate cookie.  So we need to add it to the user object.
    user.authData.accessToken = userAccessToken;

    
    // Set user and config in locals for server-side use
    event.locals = { user, appConfig };

    // Process the request to whatever route they were going to with security headers
    return addSecurityHeaders(await resolve(event));
};