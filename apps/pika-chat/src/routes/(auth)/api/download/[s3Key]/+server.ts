import { appConfig } from '$lib/server/config';
import { isUserContentAdmin } from '$lib/server/utils';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { error, type RequestHandler } from '@sveltejs/kit';

let s3Client: S3Client | undefined;

export const GET: RequestHandler = async ({ params, locals }) => {
    // Ensure user is authenticated
    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    const { s3Key } = params;
    if (!s3Key) {
        return new Response('s3Key is required', { status: 400 });
    }

    // URL decode the s3Key
    const decodedS3Key = decodeURIComponent(s3Key);

    if (!s3Client) {
        s3Client = new S3Client({ region: appConfig.awsRegion });
    }

    try {
        const getObjectCommand = new GetObjectCommand({
            Bucket: appConfig.uploadS3Bucket,
            Key: decodedS3Key,
        });

        const response = await s3Client.send(getObjectCommand);

        if (!response.Body) {
            throw error(404, 'File not found');
        }

        // Get the file content as a stream
        const stream = response.Body as ReadableStream;

        const headers = new Headers();

        if (response.ContentType) {
            headers.set('Content-Type', response.ContentType);
        }

        if (response.ContentLength) {
            headers.set('Content-Length', response.ContentLength.toString());
        }

        // Extract the filename from the S3Key for the Content-Disposition header
        const filename = decodedS3Key.split('/').pop() || 'download';
        headers.set('Content-Disposition', `attachment; filename="${filename}"`);

        // Ensure we're not caching this response
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        headers.set('Pragma', 'no-cache');
        headers.set('Expires', '0');

        return new Response(stream, {
            status: 200,
            headers,
        });
    } catch (err) {
        console.error('Error downloading file from S3', err);
        if (err && typeof err === 'object' && 'name' in err) {
            if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
                return error(404, 'File not found');
            }
            if (err.name === 'AccessDenied') {
                return error(403, 'Access denied');
            }
        }

        throw error(500, 'Failed to download file');
    }
};
