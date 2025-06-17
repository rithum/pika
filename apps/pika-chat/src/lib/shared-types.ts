/**
 * Types shared between the server and the client.
 * Do not put dependencies in here that won't work both
 * server and client.
 */

import type { ChatUser, CompanyType } from '@pika/shared/types/chatbot/chatbot-types';

/** The cookie name is obscure on purpose.  It stands for oauth state. */
export const OAUTH_STATE_COOKIE_NAME = 'os';

/** The cookie name is obscure on purpose.  It stands for authenicated user and contains user data. */
export const AUTHENTICATED_USER_COOKIE_NAME = 'au';

/** The cookie name is obscure on purpose.  It stands for authenicated user access token and contains the access token. */
export const AUTHENTICATED_USER_ACCESS_TOKEN_COOKIE_NAME = 'aua';

export const OAUTH_STATE_COOKIE_MAX_AGE = 5 * 60 * 1000; // 5 minutes in seconds

export interface AuthData {
    idToken: AuthDataIdToken;
    accessToken: AccessToken;
    refreshToken: string;
}

export interface AuthDataIdToken {
    idToken: string;
    claims?: IdTokenClaims;
    expiresAt?: number;
    authorizeUrl: string;
    issuer?: string;
    clientId: string;
}

export interface AccessToken {
    accessToken: string;
    claims: string;
}

export interface IdTokenClaims {
    exp?: number;
    iss?: string;
}
