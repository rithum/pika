import { type RequestEvent } from '@sveltejs/kit';
import type { AuthenticatedUser, ContentAdminData, RecordOrUndef, UserOverrideData } from 'pika-shared/types/chatbot/chatbot-types';
import { CookieEncryption } from './encryption/CookieEncryption';
import { KeyManager } from './encryption/KeyManager';

// Cookie size limit (4KB = 4096 bytes)
const COOKIE_SIZE_LIMIT = 4096;
const AUTH_USER_COOKIE_NAME_PREFIX = 'au';
const USER_OVERRIDE_DATA_COOKIE_NAME_PREFIX = 'uod'; // User Override Data
const CONTENT_ADMIN_COOKIE_NAME_PREFIX = 'cad'; // Content Admin
const FORCE_REAUTH_RETRY_COOKIE_NAME = 'reauth_retry'; // Reauth Retry
const COOKIE_PART_SEPARATOR = '_part_';

// Cookie expiration: 12 hours in seconds
const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60; // 12 hours

const cookieTypes = ['AUTH_USER', 'USER_OVERRIDE_DATA', 'CONTENT_ADMIN'] as const;
type CookieType = (typeof cookieTypes)[number];

// Don't put the reauth retry cookie type in this record as it's not a real cookie managed in the same way
const cookieTypeToCookieNamePrefix: Record<CookieType, string> = {
    AUTH_USER: AUTH_USER_COOKIE_NAME_PREFIX,
    USER_OVERRIDE_DATA: USER_OVERRIDE_DATA_COOKIE_NAME_PREFIX,
    CONTENT_ADMIN: CONTENT_ADMIN_COOKIE_NAME_PREFIX
};

export function clearAuthenticatedUserCookies(event: RequestEvent): void {
    clearCookies('AUTH_USER', event);
}

export function clearUserOverrideDataCookies(event: RequestEvent): void {
    clearCookies('USER_OVERRIDE_DATA', event);
}

export function clearContentAdminCookies(event: RequestEvent): void {
    clearCookies('CONTENT_ADMIN', event);
}

export function clearForceReauthRetryCookie(event: RequestEvent): void {
    event.cookies.delete(FORCE_REAUTH_RETRY_COOKIE_NAME, {
        path: '/',
        maxAge: 0 // Force immediate expiration
    });
}

export function clearForceReauthRetryCookieIfExists(event: RequestEvent): boolean {
    if (event.cookies.get(FORCE_REAUTH_RETRY_COOKIE_NAME)) {
        clearForceReauthRetryCookie(event);
        return true;
    }
    return false;
}

export function setForceReauthRetryCookie(event: RequestEvent, retryCount: number): void {
    event.cookies.set(FORCE_REAUTH_RETRY_COOKIE_NAME, String(retryCount), {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 5 * 60 // 5 minutes
    });
}

export function getForceRetryAuthRetryAttemptsCookieValue(event: RequestEvent): number {
    const retryCountStr = event.cookies.get(FORCE_REAUTH_RETRY_COOKIE_NAME) || '0';
    return parseInt(retryCountStr, 10);
}

export function clearAllCookies(event: RequestEvent): void {
    for (const cookieType of cookieTypes) {
        clearCookies(cookieType, event);
    }
}

/**
 * Deserializes cookie data from cookies with versioned encryption support
 * Handles both single-cookie and multi-cookie scenarios + versioned encryption
 */
