import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

/**
 * Handles versioned cookie encryption and decryption.
 *
 * Cookie format: "{version}:{iv_hex}:{encrypted_data}"
 * - Version: Integer version number (1-100)
 * - IV: 16-byte random initialization vector (hex encoded)
 * - Encrypted data: AES-256-CBC encrypted JSON using versioned key and unique IV
 */
export class CookieEncryption {
    /**
     * Encrypt data with a versioned key (generates unique IV per operation)
     * @param data - Plain text data to encrypt
     * @param version - Key version number
     * @param key - 32-byte encryption key
     * @returns Versioned encrypted string: "{version}:{iv_hex}:{encrypted_hex}"
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

            // Generate a unique IV for this encryption operation
            const iv = crypto.randomBytes(16);

            // Perform AES-256-CBC encryption
            const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Return versioned format with IV: "version:iv_hex:encrypted_data"
            const ivHex = iv.toString('hex');
            return `${version}:${ivHex}:${encrypted}`;
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

            // Parse format: "version:iv_hex:encrypted_data"
            const parts = encryptedCookie.split(':');
            if (parts.length !== 3) {
                console.warn('[CookieEncryption] Invalid cookie format: expected version:iv:data');
                return undefined;
            }

            const [versionStr, ivHex, encryptedData] = parts;
            const version = parseInt(versionStr, 10);

            if (isNaN(version)) {
                console.warn('[CookieEncryption] Invalid version in cookie');
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

            if (iv.length !== 16) {
                console.error(`[CookieEncryption] Invalid IV length: ${iv.length} bytes`);
                return undefined;
            }

            // Perform AES-256-CBC decryption
            const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.warn(`[CookieEncryption] Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Extract version number from versioned cookie
     * @param cookie - Versioned cookie string: "{version}:{iv_hex}:{encrypted_data}"
     * @returns Version number, or undefined if extraction fails
     */
    extractVersionFromCookie(cookie: string): number | undefined {
        try {
            if (!cookie || typeof cookie !== 'string') {
                return undefined;
            }

            const parts = cookie.split(':');
            if (parts.length !== 3) {
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
     * Check if a cookie string appears to be versioned
     * @param cookie - Cookie string to check
     * @returns True if cookie has version format
     */
    isVersionedCookie(cookie: string): boolean {
        return this.extractVersionFromCookie(cookie) !== undefined;
    }

    /**
     * Validate that key cache contains valid keys
     * @param keyCache - Map of version to key
     * @returns True if cache is valid
     */
    validateCache(keyCache: Map<number, Buffer>): boolean {
        // Validate key sizes
        for (const [version, key] of keyCache) {
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
     * @returns Object with cache statistics
     */
    getCacheStats(keyCache: Map<number, Buffer>): {
        keyCount: number;
        versions: number[];
        valid: boolean;
    } {
        return {
            keyCount: keyCache.size,
            versions: Array.from(keyCache.keys()).sort((a, b) => b - a), // Newest first
            valid: this.validateCache(keyCache)
        };
    }
}
