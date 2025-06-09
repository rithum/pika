import type { UploadInfo, UploadStatus } from '@pika/shared/types/upload-types';

export class UploadInstance {
    #status = $state<UploadStatus>({ status: 'idle', progress: 0 });
    #xhrEventListeners = $state<Map<string, XhrEventListener>>(new Map());
    #xhr = new XMLHttpRequest();

    s3Key = $state<string>() as string;
    // we only keep the file around for the duration of the upload, then we remove it
    file = $state<File | undefined>() as File | undefined;
    fileName = $state<string>() as string;
    size = $state<number>() as number;
    lastModified = $state<number>() as number;
    type = $state<string>() as string;

    get status() {
        return this.#status;
    }

    get xhr() {
        return this.#xhr;
    }

    constructor(info: UploadInfo) {
        this.s3Key = info.s3Key;
        this.file = info.file;
        this.fileName = info.fileName;
        this.size = info.file.size;
        this.lastModified = info.file.lastModified;
        this.type = this.file.type;
    }

    async updateStatus(status: UploadStatus) {
        this.#status = { ...this.#status, ...status };
    }

    addXhrEventListener(event: string, handler: XhrEventListener): XhrEventListener {
        this.#xhr.addEventListener(event, handler as unknown as EventListener);
        this.#xhrEventListeners.set(event, handler);
        return handler;
    }

    async cleanup() {
        // Clean up all tracked listeners
        this.#xhrEventListeners.forEach((handler, event) => {
            this.#xhr.removeEventListener(event, handler as unknown as EventListener);
        });
        this.#xhrEventListeners.clear();
    }
}

export type XhrEventListener = (this: XMLHttpRequest, evt: ProgressEvent<XMLHttpRequestEventTarget>) => void;