export function deserializeFromCookies<T>(cookieType: CookieType, event: RequestEvent, keyManager: KeyManager): T | undefined {
    const cookieNamePrefix = cookieTypeToCookieNamePrefix[cookieType];
    const mainCookie = event.cookies.get(cookieNamePrefix);

    if (!mainCookie) {
        console.log(`[Cookies] No ${cookieType} cookie found`);
        return undefined;
    }

    const cookieEncryption = new CookieEncryption();

    try {
        // First, check if this looks like multi-cookie metadata (JSON parseable)
        let metadata: any;
        let isMultiCookie = false;

        try {
            metadata = JSON.parse(mainCookie);
            // If it parsed successfully and has multi-cookie structure, it's multi-cookie
            if (metadata && typeof metadata === 'object' && metadata.totalParts && metadata.totalSize) {
                isMultiCookie = true;
            }
        } catch {
            // Not JSON, continue to check if it's a single versioned cookie
        }

        if (!isMultiCookie) {
            // Check if this is a single versioned cookie
            if (cookieEncryption.isVersionedCookie(mainCookie)) {
                console.log(`[Cookies] Found single versioned ${cookieType} cookie, attempting decryption`);

                // Get key cache from KeyManager
                const keyCache = keyManager.getKeyCache();

                // Try single cookie decryption
                const decryptedData = cookieEncryption.decrypt(mainCookie, keyCache);

                if (decryptedData) {
                    console.log(`[Cookies] Successfully decrypted single versioned ${cookieType} cookie`);
                    return JSON.parse(decryptedData);
                } else {
                    console.warn(`[Cookies] Failed to decrypt single versioned ${cookieType} cookie - clearing stale cookies`);
                    // Clear the bad cookie to prevent infinite retry loops
                    clearCookies(cookieType, event);
                    return undefined;
                }
            }

            // Cookie is not versioned - force reauthentication
            console.warn(`[Cookies] ${cookieType} cookie is not versioned - clearing stale cookies and forcing reauthentication`);
            clearCookies(cookieType, event);
            return undefined;
        }

        // Handle multi-cookie scenario (we know isMultiCookie is true here)
        console.log(`[Cookies] Found multi-cookie ${cookieType} metadata: ${metadata.totalParts} parts, ${metadata.totalSize} bytes`);

        // Reconstruct data from multiple cookies
        const chunks: string[] = [];
        for (let i = 0; i < metadata.totalParts; i++) {
            const cookieName = `${cookieNamePrefix}${COOKIE_PART_SEPARATOR}${i}`;
            const chunk = event.cookies.get(cookieName);
            if (!chunk) {
                console.warn(`[Cookies] Missing chunk ${i} for multi-cookie ${cookieType} data`);
                return undefined;
            }
            chunks.push(chunk);
        }

        const reconstructedData = chunks.join('');

        // Check if reconstructed data is versioned
        if (cookieEncryption.isVersionedCookie(reconstructedData)) {
            console.log(`[Cookies] Reconstructed ${cookieType} data is versioned, attempting decryption`);

            const keyCache = keyManager.getKeyCache();

            const decryptedData = cookieEncryption.decrypt(reconstructedData, keyCache);

            if (decryptedData) {
                console.log(`[Cookies] Successfully decrypted multi-cookie versioned ${cookieType} data`);
                return JSON.parse(decryptedData);
            } else {
                console.warn(`[Cookies] Failed to decrypt multi-cookie versioned ${cookieType} data - clearing stale cookies`);
                // Clear the bad cookies to prevent infinite retry loops
                clearCookies(cookieType, event);
                return undefined;
            }
        } else {
            // Multi-cookie data is not versioned - force reauthentication
            console.warn(`[Cookies] Multi-cookie ${cookieType} data is not versioned - clearing stale cookies and forcing reauthentication`);
            clearCookies(cookieType, event);
            return undefined;
        }
    } catch (error) {
        console.error(`[Cookies] Error during ${cookieType} cookie deserialization - clearing stale cookies:`, error);
        // Clear potentially corrupted cookies on any deserialization error
        clearCookies(cookieType, event);
        return undefined;
    }
}

/**
 * Clears all authentication-related cookies
 */
export function clearCookies(cookieType: CookieType, event: RequestEvent): void {
    const cookieNamePrefix = cookieTypeToCookieNamePrefix[cookieType];
    // Clear the main cookie
    event.cookies.delete(cookieNamePrefix, {
        path: '/',
        maxAge: 0 // Force immediate expiration
    });

    // Clear any part cookies (for multi-cookie scenarios)
    const allCookies = event.cookies.getAll();
    allCookies.forEach((cookie) => {
        if (cookie.name.startsWith(`${cookieNamePrefix}${COOKIE_PART_SEPARATOR}`)) {
            event.cookies.delete(cookie.name, {
                path: '/',
                maxAge: 0 // Force immediate expiration
            });
        }
    });
}

/**
 * Splits a string into chunks of specified size
 */
function splitStringIntoChunks(str: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += chunkSize) {
        chunks.push(str.slice(i, i + chunkSize));
    }
    return chunks;
}

// ===== COOKIE VERSION VALIDATION =====

/**
 * Cookie validation result types
 */
export type CookieValidationResult = 'not_found' | 'version_mismatch' | 'valid' | 'error';

