import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const config = { override: undefined as string | undefined };

jest.mock('$lib/server/config', () => ({
    appConfig: {
        isLocal: true,
        awsRegion: 'us-east-1',
        jwtSecret: 'secret',
        converseFnUrl: 'https://abc123.lambda-url.us-east-1.on.aws/',
        getArbitraryConfigValueNotRequired: (key: string) => (key === 'LOCAL_CONVERSE_FUNCTION_URL' ? config.override : undefined)
    }
}));
jest.mock('@aws-sdk/credential-provider-node', () => ({
    defaultProvider: () => async () => ({ accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' })
}));

import { invokeConverseFunctionUrl } from '../src/lib/server/invoke-converse-fn-url';

const REQUEST = { userId: 'u1', message: 'hi' } as never;
const USER = { userId: 'u1' } as never;

describe('invokeConverseFunctionUrl local override host check', () => {
    const originalFetch = global.fetch;
    let fetchMock: jest.Mock<typeof fetch>;
    const savedEnv = { ...process.env };

    beforeEach(() => {
        for (const k of ['ECS_CONTAINER_METADATA_URI', 'ECS_CONTAINER_METADATA_URI_V4', 'AWS_EXECUTION_ENV', 'AWS_LAMBDA_FUNCTION_NAME']) delete process.env[k];
        fetchMock = jest.fn<typeof fetch>(async () => new Response('ok'));
        global.fetch = fetchMock;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        process.env = { ...savedEnv };
    });

    it('throws for a non-loopback, non-Lambda override before any fetch', async () => {
        config.override = 'https://example.com/converse';
        await expect(invokeConverseFunctionUrl(REQUEST, USER)).rejects.toThrow(/must be a loopback or Lambda function URL, got example\.com/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('allows a Lambda function URL override', async () => {
        config.override = 'https://xyz789.lambda-url.us-east-1.on.aws/';
        await invokeConverseFunctionUrl(REQUEST, USER);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('allows a loopback override', async () => {
        config.override = 'http://127.0.0.1:9000/';
        await invokeConverseFunctionUrl(REQUEST, USER);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
