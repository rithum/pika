import type { FetchZ } from '$client/app/shared-types';
import { UploadInstance } from './upload-instance.svelte';

export class UploadState {
    constructor(private readonly fetchz: FetchZ) {}

    async upload(instance: UploadInstance) {
        if (instance.status.status !== 'idle') {
            throw new Error('Upload already in progress or completed');
        }

        await instance.updateStatus({ status: 'uploading', progress: 0 });

        return new Promise<void>((resolve, reject) => {
            // For upload progress, we need to listen to xhr.upload.progress, not xhr.progress
            instance.xhr.upload.addEventListener('progress', async (evt: ProgressEvent) => {
                // Only update when progress changes by at least 1%
                const newProgress = Math.round((evt.loaded / evt.total) * 100);
                if (newProgress !== instance.status.progress) {
                    await instance.updateStatus({ status: 'uploading', progress: newProgress });
                }
            });

            instance.addXhrEventListener('error', async (evt: ProgressEvent<XMLHttpRequestEventTarget>) => {
                await instance.updateStatus({ status: 'error', progress: 0 });
                reject('Upload failed');
                await instance.cleanup();
            });

            instance.xhr.addEventListener('loadend', async (evt: ProgressEvent<XMLHttpRequestEventTarget>) => {
                const status = instance.xhr.status > 0 && instance.xhr.status < 400 ? 'completed' : 'error';
                await instance.updateStatus({ status, progress: status === 'completed' ? 100 : 0 });

                if (status === 'completed') {
                    resolve();
                } else {
                    reject(`Upload failed with HTTP error ${instance.xhr.status}`);
                }

                await instance.cleanup();
            });

            if (!instance.file) {
                throw new Error('File is not set when trying to upload');
            }

            // Create FormData with file and metadata
            const formData = new FormData();
            formData.append('file', instance.file);
            formData.append('s3Key', instance.s3Key);
            formData.append('fileMimeType', instance.type);
            formData.append('fileSize', instance.size.toString());

            // Upload to SvelteKit route instead of S3 directly
            instance.xhr.open('POST', '/api/message/file');
            instance.xhr.send(formData);
        });
    }
}
