import { KeyManager } from './KeyManager';

/**
 * Factory to provide a single KeyManager instance for the webapp.
 * This ensures we have one shared instance without making KeyManager itself a singleton.
 */
export class KeyManagerFactory {
    private static instance: KeyManager | undefined;

    /**
     * Set the KeyManager instance (called during server initialization)
     */
    static setInstance(keyManager: KeyManager): void {
        if (KeyManagerFactory.instance) {
            console.warn('[KeyManagerFactory] Instance already set, overwriting');
        }
        KeyManagerFactory.instance = keyManager;
    }

    /**
     * Get the shared KeyManager instance
     * @throws Error if instance hasn't been set yet
     */
    static getInstance(): KeyManager {
        if (!KeyManagerFactory.instance) {
            throw new Error('KeyManager instance not initialized. Call setInstance() first during server initialization.');
        }
        return KeyManagerFactory.instance;
    }

    /**
     * Check if instance is available
     */
    static hasInstance(): boolean {
        return KeyManagerFactory.instance !== undefined;
    }

    /**
     * Clear the instance (primarily for testing)
     */
    static clearInstance(): void {
        KeyManagerFactory.instance = undefined;
    }
}