/**
 * Checks if a cookie exists and if its version is supported by current keys
 * This is a lightweight check that doesn't fully deserialize the data
 * @param cookieType - Type of cookie to check
 * @param event - SvelteKit request event
 * @param keyManager - KeyManager instance for version validation
 * @returns Validation result indicating cookie status
 */
export function checkCookieVersionCompatibility(cookieType: CookieType, event: RequestEvent, keyManager: KeyManager): CookieValidationResult {
    const cookieNamePrefix = cookieTypeToCookieNamePrefix[cookieType];
    const mainCookie = event.cookies.get(cookieNamePrefix);

    if (!mainCookie) {
        return 'not_found';
    }

    const cookieEncryption = new CookieEncryption();
    const keyCache = keyManager.getKeyCache();

    try {
        // Check if this looks like multi-cookie metadata
        let isMultiCookie = false;
        let dataToCheck = mainCookie;

        try {
            const metadata = JSON.parse(mainCookie);
            if (metadata && typeof metadata === 'object' && metadata.totalParts && metadata.totalSize) {
                isMultiCookie = true;

                // Reconstruct data from multiple cookies for version checking
                const chunks: string[] = [];
                for (let i = 0; i < metadata.totalParts; i++) {
                    const cookieName = `${cookieNamePrefix}${COOKIE_PART_SEPARATOR}${i}`;
                    const chunk = event.cookies.get(cookieName);
                    if (!chunk) {
                        return 'error'; // Missing chunk
                    }
                    chunks.push(chunk);
                }
                dataToCheck = chunks.join('');
            }
        } catch {
            // Not JSON, continue with single cookie check
        }

        // Check if the data is versioned
        if (!cookieEncryption.isVersionedCookie(dataToCheck)) {
            return 'version_mismatch'; // Unversioned cookies are incompatible
        }

        // Extract version and check if key exists
        const version = cookieEncryption.extractVersionFromCookie(dataToCheck);
        if (version === undefined) {
            return 'error';
        }

        // Check if we have a key for this version
        if (keyCache.get(version)) {
            return 'valid';
        } else {
            return 'version_mismatch';
        }
    } catch (error) {
        console.error(`[Cookies] Error checking ${cookieType} cookie version compatibility:`, error);
        return 'error';
    }
}

/**
 * Checks all cookie types for version compatibility
 * If ANY cookie has version issues, returns the problematic result
 * This enables atomic "all-or-nothing" authentication state management
 * @param event - SvelteKit request event
 * @param keyManager - KeyManager instance for version validation
 * @returns Object with overall status and per-cookie details
 */
export function validateAllCookieVersions(
    event: RequestEvent,
    keyManager: KeyManager
): {
    overallStatus: 'all_valid' | 'version_mismatch' | 'error' | 'no_auth_cookie';
    details: Record<CookieType, CookieValidationResult>;
} {
    const details: Record<CookieType, CookieValidationResult> = {
        AUTH_USER: checkCookieVersionCompatibility('AUTH_USER', event, keyManager),
        USER_OVERRIDE_DATA: checkCookieVersionCompatibility('USER_OVERRIDE_DATA', event, keyManager),
        CONTENT_ADMIN: checkCookieVersionCompatibility('CONTENT_ADMIN', event, keyManager)
    };

    // If AUTH_USER doesn't exist, user isn't authenticated
    if (details.AUTH_USER === 'not_found') {
        return { overallStatus: 'no_auth_cookie', details };
    }

    // If AUTH_USER has version issues, we have a problem
    if (details.AUTH_USER === 'version_mismatch' || details.AUTH_USER === 'error') {
        return { overallStatus: 'version_mismatch', details };
    }

    // If ANY other cookie exists but has version issues, we have inconsistent state
    const otherCookieResults = [details.USER_OVERRIDE_DATA, details.CONTENT_ADMIN];
    const hasVersionMismatch = otherCookieResults.some((result) => result === 'version_mismatch');
    const hasError = otherCookieResults.some((result) => result === 'error');

    if (hasVersionMismatch || hasError) {
        return { overallStatus: 'version_mismatch', details };
    }

    // All existing cookies are valid
    return { overallStatus: 'all_valid', details };
}

// ===== VERSIONED COOKIE FUNCTIONS =====

/**
 * Serialize data to versioned encrypted cookies (generic)
 * Uses the current key version from KeyManager for encryption
 * @param cookieType - Type of cookie to serialize
 * @param event - SvelteKit request event
 * @param data - Data to serialize
 * @param keyManager - KeyManager instance for getting current keys
 */
