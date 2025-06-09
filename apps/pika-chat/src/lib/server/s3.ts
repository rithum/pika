import type { PresignedUrlUploadRequest, PresignedUrlUploadResponse } from '@pika/shared/types/upload-types';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { appConfig } from './config';

const THIRTY_MINUTES_SECONDS = 30 * 60; // 1800 seconds
let s3Client: S3Client | undefined;

/**
 * Create a one time use s3 upload url.
 */
export async function getPresignedUploadResponse(
    request: PresignedUrlUploadRequest
): Promise<PresignedUrlUploadResponse> {
    const { s3Key, fileMimeType, fileSize } = request;

    if (!s3Client) {
        s3Client = new S3Client({ region: appConfig.awsRegion });
    }

    const url = await getSignedUrl(
        s3Client,
        new PutObjectCommand({
            Bucket: appConfig.uploadS3Bucket,
            Key: s3Key,
            ContentLength: fileSize,
            // We will detect when the chat message is written to the database and then set the confirmed tag to true
            Tagging: 'chat=true&confirmed=false',
        }),
        { expiresIn: THIRTY_MINUTES_SECONDS }
    );

    return {
        presignedUrl: url,
        method: 'put',
        headers: {
            'Content-Type': fileMimeType,
        },
    };
}
