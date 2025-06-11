import type { ErrorResponse, SuccessResponse } from '$client/app/types';
import {
    AUTHENTICATED_USER_COOKIE_NAME,
    type AuthData,
    type AuthenticatedUser,
    type UserAuthData,
} from '$lib/shared-types';
import { json, type RequestEvent } from '@sveltejs/kit';
import path from 'path';

export function getErrorResponse(status: number, error: string): Response {
    const err: ErrorResponse = {
        success: false,
        error,
    };
    return json(err, { status });
}

export function getSuccessResponse(): Response {
    const success: SuccessResponse = {
        success: true,
    };
    return json(success);
}

export function addSecurityHeaders(response: Response) {
    // TODO: Change this to only allow embedding from the enterprise site
    //response.headers.set('Content-Security-Policy', "frame-ancestors 'self' *.dsco.io http://localhost:*");
    response.headers.set('Content-Security-Policy', "frame-ancestors *");
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-XSS-Protection', '1; mode=block'); // Note: X-XSS-Protection is deprecated by modern browsers, consider CSP.
    response.headers.set('Referrer-Policy', 'strict-origin');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    response.headers.append(
        'Permissions-Policy',
        'geolocation=(self), ' +
            'microphone=(self), ' +
            'camera=(self), ' +
            'midi=(self), ' +
            'fullscreen=(self), ' +
            'accelerometer=(self), ' +
            'gyroscope=(self), ' +
            'magnetometer=(self), ' +
            'publickey-credentials-get=(self), ' +
            'sync-xhr=(self), ' +
            'usb=(self), ' +
            'serial=(self), ' +
            'xr-spatial-tracking=(self), ' +
            'payment=(self), ' +
            'picture-in-picture=(self)'
    );
    return response;
}

/**
 * Get user data from the server
 * @param url - The URL of the server
 * @param authData - The authentication data
 * @returns A tuple containing the user data, and the access token
 */
export async function getUserDataFromServer(url: string, authData: AuthData): Promise<AuthenticatedUser> {
    const [userResponse, companyResponse] = await Promise.all([
        fetch(`${url}/api/user`, {
            headers: { Authorization: `Bearer ${authData.accessToken.accessToken}` },
        }),
        fetch(`${url}/api/company`, {
            headers: { Authorization: `Bearer ${authData.accessToken.accessToken}` },
        }),
    ]);

    const user = (await userResponse.json()) as {
        value: {
            id: string;
            firstNames: string;
            lastName: string;
            email: string;
            profileImageThumb: string;
        };
    };

    const company = (await companyResponse.json()) as {
        companyId: number;
        name: string;
        type: string;
    };

    const userAuthData: UserAuthData = {
        accessToken: authData.accessToken.accessToken,
        expiresAt: authData.idToken.expiresAt,
        refreshToken: authData.refreshToken,
    };

    // Returning the default features
    return {
        userId: user.value.id,
        email: user.value.email,
        firstName: user.value.firstNames,
        lastName: user.value.lastName,
        companyName: company.name,
        companyType: company.type,
        authData: userAuthData,
        features: {
            instruction: {
                type: 'instruction',
                instruction: '',
            },
            history: {
                type: 'history',
                history: true,
            },
        },
    };
}

export function concatUrlWithPath(baseUrl: string, relativePath: string): string {
    const parsedUrl = new URL(baseUrl);
    parsedUrl.pathname = path.join(parsedUrl.pathname, relativePath);
    return parsedUrl.toString();
}

import crypto from 'crypto';

// --- SECURITY WARNING ---
// The FIXED_IV_HEX *MUST* be the securely generated and stored IV
// that corresponds to your masterKey.
// It is STRONGLY recommended to load this from a secure environment
// variable, similar to how you would load the masterKey,
// rather than hardcoding it directly in your source code,
// unless this module itself is highly protected and configured.
// This IV should be 16 bytes, represented as a 32-character hex string.
// Example: 'YOUR_SECURELY_GENERATED_16_BYTE_IV_IN_HEX_FORMAT'
const FIXED_IV_HEX = process.env.COOKIE_ENCRYPTION_IV_HEX; // Example of loading from env

const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypts a plaintext string using AES-256-CBC.
 *
 * @param plainTextCookieString The string to encrypt.
 * @param masterKeyHex The master encryption key (32 bytes) as a hexadecimal string.
 * @returns The encrypted string (ciphertext) as a hexadecimal string.
 * @throws Error if encryption fails or if the IV is not configured.
 */
export function encryptCookieString(
    plainTextCookieString: string,
    masterKeyHex: string,
    masterCookieInitVector: string
): string {
    try {
        const key = Buffer.from(masterKeyHex, 'hex');
        const iv = Buffer.from(masterCookieInitVector, 'hex');

        if (key.length !== 32) {
            throw new Error('Invalid masterKey length. Must be a 32-byte hex string (64 characters).');
        }
        if (iv.length !== 16) {
            throw new Error('Invalid IV length. Must be a 16-byte hex string (32 characters).');
        }

        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(plainTextCookieString, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (e) {
        console.error('Encryption failed:', e);
        throw new Error(`Encryption failed: ${e instanceof Error ? e.message : e}`);
    }
}

/**
 * Decrypts an AES-256-CBC encrypted hexadecimal string.
 *
 * @param encryptedCookieStringHex The encrypted string (ciphertext) as a hexadecimal string.
 * @param masterKeyHex The master encryption key (32 bytes) as a hexadecimal string.
 * @returns The decrypted plaintext string.
 * @throws Error if decryption fails or if the IV is not configured.
 */
export function decryptCookieString(
    encryptedCookieStringHex: string,
    masterKeyHex: string,
    masterCookieInitVector: string
): string {
    try {
        const key = Buffer.from(masterKeyHex, 'hex');
        const iv = Buffer.from(masterCookieInitVector, 'hex');

        if (key.length !== 32) {
            throw new Error('Invalid masterKey length. Must be a 32-byte hex string (64 characters).');
        }
        if (iv.length !== 16) {
            throw new Error('Invalid IV length. Must be a 16-byte hex string (32 characters).');
        }

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(encryptedCookieStringHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('Decryption failed:', e);
        throw new Error(`Decryption failed: ${e instanceof Error ? e.message : e}`);
    }
}

export function deleteCookies(event: RequestEvent) {
    event.cookies.delete(AUTHENTICATED_USER_COOKIE_NAME, { path: '/' });
}
