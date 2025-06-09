export interface PresignedUrlUploadRequest {
    /** The S3 key for the file to upload */
    s3Key: string;
    /** The mime type of the file to upload */
    fileMimeType: string;
    /** The size of the file to upload */
    fileSize: number;
}

export interface PresignedUrlUploadResponse {
    /** The presigned url for the file to upload */
    presignedUrl: string;
    /** The method to use for the upload */
    method: 'put';
    /** The headers to use for the upload */
    headers: {
        'Content-Type': string;
    };
}

export interface UploadStatus {
    status: 'idle' | 'uploading' | 'completed' | 'error';
    progress: number;
}

export interface UploadInfo {
    file: File;
    s3Key: string;
    fileName: string;
}