export function serializeToCookies<T>(cookieType: CookieType, event: RequestEvent, data: T, keyManager: KeyManager): void {
    const cookieEncryption = new CookieEncryption();

    try {
        // Get current version and key from KeyManager
        const currentVersion = keyManager.getCurrentVersion();
        const currentKey = keyManager.getCurrentKey();

        console.log(`[Cookies] Encrypting ${cookieType} data with key version ${currentVersion}`);

        // Serialize data to JSON
        const dataJson = JSON.stringify(data);

        // Encrypt with versioned format (IV generated automatically)
        const encryptedData = cookieEncryption.encrypt(dataJson, currentVersion, currentKey);

        const cookieNamePrefix = cookieTypeToCookieNamePrefix[cookieType];

        // Check if the encrypted data fits in a single cookie
        if (encryptedData.length <= COOKIE_SIZE_LIMIT) {
            // Single cookie approach with versioned data
            event.cookies.set(cookieNamePrefix, encryptedData, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                maxAge: COOKIE_MAX_AGE_SECONDS
            });
        } else {
            // Multi-cookie approach - split the encrypted versioned data
            const chunks = splitStringIntoChunks(encryptedData, COOKIE_SIZE_LIMIT);

            // Set the main cookie with metadata
            const metadata = {
                totalParts: chunks.length,
                totalSize: encryptedData.length,
                timestamp: Date.now(),
                version: currentVersion // Include version in metadata for debugging
            };

            event.cookies.set(cookieNamePrefix, JSON.stringify(metadata), {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                maxAge: COOKIE_MAX_AGE_SECONDS
            });

            // Set each chunk as a separate cookie
            chunks.forEach((chunk, index) => {
                const cookieName = `${cookieNamePrefix}${COOKIE_PART_SEPARATOR}${index}`;
                event.cookies.set(cookieName, chunk, {
                    path: '/',
                    httpOnly: true,
                    secure: true,
                    sameSite: 'lax',
                    maxAge: COOKIE_MAX_AGE_SECONDS
                });
            });
        }

        console.log(`[Cookies] Successfully serialized ${cookieType} cookies with version ${currentVersion}`);
    } catch (error) {
        console.error(`[Cookies] Failed to serialize ${cookieType} versioned cookies:`, error);
        throw new Error(`Failed to serialize ${cookieType} versioned cookies: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// ===== CONVENIENCE FUNCTIONS FOR SPECIFIC COOKIE TYPES =====

/**
 * Serialize authenticated user to versioned encrypted cookies
 */
export function serializeAuthenticatedUserToCookies(event: RequestEvent, user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>, keyManager: KeyManager): void {
    serializeToCookies('AUTH_USER', event, user, keyManager);
}

/**
 * Serialize user override data to versioned encrypted cookies
 */
export function serializeUserOverrideDataToCookies(event: RequestEvent, data: UserOverrideData, keyManager: KeyManager): void {
    serializeToCookies('USER_OVERRIDE_DATA', event, data, keyManager);
}

/**
 * Serialize content admin data to versioned encrypted cookies
 */
export function serializeContentAdminDataToCookies(event: RequestEvent, data: ContentAdminData, keyManager: KeyManager): void {
    serializeToCookies('CONTENT_ADMIN', event, data, keyManager);
}

/**
 * Deserialize authenticated user from versioned encrypted cookies
 */
export function deserializeAuthenticatedUserFromCookies(event: RequestEvent, keyManager: KeyManager): AuthenticatedUser<RecordOrUndef, RecordOrUndef> | undefined {
    return deserializeFromCookies<AuthenticatedUser<RecordOrUndef, RecordOrUndef>>('AUTH_USER', event, keyManager);
}

/**
 * Deserialize user override data from versioned encrypted cookies
 */
export function deserializeUserOverrideDataFromCookies(event: RequestEvent, keyManager: KeyManager): UserOverrideData | undefined {
    return deserializeFromCookies<UserOverrideData>('USER_OVERRIDE_DATA', event, keyManager);
}

/**
 * Deserialize content admin data from versioned encrypted cookies
 */
export function deserializeContentAdminDataFromCookies(event: RequestEvent, keyManager: KeyManager): ContentAdminData | undefined {
    return deserializeFromCookies<ContentAdminData>('CONTENT_ADMIN', event, keyManager);
}
