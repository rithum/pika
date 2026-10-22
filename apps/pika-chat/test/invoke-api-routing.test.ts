import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const config = { isLocal: false, localBase: undefined as string | undefined };
const signMock = jest.fn<(req: Record<string, unknown>) => Promise<Record<string, unknown>>>();

jest.mock('$lib/server/config', () => ({
    appConfig: {
        get isLocal() {
            return config.isLocal;
        },
        awsRegion: 'us-east-1',
        stage: 'test',
        getArbitraryConfigValueNotRequired: (key: string) => (key === 'LOCAL_CHAT_API_BASE_URL' ? config.localBase : undefined)
    }
}));
jest.mock('@aws-sdk/credential-provider-node', () => ({
    defaultProvider: () => async () => ({ accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' })
}));
jest.mock('@smithy/signature-v4', () => ({
    SignatureV4: class {
        sign(req: Record<string, unknown>) {
            return signMock(req);
        }
    }
}));
jest.mock('$lib/server/utils', () => ({
    checkApiGatewayResponse: () => undefined
}));

import { invokeApi } from '../src/lib/server/invoke-api';

const DEPLOYED_URL = 'https://api123.execute-api.us-east-1.amazonaws.com/api/chat/user/u1';

describe('invokeApi conditional signing', () => {
    const originalFetch = global.fetch;
    const savedEnv = { ...process.env };
    let fetchMock: jest.Mock<typeof fetch>;

    beforeEach(() => {
        for (const k of ['ECS_CONTAINER_METADATA_URI', 'ECS_CONTAINER_METADATA_URI_V4', 'AWS_EXECUTION_ENV', 'AWS_LAMBDA_FUNCTION_NAME']) delete process.env[k];
        config.isLocal = false;
        config.localBase = undefined;
        signMock.mockReset();
        signMock.mockImplementation(async (req) => ({ ...req, headers: { ...(req.headers as Record<string, string>), Authorization: 'signed' } }));
        fetchMock = jest.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: true })));
        global.fetch = fetchMock;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        process.env = { ...savedEnv };
    });

    const call = () => invokeApi({ apiId: 'api123', path: 'api/chat/user/u1', errorInfo: { operation: 'op', resourceName: 'res' } });
    const fetchedRequest = () => fetchMock.mock.calls[0][0] as Request;

    it('signs and fetches the execute-api URL when deployed', async () => {
        await call();
        expect(signMock).toHaveBeenCalledTimes(1);
        expect(fetchedRequest().url).toBe(DEPLOYED_URL);
        expect(fetchedRequest().headers.get('authorization')).toBe('signed');
    });

    it('does not sign and fetches the loopback base URL when local with LOCAL_CHAT_API_BASE_URL', async () => {
        config.isLocal = true;
        config.localBase = 'http://127.0.0.1:3001';
        await call();
        expect(signMock).not.toHaveBeenCalled();
        expect(fetchedRequest().url).toBe('http://127.0.0.1:3001/api/chat/user/u1');
        expect(fetchedRequest().headers.get('authorization')).toBeNull();
    });

    it('signs and uses the deployed URL when local but AWS_EXECUTION_ENV is set', async () => {
        config.isLocal = true;
        config.localBase = 'http://127.0.0.1:3001';
        process.env.AWS_EXECUTION_ENV = 'AWS_ECS_FARGATE';
        await call();
        expect(signMock).toHaveBeenCalledTimes(1);
        expect(fetchedRequest().url).toBe(DEPLOYED_URL);
    });

    it('signs and uses the deployed URL when local without LOCAL_CHAT_API_BASE_URL', async () => {
        config.isLocal = true;
        await call();
        expect(signMock).toHaveBeenCalledTimes(1);
        expect(fetchedRequest().url).toBe(DEPLOYED_URL);
    });
});
