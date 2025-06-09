import {
    AUTHENTICATED_USER_ACCESS_TOKEN_COOKIE_NAME,
    AUTHENTICATED_USER_COOKIE_NAME,
    OAUTH_STATE_COOKIE_MAX_AGE,
    OAUTH_STATE_COOKIE_NAME,
    type AuthData,
    type IdTokenClaims,
    type UserAuthData,
} from '$lib/shared-types';
import type { AuthenticatedUser, ChatUser } from '@pika/shared/types/chatbot/chatbot-types';
import type { RequestEvent } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import crypto from 'crypto';
import { createChatUser, getChatUser } from './chat-apis';
import { appConfig } from './config';
import { concatUrlWithPath, decryptCookieString, encryptCookieString, getUserDataFromServer } from './utils';

/**
 * This will redirect to the auth provider.
 * It will store the interim OAuth values in a secure cookie.
 */
export async function redirectToAuth(event: RequestEvent) {
    const state = generateSecureRandomString();
    const nonce = generateSecureRandomString();
    const codeVerifier = generateSecureRandomString();
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    // Store OAuth values in a secure cookie
    const oauthData: AuthState = {
        nonce,
        codeVerifier,
        timestamp: Date.now(),
    };

    // Set secure cookie with OAuth data
    event.cookies.set(
        OAUTH_STATE_COOKIE_NAME,
        encryptCookieString(JSON.stringify(oauthData), appConfig.masterCookieKey, appConfig.masterCookieInitVector),
        {
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            maxAge: OAUTH_STATE_COOKIE_MAX_AGE,
        }
    );

    const authUrl = new URL(appConfig.oauthUrl);
    authUrl.searchParams.append('client_id', appConfig.clientId);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('nonce', nonce);
    authUrl.searchParams.append(
        'redirect_uri',
        concatUrlWithPath(appConfig.webappUrl, appConfig.redirectCallbackUriPath)
    );
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', 'openid profile company email offline_access');

    throw redirect(302, authUrl.toString());
}

/**
 * This will handle the callback from the auth provider.
 * It will use the interim OAuth values stored in the secure cookie to get the auth data.
 * It will then save the user and auth data in a secure cookie which indicates that the user is logged in.
 * It deletes the interim OAuth value cookie.
 */
export async function handleAuthCallback(event: RequestEvent): Promise<Response> {
    // These are the parameters from the oauth provider
    const code = event.url.searchParams.get('code');
    const state = event.url.searchParams.get('state');

    if (!code || !state) {
        return new Response('Invalid OAuth callback', { status: 400 });
    }

    // Get the OAuth state cookie
    const oauthStateCookie = event.cookies.get(OAUTH_STATE_COOKIE_NAME);
    if (!oauthStateCookie) {
        return new Response('Invalid OAuth state', { status: 400 });
    }

    let oauthState: AuthState;
    try {
        oauthState = JSON.parse(decryptCookieString(oauthStateCookie, appConfig.masterCookieKey, appConfig.masterCookieInitVector));
        if (!oauthState.nonce || !oauthState.codeVerifier || !oauthState.timestamp) {
            return new Response('Invalid OAuth state', { status: 400 });
        }
    } catch (e) {
        console.error('Invalid OAuth state trying to JSON parse oauth state cookie', e);
        return new Response('Invalid OAuth state', { status: 400 });
    }

    // Delete the OAuth state cookie
    event.cookies.delete(OAUTH_STATE_COOKIE_NAME, { path: '/' });

    // Check if the cookie has expired
    if (Date.now() - oauthState.timestamp > OAUTH_STATE_COOKIE_MAX_AGE) {
        return new Response('OAuth state expired', { status: 400 });
    }

    try {
        // Returns either the logged in user or a response to redirect to the login page.
        const authData = await getUserUsingAuthInfo(event, {
            type: 'first-time',
            codeVerifier: oauthState.codeVerifier,
            code,
            redirectUri: concatUrlWithPath(appConfig.webappUrl, appConfig.redirectCallbackUriPath),
        });

        if (authData instanceof Response) {
            return authData;
        } else {
            // Let it continue on and redirect to the home page.
        }
    } catch (e) {
        console.error('Auth callback failed', e);
        return new Response('Invalid OAuth state', { status: 400 });
    }

    // Auth worked, redirect to the home page.
    throw redirect(302, '/');
}

