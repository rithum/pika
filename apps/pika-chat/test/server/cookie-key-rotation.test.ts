import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { KeyManager } from '../../src/lib/server/encryption/KeyManager';
import { rotateKeys } from '../../src/lib/server/encryption/KeyRotationUtils';
import { KMSProvider } from '../../src/lib/server/encryption/KMSProvider';
import { SSMKeyProvider } from '../../src/lib/server/encryption/SSMKeyProvider';
import { VersionManager } from '../../src/lib/server/encryption/VersionManager';
import type { SsmKeyParameters } from '../../src/lib/server/encryption/types';

const MAX_KEY_VERSIONS = 3;
const KEY_BYTES = 32;

class FakeSsm {
    currentVersion: number | undefined;
    activeVersions: number[] | undefined;
    encryptedKeys: Record<number, string> = {};

    constructor(currentVersion?: number, activeVersions?: number[]) {
        this.currentVersion = currentVersion;
        this.activeVersions = activeVersions;
        for (const v of activeVersions ?? []) {
            this.encryptedKeys[v] = `enc-${v}`;
        }
    }

    async getAllKeyParameters(): Promise<SsmKeyParameters> {
        return {
            currentVersion: this.currentVersion,
            activeVersions: this.activeVersions,
            lastRotationTime: new Date(0),
            encryptedKeys: { ...this.encryptedKeys }
        };
    }

    async storeEncryptedDEK(version: number, encryptedKey: string): Promise<void> {
        this.encryptedKeys[version] = encryptedKey;
    }

    async updateCurrentVersion(version: number): Promise<void> {
        this.currentVersion = version;
    }

    async updateActiveVersions(versions: number[]): Promise<void> {
        this.activeVersions = versions;
    }

    async updateLastRotationTime(): Promise<void> {}

    async deleteOldKeys(versions: number[]): Promise<void> {
        for (const v of versions) {
            delete this.encryptedKeys[v];
        }
    }

    async acquireRotationLock(): Promise<void> {}

    async releaseRotationLock(): Promise<void> {}
}

const fakeKms = {
    generateDataKey: async () => ({ plaintextKey: Buffer.alloc(KEY_BYTES), encryptedKey: 'enc-new' })
} as unknown as KMSProvider;

async function rotate(ssm: FakeSsm) {
    return rotateKeys(ssm as unknown as SSMKeyProvider, fakeKms, MAX_KEY_VERSIONS, true, 'test');
}

describe('VersionManager.nextActiveVersions', () => {
    const versionManager = new VersionManager();

    it('keeps the new version first across the 100 -> 1 rollover', () => {
        expect(versionManager.nextActiveVersions(100, 99, [99, 98, 97])).toEqual([100, 99, 98]);
        expect(versionManager.nextActiveVersions(1, 100, [100, 99, 98])).toEqual([1, 100, 99]);
        expect(versionManager.nextActiveVersions(2, 1, [1, 100, 99])).toEqual([2, 1, 100]);
    });

    it('keeps the previous current version when active-versions had dropped it', () => {
        expect(versionManager.nextActiveVersions(2, 1, [100, 99, 98])).toEqual([2, 1, 100]);
    });

    it('starts from just the new version on initialization', () => {
        expect(versionManager.nextActiveVersions(1, 0, [])).toEqual([1]);
    });
});

describe('rotateKeys rollover', () => {
    it('keeps the current version active through 99 -> 100 -> 1 -> 2', async () => {
        const ssm = new FakeSsm(99, [99, 98, 97]);

        const expected = [
            { current: 100, active: [100, 99, 98] },
            { current: 1, active: [1, 100, 99] },
            { current: 2, active: [2, 1, 100] }
        ];
        for (const step of expected) {
            const result = await rotate(ssm);
            expect(result.newVersion).toBe(step.current);
            expect(ssm.currentVersion).toBe(step.current);
            expect(ssm.activeVersions).toEqual(step.active);
            expect(Object.keys(ssm.encryptedKeys).map(Number).sort((a, b) => a - b)).toEqual([...step.active].sort((a, b) => a - b));
        }
    });

    it('recovers a stage left with the current version missing from active-versions', async () => {
        const ssm = new FakeSsm(1, [100, 99, 98]);
        ssm.encryptedKeys[1] = 'enc-1';

        await rotate(ssm);

        expect(ssm.currentVersion).toBe(2);
        expect(ssm.activeVersions).toEqual([2, 1, 100]);
    });
});

describe('KeyManager current-version loading', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    function keyFor(encryptedKey: string): Buffer {
        return Buffer.alloc(KEY_BYTES, encryptedKey);
    }

    async function initializedKeyManager(ssm: FakeSsm) {
        jest.spyOn(SSMKeyProvider.prototype, 'getAllKeyParameters').mockImplementation(() => ssm.getAllKeyParameters());
        const decrypt = jest.spyOn(KMSProvider.prototype, 'decryptDataKey').mockImplementation(async (encryptedKey: string) => keyFor(encryptedKey));
        const keyManager = new KeyManager('/test/cookie-encryption', 'alias/test', 'us-east-1');
        await keyManager.initialize();
        return { keyManager, decrypt };
    }

    it('serves the current key even when active-versions omits it', async () => {
        const ssm = new FakeSsm(1, [100, 99, 98]);
        ssm.encryptedKeys[1] = 'enc-1';

        const { keyManager } = await initializedKeyManager(ssm);

        expect(keyManager.getCurrentKey()).toEqual(keyFor('enc-1'));
    });

    it('still starts when the current key is missing from SSM', async () => {
        const ssm = new FakeSsm(1, [100, 99, 98]);

        const { keyManager } = await initializedKeyManager(ssm);

        expect(() => keyManager.getCurrentKey()).toThrow('Current key (version 1) not found in cache');
        expect(keyManager.getKeyCache().get(100)).toEqual(keyFor('enc-100'));
    });

    it('serves the new current key after refreshing across the 100 -> 1 rotation', async () => {
        const ssm = new FakeSsm(100, [100, 99, 98]);
        const { keyManager } = await initializedKeyManager(ssm);

        await rotate(ssm);
        expect(await keyManager.forceRefresh()).toBe(true);

        expect(keyManager.getCurrentKey()).toEqual(keyFor('enc-new'));
        expect(keyManager.getKeyCache().get(100)).toEqual(keyFor('enc-100'));
        expect(keyManager.getKeyCache().has(98)).toBe(false);
    });

    it('keeps serving the previous current key when a refresh fails to load the new one', async () => {
        const ssm = new FakeSsm(100, [100, 99, 98]);
        const { keyManager, decrypt } = await initializedKeyManager(ssm);

        await rotate(ssm);
        decrypt.mockRejectedValueOnce(new Error('KMS unavailable'));
        await keyManager.forceRefresh();

        expect(keyManager.getCurrentKey()).toEqual(keyFor('enc-100'));
    });
});
