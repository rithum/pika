import { KMSProvider } from './KMSProvider';
import { SSMKeyProvider } from './SSMKeyProvider';
import { VersionManager } from './VersionManager';
import type { SsmKeyParameters } from './types';

/**
 * Manages cookie encryption keys with automatic refresh and caching.
 *
 * Features:
 * - In-memory cache of plaintext keys
 * - Automatic key refresh based on configurable interval
 * - Graceful fallback to cached keys if refresh fails
 * - Thread-safe initialization and refresh operations
 */
export class KeyManager {
    private keyCache: Map<number, Buffer> = new Map();
    private currentVersion: number = 1;
    private lastRefreshTime: number = 0;
    private initialized: boolean = false;
    private refreshInProgress: boolean = false;

    private ssmProvider: SSMKeyProvider;
    private kmsProvider: KMSProvider;
    private versionManager: VersionManager;
    private refreshIntervalMs: number;
    private maxKeyVersions: number;

    constructor(ssmPrefix: string, kmsKeyAlias: string, region: string, refreshIntervalHours: number = 1, maxKeyVersions: number = 3) {
        this.ssmProvider = new SSMKeyProvider(ssmPrefix, region, kmsKeyAlias);
        this.kmsProvider = new KMSProvider(kmsKeyAlias, region);
        this.versionManager = new VersionManager();
        this.refreshIntervalMs = refreshIntervalHours * 60 * 60 * 1000; // Convert hours to milliseconds
        this.maxKeyVersions = maxKeyVersions;
    }

    /**
     * Initialize the key manager by loading keys from SSM/KMS
     * Must be called before using other methods
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            console.log('[KeyManager] Already initialized, skipping');
            return;
        }

        console.log('[KeyManager] Initializing key manager...');

        try {
            // Get all key parameters in a single SSM call (optimized)
            const allParams = await this.ssmProvider.getAllKeyParameters();

            this.currentVersion = allParams.currentVersion ?? 1;

            console.log(`[KeyManager] Found current version: ${this.currentVersion}, active versions: [${allParams.activeVersions?.join(', ')}]`);

            // Load all active keys into cache using batch data
            await this.loadKeysIntoCacheBatch(allParams);

            this.lastRefreshTime = Date.now();
            this.initialized = true;

            console.log(`[KeyManager] Initialization complete. Cached ${this.keyCache.size} key versions`);
        } catch (error) {
            console.error('[KeyManager] Initialization failed:', error);

            // Check if this looks like missing infrastructure
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (
                errorMessage.includes('ParameterNotFound') ||
                errorMessage.includes('Current version parameter not found') ||
                errorMessage.includes('system needs initialization')
            ) {
                // Detect if we're in local development mode
                const isLocal = process.env.NODE_ENV === 'development';

                let helpfulError = 'Cookie encryption infrastructure is not set up.\n\n';

                if (isLocal) {
                    helpfulError += '--For local development, you have two options:\n\n';
                    helpfulError += '1. Set up encryption infrastructure manually:\n';
                    helpfulError += '   pnpm run encryption:setup --setup\n\n';
                    helpfulError += '2. Or deploy the full CloudFormation stack:\n';
                    helpfulError += '   pnpm run cdk:deploy\n\n';
                    helpfulError += 'The encryption setup tool is recommended for local development.\n\n';
                } else {
                    helpfulError += '-- This usually means:\n';
                    helpfulError += '- The CloudFormation stack has not been deployed yet\n';
                    helpfulError += '- The custom resource failed during stack deployment\n';
                    helpfulError += '- The KMS key or SSM parameters were manually deleted\n\n';
                    helpfulError += 'Check your CloudFormation stack deployment status.\n\n';
                }

                helpfulError += `Original error: ${errorMessage}`;

                throw new Error(helpfulError);
            }

            throw new Error(`KeyManager initialization failed: ${errorMessage}`);
        }
    }

    /**
     * Refresh keys if the refresh interval has elapsed
     * Gracefully handles failures by continuing to use cached keys
     */
    async refreshKeysIfNeeded(): Promise<void> {
        if (!this.initialized) {
            console.warn('[KeyManager] Refresh attempted before initialization');
            return;
        }

        if (!this.shouldRefreshKeys()) {
            return;
        }

        if (this.refreshInProgress) {
            console.log('[KeyManager] Refresh already in progress, skipping');
            return;
        }

        this.refreshInProgress = true;

        try {
            console.log('[KeyManager] Starting key refresh...');

            // Get all key parameters in a single SSM call (optimized)
            const allParams = await this.ssmProvider.getAllKeyParameters();

            // Check if we need to update our cache
            let cacheNeedsUpdate = false;

            if (allParams.currentVersion !== this.currentVersion) {
                console.log(`[KeyManager] Current version changed: ${this.currentVersion} → ${allParams.currentVersion}`);
                this.currentVersion = allParams.currentVersion ?? 1;
                cacheNeedsUpdate = true;
            }

            const currentCachedVersions = Array.from(this.keyCache.keys()).sort();
            const sortedLatestVersions = this.versionManager.sortVersions(allParams.activeVersions || []);

            if (!this.arraysEqual(currentCachedVersions.sort(), sortedLatestVersions.sort())) {
                console.log(`[KeyManager] Active versions changed: [${currentCachedVersions.join(', ')}] → [${sortedLatestVersions.join(', ')}]`);
                cacheNeedsUpdate = true;
            }

            if (cacheNeedsUpdate) {
                // Load new/updated keys using batch data
                await this.loadKeysIntoCacheBatch(allParams);

                // Clean up old cached versions that are no longer active
                this.cleanupCache(allParams.activeVersions || []);

                console.log(
                    `[KeyManager] Cache updated. Now caching ${this.keyCache.size} versions: [${Array.from(this.keyCache.keys())
                        .sort((a, b) => b - a)
                        .join(', ')}]`
                );
            } else {
                console.log('[KeyManager] No cache updates needed');
            }

            this.lastRefreshTime = Date.now();
            console.log('[KeyManager] Key refresh completed successfully');
        } catch (error) {
            console.warn('[KeyManager] Key refresh failed, continuing with cached keys:', error);
            // Don't throw - we want to continue using cached keys
        } finally {
            this.refreshInProgress = false;
        }
    }

