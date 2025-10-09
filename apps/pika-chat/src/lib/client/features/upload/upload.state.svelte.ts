import type { FetchZ } from '$client/app/types';
import { ClientOperationError, handleClientError } from '$lib/client/util';
import type { ShowToastFn } from 'pika-shared/types/chatbot/chatbot-types';
import { UploadInstance } from './upload-instance.svelte';

export class UploadState {
    #showToast: ShowToastFn;

    get showToast() {
        return this.#showToast;
    }

    /**
     * Shows user-friendly error message based on HTTP status code for file uploads.
     * Follows the same pattern as checkClientResponse but adapted for XMLHttpRequest.
     */
    #showHttpStatusError(statusCode: number, operation: string) {
        let message: string;

        switch (statusCode) {
            case 400:
                message = 'Invalid file or request. Please check your file and try again.';
                break;
            case 401:
                message = 'You are not authorized to upload files. Please sign in again.';
                break;
            case 403:
                message = 'You do not have permission to upload files.';
                break;
            case 404:
                message = 'Upload endpoint not found. Please try again later.';
                break;
            case 413:
                message = 'File is too large. Please choose a smaller file.';
                break;
            case 415:
                message = 'File type not supported. Please choose a different file.';
                break;
            default:
                message = statusCode >= 500 ? 'Server error occurred while uploading file. Please try again later.' : 'Upload failed. Please try again.';
        }

        this.#showToast(message, { type: 'error' });
    }

    constructor(
        private readonly fetchz: FetchZ,
        showToast: ShowToastFn
    ) {
        this.#showToast = showToast;
    }

    async upload(instance: UploadInstance) {
        try {
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

                    // Show user-friendly error message for network/connection errors
                    this.#showToast('Network error occurred while uploading file. Please check your connection and try again.', { type: 'error' });
                    reject(new ClientOperationError('Upload failed due to network error'));
                    await instance.cleanup();
                });

                instance.xhr.addEventListener('loadend', async (evt: ProgressEvent<XMLHttpRequestEventTarget>) => {
                    const status = instance.xhr.status > 0 && instance.xhr.status < 400 ? 'completed' : 'error';
                    await instance.updateStatus({ status, progress: status === 'completed' ? 100 : 0 });

                    if (status === 'completed') {
                        resolve();
                    } else {
                        // Show user-friendly error message based on HTTP status code
                        this.#showHttpStatusError(instance.xhr.status, 'uploading file');
                        reject(new ClientOperationError(`Upload failed with HTTP error ${instance.xhr.status}`));
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
        } catch (error) {
            // Handle unexpected errors (network errors and status errors are already handled above)
            handleClientError(error, 'uploading file', this.#showToast);
            throw error;
        }
    }
}
