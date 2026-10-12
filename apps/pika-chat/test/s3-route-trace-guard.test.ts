import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const sendMock = jest.fn<(command: unknown) => Promise<unknown>>();

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: class {
        send(command: unknown) {
            return sendMock(command);
        }
    },
    GetObjectCommand: class {
        constructor(public input: unknown) {}
    },
    PutObjectCommand: class {
        constructor(public input: unknown) {}
    }
}));
jest.mock('$lib/server/config', () => ({
    appConfig: { pikaS3Bucket: 'bucket', awsRegion: 'us-east-1', chatApiId: 'api', stage: 'test', jwtSecret: 'secret' }
}));
jest.mock('pika-shared/util/server-utils', () => ({
    getOverridableFeatures: () => ({ traces: { enabled: true }, entity: { enabled: false } }),
    getEntityIdForUser: () => undefined
}));

import { GET as downloadGet } from '../src/routes/(auth)/api/download/[s3Key]/+server';
import { GET as contentGet } from '../src/routes/(auth)/api/s3-file-content/[s3Key]/+server';
import { POST as filePost } from '../src/routes/(auth)/api/message/file/+server';

const locals = { user: { userId: 'u1' } };

function getEvent(s3Key: string) {
    return { params: { s3Key: encodeURIComponent(s3Key) }, locals } as never;
}

function postEvent(s3Key: string) {
    const formData = new FormData();
    formData.set('file', new File(['x'], 'x.txt', { type: 'text/plain' }));
    formData.set('s3Key', s3Key);
    formData.set('fileMimeType', 'text/plain');
    formData.set('fileSize', '1');
    return { request: new Request('https://example.com/api/message/file', { method: 'POST', body: formData }), locals } as never;
}

const routes: [string, (key: string) => Promise<unknown>][] = [
    ['download GET', (key) => downloadGet(getEvent(key)) as Promise<unknown>],
    ['s3-file-content GET', (key) => contentGet(getEvent(key)) as Promise<unknown>],
    ['message/file POST', (key) => filePost(postEvent(key)) as Promise<unknown>]
];

describe.each(routes)('%s trace key guard', (_name, call) => {
    beforeEach(() => {
        sendMock.mockReset();
        sendMock.mockImplementation(async () => ({
            Body: new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('x'));
                    controller.close();
                }
            }),
            ContentType: 'text/plain'
        }));
    });

    it('rejects a traces/ key with 403 without calling S3', async () => {
        await expect(call('traces/u1/s1/m1.json.gz')).rejects.toMatchObject({ status: 403 });
        await expect(call('/traces/x')).rejects.toMatchObject({ status: 403 });
        expect(sendMock).not.toHaveBeenCalled();
    });

    it('lets an uploads/ key reach S3', async () => {
        await call('uploads/x.txt');
        expect(sendMock).toHaveBeenCalledTimes(1);
    });
});
