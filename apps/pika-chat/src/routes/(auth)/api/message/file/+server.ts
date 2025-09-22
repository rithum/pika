import { appConfig } from '$lib/server/config';
import { handleApiGatewayError, isUserContentAdmin } from '$lib/server/utils';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { error, json, type RequestHandler } from '@sveltejs/kit';

let s3Client: S3Client | undefined;

export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user.viewingContentFor && Object.keys(locals.user.viewingContentFor).length > 0) {
        if (!isUserContentAdmin(locals.user)) {
            throw error(403, 'Forbidden');
        }
        throw error(403, 'You have selected view content for another user and you are not allowed to take action as that user.');
    }

    try {
        // Parse the form data containing file and metadata
        const formData = await request.formData();

        const file = formData.get('file') as File;
        const s3Key = formData.get('s3Key') as string;
        const fileMimeType = formData.get('fileMimeType') as string;
        const fileSize = formData.get('fileSize') as string;

        // Validate required fields
        if (!file) {
            throw error(400, 'file is required');
        }

        if (!s3Key) {
            throw error(400, 's3Key is required');
        }

        if (!fileMimeType) {
            throw error(400, 'fileMimeType is required');
        }

        if (!fileSize) {
            throw error(400, 'fileSize is required');
        }

        // Initialize S3 client if not already done
        if (!s3Client) {
            s3Client = new S3Client({ region: appConfig.awsRegion });
        }

        // Convert file to buffer for S3 upload
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        const putCommand = new PutObjectCommand({
            Bucket: appConfig.pikaS3Bucket,
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
            bucket: appConfig.pikaS3Bucket
        });

        handleApiGatewayError(e, 'uploading file');
    }
};
