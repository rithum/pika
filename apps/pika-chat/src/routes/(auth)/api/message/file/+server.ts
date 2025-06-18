import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getErrorResponse } from '$lib/server/utils';
import { appConfig } from '$lib/server/config';
import { json, type RequestHandler } from '@sveltejs/kit';

let s3Client: S3Client | undefined;

export const POST: RequestHandler = async ({ request }) => {
    try {
        // Parse the form data containing file and metadata
        const formData = await request.formData();

        const file = formData.get('file') as File;
        const s3Key = formData.get('s3Key') as string;
        const fileMimeType = formData.get('fileMimeType') as string;
        const fileSize = formData.get('fileSize') as string;

        // Validate required fields
        if (!file) {
            return new Response('file is required', { status: 400 });
        }

        if (!s3Key) {
            return new Response('s3Key is required', { status: 400 });
        }

        if (!fileMimeType) {
            return new Response('fileMimeType is required', { status: 400 });
        }

        if (!fileSize) {
            return new Response('fileSize is required', { status: 400 });
        }

        // Initialize S3 client if not already done
        if (!s3Client) {
            s3Client = new S3Client({ region: appConfig.awsRegion });
        }

        // Convert file to buffer for S3 upload
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        const putCommand = new PutObjectCommand({
            Bucket: appConfig.uploadS3Bucket,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: fileMimeType,
            ContentLength: parseInt(fileSize),
            // We will detect when the chat message is written to the database and then set the confirmed tag to true
            Tagging: 'chat=true&confirmed=false'
        });

        await s3Client.send(putCommand);

        // Return success response
        return json({ success: true });
    } catch (e) {
        console.error('Upload error:', e);
        console.error('Error details:', {
            message: e instanceof Error ? e.message : 'Unknown error',
            name: e instanceof Error ? e.name : 'Unknown',
            region: appConfig.awsRegion,
            bucket: appConfig.uploadS3Bucket
        });

        return getErrorResponse(500, `Failed to upload file: ${e instanceof Error ? e.message + ' ' + e.stack : e}`);
    }
};
