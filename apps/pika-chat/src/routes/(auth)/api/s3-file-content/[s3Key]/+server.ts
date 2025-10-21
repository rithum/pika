import { appConfig } from '$lib/server/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { error, type RequestHandler } from '@sveltejs/kit';

let s3Client: S3Client | undefined;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

/**
 * API endpoint to retrieve text content from S3 files in the Pika S3 bucket.
 * This is used by web components via chatAppState.getS3TextFileContent().
 *
 * Security: Only accesses files in the configured Pika S3 bucket.
 * Authentication: Requires authenticated user.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
    // Ensure user is authenticated
    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    const { s3Key } = params;
    if (!s3Key) {
        throw error(400, 's3Key is required');
    }

    // URL decode the s3Key
    const decodedS3Key = decodeURIComponent(s3Key);

    if (!s3Client) {
        s3Client = new S3Client({ region: appConfig.awsRegion });
    }

    try {
        const getObjectCommand = new GetObjectCommand({
            Bucket: appConfig.pikaS3Bucket,
            Key: decodedS3Key
        });

        const response = await s3Client.send(getObjectCommand);

        if (!response.Body) {
            throw error(404, 'File not found');
        }

        // Check content length if available
        if (response.ContentLength && response.ContentLength > MAX_FILE_SIZE) {
            throw error(413, 'File too large to read as text');
        }

        // Stream the body with size limit
        const chunks: Uint8Array[] = [];
        let totalSize = 0;

        // Cast to async iterable since AWS SDK types don't expose this properly
        const stream = response.Body as AsyncIterable<Uint8Array>;

        for await (const chunk of stream) {
            totalSize += chunk.length;
            if (totalSize > MAX_FILE_SIZE) {
                throw error(413, 'File too large to read as text');
            }
            chunks.push(chunk);
        }

        const bodyContents = Buffer.concat(chunks).toString('utf-8');

        const headers = new Headers();
        headers.set('Content-Type', 'text/plain; charset=utf-8');

        // Ensure we're not caching this response
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        headers.set('Pragma', 'no-cache');
        headers.set('Expires', '0');

        return new Response(bodyContents, {
            status: 200,
            headers
        });
    } catch (err) {
        console.error('Error retrieving file from S3', err);
        if (err && typeof err === 'object' && 'name' in err) {
            if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
                throw error(404, 'File not found');
            }
            if (err.name === 'AccessDenied') {
                throw error(403, 'Access denied');
            }
        }

        throw error(500, 'Failed to retrieve file content');
    }
};
