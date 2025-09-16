import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const LEGACY_ALGORITHM = 'aes-256-cbc';
const NONCE_SIZE = 12; // 12 bytes optimal for GCM
const IV_SIZE = 16; // 16 bytes for legacy CBC
const AUTH_TAG_SIZE = 16; // 16 bytes for GCM auth tag

/**
 * Handles versioned cookie encryption and decryption using AES-256-GCM.
 *
 * New cookie format: "{version}:gcm:{nonce_hex}:{encrypted_data}:{auth_tag_hex}"
 * Legacy cookie format: "{version}:{iv_hex}:{encrypted_data}" (AES-256-CBC)
 *
 * - Version: Integer version number (1-100)
 * - Algorithm: 'gcm' for new cookies, omitted for legacy CBC cookies
 * - Nonce: 12-byte random nonce for GCM (hex encoded)
 * - Encrypted data: AES-256-GCM encrypted JSON using versioned key and unique nonce
 * - Auth tag: 16-byte authentication tag from GCM (hex encoded)
 */
export class CookieEncryption {
    /**
     * Encrypt data with a versioned key using AES-256-GCM (generates unique nonce per operation)
     * @param data - Plain text data to encrypt
     * @param version - Key version number
     * @param key - 32-byte encryption key
     * @returns Versioned encrypted string: "{version}:gcm:{nonce_hex}:{encrypted_hex}:{auth_tag_hex}"
     */
    encrypt(data: string, version: number, key: Buffer): string {
        try {
            // Validate inputs
            if (!data || typeof data !== 'string') {
                throw new Error('Data must be a non-empty string');
            }

            if (!Number.isInteger(version) || version <= 0) {
                throw new Error(`Invalid version: ${version}. Must be a positive integer`);
            }

            if (!Buffer.isBuffer(key) || key.length !== 32) {
                throw new Error(`Invalid key length: ${key.length}. Must be 32 bytes`);
            }

            // Generate a unique nonce for this GCM encryption operation
            const nonce = crypto.randomBytes(NONCE_SIZE);

            // Perform AES-256-GCM encryption
            const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Get the authentication tag from GCM
            const authTag = cipher.getAuthTag();

            // Return versioned format with algorithm indicator: "version:gcm:nonce_hex:encrypted_data:auth_tag_hex"
            const nonceHex = nonce.toString('hex');
            const authTagHex = authTag.toString('hex');
            return `${version}:gcm:${nonceHex}:${encrypted}:${authTagHex}`;
        } catch (error) {
            throw new Error(`Cookie encryption failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Decrypt versioned cookie data
     * @param encryptedCookie - Versioned encrypted cookie: "{version}:{iv_hex}:{encrypted_data}"
     * @param keyCache - Map of version number to decryption key
     * @returns Decrypted plaintext data, or undefined if decryption fails
     */
    decrypt(encryptedCookie: string, keyCache: Map<number, Buffer>): string | undefined {
        try {
            if (!encryptedCookie || typeof encryptedCookie !== 'string') {
                console.warn('[CookieEncryption] Invalid encrypted cookie: not a string or empty');
                return undefined;
            }

            // Parse format - detect legacy (3-part) vs new (5-part)
            const parts = encryptedCookie.split(':');

            if (parts.length === 3) {
                // Legacy CBC format: "version:iv_hex:encrypted_data"
                return this.decryptLegacyCBC(parts, keyCache);
            } else if (parts.length === 5) {
                // New GCM format: "version:gcm:nonce_hex:encrypted_data:auth_tag_hex"
                return this.decryptGCM(parts, keyCache);
            } else {
                console.warn(`[CookieEncryption] Invalid cookie format: expected 3 or 5 parts, got ${parts.length}`);
                return undefined;
            }
        } catch (error) {
            console.warn(`[CookieEncryption] Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Decrypt GCM format cookie: "version:gcm:nonce_hex:encrypted_data:auth_tag_hex"
     * @private
     */
    private decryptGCM(parts: string[], keyCache: Map<number, Buffer>): string | undefined {
        try {
            const [versionStr, algorithm, nonceHex, encryptedData, authTagHex] = parts;
            const version = parseInt(versionStr, 10);

            if (isNaN(version)) {
                console.warn('[CookieEncryption] Invalid version in GCM cookie');
                return undefined;
            }

            if (algorithm !== 'gcm') {
                console.warn(`[CookieEncryption] Unsupported algorithm in cookie: ${algorithm}`);
                return undefined;
            }

            // Get key for this version
            const key = keyCache.get(version);
            if (!key) {
                console.warn(`[CookieEncryption] No key found for version ${version}. Available versions: ${Array.from(keyCache.keys()).join(', ')}`);
                return undefined;
            }

            // Convert nonce and auth tag from hex back to Buffer
            const nonce = Buffer.from(nonceHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');

            // Validate key, nonce, and auth tag sizes
            if (key.length !== 32) {
                console.error(`[CookieEncryption] Invalid key length for version ${version}: ${key.length} bytes`);
                return undefined;
            }

            if (nonce.length !== NONCE_SIZE) {
                console.error(`[CookieEncryption] Invalid nonce length: ${nonce.length} bytes, expected ${NONCE_SIZE}`);
                return undefined;
            }

            if (authTag.length !== AUTH_TAG_SIZE) {
                console.error(`[CookieEncryption] Invalid auth tag length: ${authTag.length} bytes, expected ${AUTH_TAG_SIZE}`);
                return undefined;
            }

            // Perform AES-256-GCM decryption
            const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.warn(`[CookieEncryption] GCM decryption failed: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Decrypt legacy CBC format cookie: "version:iv_hex:encrypted_data"
     * @private
     */
    private decryptLegacyCBC(parts: string[], keyCache: Map<number, Buffer>): string | undefined {
        try {
            const [versionStr, ivHex, encryptedData] = parts;
            const version = parseInt(versionStr, 10);

            if (isNaN(version)) {
                console.warn('[CookieEncryption] Invalid version in legacy CBC cookie');
                return undefined;
            }

            // Get key for this version
            const key = keyCache.get(version);
            if (!key) {
                console.warn(`[CookieEncryption] No key found for version ${version}. Available versions: ${Array.from(keyCache.keys()).join(', ')}`);
                return undefined;
            }

            // Convert IV from hex back to Buffer
            const iv = Buffer.from(ivHex, 'hex');

            // Validate key and IV sizes
            if (key.length !== 32) {
                console.error(`[CookieEncryption] Invalid key length for version ${version}: ${key.length} bytes`);
                return undefined;
            }

            if (iv.length !== IV_SIZE) {
                console.error(`[CookieEncryption] Invalid IV length: ${iv.length} bytes, expected ${IV_SIZE}`);
                return undefined;
            }

            // Perform AES-256-CBC decryption
            const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, key, iv);
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.warn(`[CookieEncryption] Legacy CBC decryption failed: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Extract version number from versioned cookie (supports both formats)
     * @param cookie - Versioned cookie string:
     *   New format: "{version}:gcm:{nonce_hex}:{encrypted_data}:{auth_tag_hex}"
     *   Legacy format: "{version}:{iv_hex}:{encrypted_data}"
     * @returns Version number, or undefined if extraction fails
     */
    extractVersionFromCookie(cookie: string): number | undefined {
        try {
            if (!cookie || typeof cookie !== 'string') {
                return undefined;
            }

            const parts = cookie.split(':');
            // Support both 3-part (legacy CBC) and 5-part (new GCM) formats
            if (parts.length !== 3 && parts.length !== 5) {
                return undefined;
            }

            const version = parseInt(parts[0], 10);

            if (isNaN(version) || version <= 0) {
                return undefined;
            }

            return version;
        } catch (error) {
            console.warn(`[CookieEncryption] Failed to extract version: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Check if a cookie string appears to be versioned (supports both formats)
     * @param cookie - Cookie string to check
     * @returns True if cookie has version format (either GCM or legacy CBC)
     */
    isVersionedCookie(cookie: string): boolean {
        return this.extractVersionFromCookie(cookie) !== undefined;
    }

    /**
     * Detect the encryption algorithm used in a cookie
     * @param cookie - Cookie string to analyze
     * @returns 'gcm', 'cbc', or undefined if format is invalid
     */
    detectAlgorithm(cookie: string): 'gcm' | 'cbc' | undefined {
        try {
            if (!cookie || typeof cookie !== 'string') {
                return undefined;
            }

            const parts = cookie.split(':');

            if (parts.length === 3) {
                // Legacy CBC format
                return 'cbc';
            } else if (parts.length === 5) {
                // New format with explicit algorithm
                const algorithm = parts[1];
                return algorithm === 'gcm' ? 'gcm' : undefined;
            }

            return undefined;
        } catch (error) {
            console.warn(`[CookieEncryption] Failed to detect algorithm: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Validate that key cache contains valid keys
     * @param keyCache - Map of version to key
     * @returns True if cache is valid
     */
    validateCache(keyCache: Map<number, Buffer>): boolean {
        // Validate key sizes
        for (const [version, key] of keyCache.entries()) {
            if (key.length !== 32) {
                console.error(`[CookieEncryption] Invalid key length for version ${version}: ${key.length} bytes`);
                return false;
            }
        }

        return true;
    }

    /**
     * Get statistics about cache contents (for debugging/monitoring)
     * @param keyCache - Map of version to key
     * @returns Object with cache statistics including supported algorithms
     */
    getCacheStats(keyCache: Map<number, Buffer>): {
        keyCount: number;
        versions: number[];
        valid: boolean;
        primaryAlgorithm: 'gcm';
        legacySupport: boolean;
    } {
        return {
            keyCount: keyCache.size,
            versions: Array.from(keyCache.keys()).sort((a, b) => b - a), // Newest first
            valid: this.validateCache(keyCache),
            primaryAlgorithm: 'gcm',
            legacySupport: true // Always supports legacy CBC decryption
        };
    }
}
