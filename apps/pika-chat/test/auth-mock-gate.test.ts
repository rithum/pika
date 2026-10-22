import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const config = { isLocal: true, stage: 'test', mockAuth: 'true' as string | undefined };

jest.mock('$lib/server/config', () => ({
    appConfig: {
        get isLocal() {
            return config.isLocal;
        },
        get stage() {
            return config.stage;
        },
        getArbitraryConfigValueNotRequired: (key: string) => (key === 'PIKA_LOCAL_MOCK_AUTH' ? config.mockAuth : undefined),
        getArbitraryConfigValue: () => ''
    }
}));
jest.mock('$lib/custom/local-mock-auth-provider', () => ({
    __esModule: true,
    default: class LocalMockAuthProvider {
        readonly kind = 'local-mock';
    }
}));
jest.mock('../src/lib/server/auth/default-provider', () => ({
    __esModule: true,
    default: class DefaultAuthProvider {
        readonly kind = 'default';
    }
}));

import { loadAuthProvider } from '../src/lib/server/auth';

const DEPLOY_KEYS = ['ECS_CONTAINER_METADATA_URI', 'ECS_CONTAINER_METADATA_URI_V4', 'AWS_EXECUTION_ENV', 'AWS_LAMBDA_FUNCTION_NAME'];

async function kind(): Promise<string> {
    const provider = (await loadAuthProvider()) as unknown as { kind: string };
    return provider.kind;
}

describe('loadAuthProvider mock auth gate', () => {
    let saved: Record<string, string | undefined>;

    beforeEach(() => {
        saved = Object.fromEntries(DEPLOY_KEYS.map((k) => [k, process.env[k]]));
        for (const k of DEPLOY_KEYS) delete process.env[k];
        config.isLocal = true;
        config.mockAuth = 'true';
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        for (const k of DEPLOY_KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
        jest.restoreAllMocks();
    });

    it('returns the local mock provider when local, not deployed, and PIKA_LOCAL_MOCK_AUTH is "true"', async () => {
        expect(await kind()).toBe('local-mock');
    });

    it.each(['1', 'TRUE', 'yes', undefined])('does not open for PIKA_LOCAL_MOCK_AUTH=%s', async (value) => {
        config.mockAuth = value;
        expect(await kind()).toBe('default');
    });

    it('does not open when not local', async () => {
        config.isLocal = false;
        expect(await kind()).toBe('default');
    });

    it.each(DEPLOY_KEYS)('is blocked when %s is set', async (key) => {
        process.env[key] = 'x';
        expect(await kind()).toBe('default');
    });
});