    /**
     * Get the current version number for encryption
     */
    getCurrentVersion(): number {
        if (!this.initialized) {
            throw new Error('KeyManager not initialized');
        }
        return this.currentVersion;
    }

    /**
     * Get the current encryption key
     */
    getCurrentKey(): Buffer {
        if (!this.initialized) {
            throw new Error('KeyManager not initialized');
        }

        const key = this.keyCache.get(this.currentVersion);
        if (!key) {
            throw new Error(`Current key (version ${this.currentVersion}) not found in cache`);
        }

        return key;
    }

    /**
     * Get the entire key cache (for decryption of older cookies)
     */
    getKeyCache(): Map<number, Buffer> {
        if (!this.initialized) {
            throw new Error('KeyManager not initialized');
        }
        return new Map(this.keyCache); // Return copy to prevent external modification
    }

    /**
     * Check if keys need refreshing based on time interval
     */
    shouldRefreshKeys(): boolean {
        const timeSinceLastRefresh = Date.now() - this.lastRefreshTime;
        const shouldRefresh = timeSinceLastRefresh >= this.refreshIntervalMs;

        if (shouldRefresh) {
            console.log(
                `[KeyManager] Key refresh needed. Time since last refresh: ${Math.round(timeSinceLastRefresh / (60 * 1000))} minutes (threshold: ${Math.round(this.refreshIntervalMs / (60 * 1000))} minutes)`
            );
        }

        return shouldRefresh;
    }

    /**
     * Get manager status and statistics (for health checks/debugging)
     */
    getStatus(): {
        initialized: boolean;
        currentVersion: number;
        cachedVersions: number[];
        lastRefreshAgo: number;
        nextRefreshIn: number;
        refreshInProgress: boolean;
    } {
        const now = Date.now();
        return {
            initialized: this.initialized,
            currentVersion: this.currentVersion,
            cachedVersions: Array.from(this.keyCache.keys()).sort((a, b) => b - a),
            lastRefreshAgo: now - this.lastRefreshTime,
            nextRefreshIn: Math.max(0, this.refreshIntervalMs - (now - this.lastRefreshTime)),
            refreshInProgress: this.refreshInProgress
        };
    }

    /**
     * Force an immediate refresh (for testing/manual operations)
     * @returns True if refresh succeeded, false otherwise
     */
    async forceRefresh(): Promise<boolean> {
        console.log('[KeyManager] Forcing immediate key refresh...');

        // Reset refresh time to force a refresh
        this.lastRefreshTime = 0;

        try {
            await this.refreshKeysIfNeeded();
            return true;
        } catch (error) {
            console.error('[KeyManager] Forced refresh failed:', error);
            return false;
        }
    }

    /**
     * Load keys using batch data from SSM (optimized)
     * @param allParams - Batch data from getAllKeyParameters()
     */
    private async loadKeysIntoCacheBatch(allParams: SsmKeyParameters): Promise<void> {
        console.log(`[KeyManager] Loading keys for versions: [${allParams.activeVersions?.join(', ')}]`);

        const loadPromises = (allParams.activeVersions || []).map(async (version) => {
            try {
                // Skip if already cached
                if (this.keyCache.has(version)) {
                    console.log(`[KeyManager] Version ${version} already cached, skipping`);
                    return;
                }

                console.log(`[KeyManager] Loading version ${version}...`);

                // Get encrypted key from batch data
                const encryptedKey = (allParams.encryptedKeys || {})[version];

                if (!encryptedKey) {
                    throw new Error(`Encrypted key for version ${version} not found in batch data`);
                }

                // Decrypt with KMS
                const plaintextKey = await this.kmsProvider.decryptDataKey(encryptedKey);

                // Validate key size
                if (plaintextKey.length !== 32) {
                    throw new Error(`Invalid key length for version ${version}: ${plaintextKey.length} bytes`);
                }

                // Cache the plaintext key
                this.keyCache.set(version, plaintextKey);

                console.log(`[KeyManager] Successfully loaded version ${version}`);
            } catch (error) {
                console.error(`[KeyManager] Failed to load version ${version}:`, error);
                throw error; // Fail fast on key loading errors
            }
        });

        await Promise.all(loadPromises);
    }

    /**
     * Remove versions from cache that are no longer active
     * @param activeVersions - Array of versions that should remain in cache
     */
    private cleanupCache(activeVersions: number[]): void {
        const cachedVersions = Array.from(this.keyCache.keys());
        const versionsToRemove = cachedVersions.filter((version) => !activeVersions.includes(version));

        if (versionsToRemove.length > 0) {
            console.log(`[KeyManager] Removing cached versions: [${versionsToRemove.join(', ')}]`);

            versionsToRemove.forEach((version) => {
                this.keyCache.delete(version);
            });
        }
    }

    /**
     * Compare two arrays for equality
     * @param a - First array
     * @param b - Second array
     * @returns True if arrays contain the same elements
     */
    private arraysEqual(a: number[], b: number[]): boolean {
        if (a.length !== b.length) {
            return false;
        }

        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) {
                return false;
            }
        }

        return true;
    }
}