export async function logout(event: RequestEvent): Promise<Response> {
    event.cookies.delete(AUTHENTICATED_USER_COOKIE_NAME, { path: '/' });
    throw redirect(302, '/');
}

/**
 * This will use the params passed in to get the auth data and then retrieve the user
 * and return the user and auth data combined, having been saved in a secure cookie.
 *
 * It uses the refresh token to get a new access token.
 */
export async function refresh(event: RequestEvent, user: AuthenticatedUser<UserAuthData>): Promise<Response | AuthenticatedUser<UserAuthData>> {
    const newUser = await getUserUsingAuthInfo(event, {
        type: 'refresh',
        refreshToken: user.authData.refreshToken,
    });

    return newUser;
}

/**
 * This will use the params passed in to get the auth data and then retrieve the user
 * and return the user and auth data combined, having been saved in a secure cookie.
 */
async function getUserUsingAuthInfo(
    event: RequestEvent,
    params: AuthCodeToTokenDataFirstTime | AuthCodeToTokenDataRefresh
): Promise<AuthenticatedUser<UserAuthData> | Response> {
    const redirectUri = concatUrlWithPath(appConfig.webappUrl, appConfig.redirectCallbackUriPath);

    const body =
        params.type === 'first-time'
            ? new URLSearchParams({
                  grant_type: 'authorization_code',
                  client_id: appConfig.clientId,
                  code_verifier: params.codeVerifier,
                  code: params.code,
                  redirect_uri: redirectUri,
              })
            : new URLSearchParams({
                  grant_type: 'refresh_token',
                  client_id: appConfig.clientId,
                  refresh_token: params.refreshToken,
              });

    const tokenResponse = await fetch(appConfig.tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    });

    if (!tokenResponse.ok) {
        return new Response('Token exchange failed', { status: 400 });
    }

    const tokens: TokensData = await tokenResponse.json();
    const idTokenClaims = decodeJWT<IdTokenClaims | undefined>(tokens.id_token);
    const accessTokenClaims = decodeJWT<string>(tokens.access_token);

    const authData: AuthData = {
        idToken: {
            idToken: tokens.id_token,
            claims: idTokenClaims,
            expiresAt: idTokenClaims?.exp,
            authorizeUrl: appConfig.oauthUrl,
            issuer: idTokenClaims?.iss,
            clientId: appConfig.clientId,
        },
        accessToken: {
            accessToken: tokens.access_token,
            claims: accessTokenClaims,
        },
        refreshToken: tokens.refresh_token,
    };

    const user = await getUserDataFromServer(appConfig.platformApiBaseUrl, authData);

    try {
        let chatUser = await getChatUser(user.userId);
        if (!chatUser) {
            // Clone and get rid of the auth data which should not be stored in the chat database, turning an AuthenticatedUser into a ChatUser
            chatUser = {...user} as ChatUser;
            delete (chatUser as any).authData;
            await createChatUser(chatUser);
        }
        
        // Now make sure the user we have has the same features as the user we got from the platform api
        user.features = chatUser.features;
    } catch (e) {
        console.error('Error creating user in chat database', e);
        return new Response('Error creating user in chat database', { status: 500 });
    }

    // The access token is too big to fit on the one cookie, so we store it in a separate cookie.
    const accessToken = user.authData.accessToken;
    delete (user as any).authData.accessToken;

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

    event.cookies.set(
        AUTHENTICATED_USER_ACCESS_TOKEN_COOKIE_NAME,
        encryptCookieString(accessToken, appConfig.masterCookieKey, appConfig.masterCookieInitVector),
        {
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
        }
    );

    // Put it back on the user object for the return value.
    user.authData.accessToken = accessToken;

    return user;
}

function generateSecureRandomString() {
    return crypto.randomBytes(32).toString('hex');
}

// Helper function to decode JWT
function decodeJWT<T>(token: string): T {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(Buffer.from(base64, 'base64').toString());
    } catch (error) {
        throw new Error('Error decoding JWT');
    }
}

interface TokensData {
    id_token: string;
    access_token: string;
    refresh_token: string;
}

interface AuthCodeToTokenDataFirstTime {
    type: 'first-time';
    codeVerifier: string;
    code: string;
    redirectUri: string;
}

interface AuthCodeToTokenDataRefresh {
    type: 'refresh';
    refreshToken: string;
}

interface AuthState {
    nonce: string;
    codeVerifier: string;
    timestamp: number;
}
