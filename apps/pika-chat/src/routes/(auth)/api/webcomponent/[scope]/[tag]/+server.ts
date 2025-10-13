import { searchTagDefinitions } from '$lib/server/chat-apis';
import { appConfig } from '$lib/server/config';
import { getS3Object } from '$lib/server/s3';
import { NoSuchKey, NotFound, S3Client } from '@aws-sdk/client-s3';
import { error, isHttpError, type RequestHandler } from '@sveltejs/kit';
import { createHash } from 'crypto';
import { gunzipSync } from 'zlib';

/**
 * GET /api/webcomponent/:scope/:tag
 *
 * Serves web component JavaScript files from S3 with integrity verification.
 *
 * Security approach:
 * 1. Fetches tag definition from database
 * 2. Validates tag is enabled and has S3 configuration
 * 3. Fetches gzipped file from S3
 * 4. Calculates SHA256 hash of gzipped bytes
 * 5. Compares to stored hash to ensure file integrity
 * 6. Only serves file if hash matches (prevents tampering)
 * 7. Decompresses and returns JavaScript
 */
export const GET: RequestHandler = async ({ params, locals }) => {
    // Ensure user is authenticated
    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    const { scope, tag } = params;
    if (!scope || !tag) {
        throw error(400, 'scope and tag are required');
    }

    try {
        const tagDefResponse = await searchTagDefinitions(locals.user.userId, {
            tagsDesired: [{ scope, tag }],
            includeInstructions: false
        });

        if (!tagDefResponse.tagDefinitions || tagDefResponse.tagDefinitions.length === 0) {
            throw error(404, 'Web component not found');
        }

        const tagDef = tagDefResponse.tagDefinitions[0];

        if (tagDef.status !== 'enabled') {
            throw error(404, 'Web component not found or disabled');
        }

        if (tagDef.widget.type !== 'web-component') {
            throw error(400, 'Tag is not a web component');
        }

        const webComponent = tagDef.widget.webComponent;

        if (!webComponent.s3) {
            throw error(400, 'Web component does not have S3 configuration');
        }

        if (!webComponent.s3.s3Key) {
            throw error(400, 'Web component does not have S3 key');
        }

        if (!webComponent.s3.s3Bucket) {
            throw error(400, 'Web component does not have S3 bucket');
        }

        if (webComponent.s3.s3Bucket !== appConfig.pikaS3Bucket) {
            throw error(400, 'Invalid s3 bucket specified on tag definition');
        }

        const chunks = await getS3Object(webComponent.s3.s3Key);
        const gzippedBytes = Buffer.concat(chunks);

        // Validate file integrity using SHA256 hash
        const calculatedHash = createHash('sha256').update(gzippedBytes).digest('base64');

        // Compare to stored hash
        if (calculatedHash !== webComponent.encodedSha256Base64) {
            console.error('Hash mismatch for web component', {
                scope,
                tag,
                expected: webComponent.encodedSha256Base64,
                calculated: calculatedHash,
                s3Bucket: webComponent.s3.s3Bucket,
                s3Key: webComponent.s3.s3Key
            });
            throw error(400, 'Web component file integrity check failed');
        }

        let jsContent: string;
        try {
            const decompressed = gunzipSync(gzippedBytes);
            jsContent = decompressed.toString('utf-8');
        } catch (err) {
            console.error('Failed to decompress web component', { scope, tag, err });
            throw error(500, 'Failed to decompress web component');
        }

        return new Response(jsContent, {
            headers: {
                'Content-Type': 'application/javascript',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                Pragma: 'no-cache',
                Expires: '0',
                'X-Content-Type-Options': 'nosniff'
            }
        });
    } catch (e) {
        // If it's already a SvelteKit error, re-throw it
        if (isHttpError(e)) {
            throw e;
        }
        if (e && typeof e === 'object' && 'status' in e) {
            throw e;
        }

        console.error('Error serving web component', { scope, tag, err: e instanceof Error ? e.message : String(e) });

        // Handle S3-specific errors
        if (e instanceof NoSuchKey || e instanceof NotFound) {
            throw error(404, 'Web component file not found in S3');
        }

        throw error(500, 'Failed to serve web component');
    }
};
