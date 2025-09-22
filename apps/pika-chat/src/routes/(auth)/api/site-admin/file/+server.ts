import { appConfig } from '$lib/server/config';
import { handleApiGatewayError, isUserSiteAdmin } from '$lib/server/utils';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { error, json, redirect, type RequestHandler } from '@sveltejs/kit';
import { fileTypeFromBuffer } from 'file-type';
import { v7 as uuidv7 } from 'uuid';

let s3Client: S3Client | undefined;

function getOrCreateS3Client(): S3Client {
    if (!s3Client) {
        s3Client = new S3Client({ region: appConfig.awsRegion });
    }
    return s3Client;
}

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }
    if (!isUserSiteAdmin(user)) {
        throw error(403, 'You do not have permission to perform this action');
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            throw error(400, 'file is required');
        }

        const originalName = (file as any).name || 'upload';
        const clientProvidedMime = file.type || '';
        const buffer = Buffer.from(await file.arrayBuffer());
        const size = buffer.byteLength;

        // Try binary signature detection first
        const detected = await fileTypeFromBuffer(buffer); // undefined for many text formats

        // Helper: heuristics for common text types when no binary signature
        function guessTextType(buf: Buffer): { mime: string; ext?: string } | undefined {
            const sample = buf.slice(0, 4096).toString('utf8');
            const hasNull = sample.includes('\u0000');
            // crude binary check: if null bytes present, treat as octet-stream
            if (hasNull) return undefined;

            const trimmed = sample.trimStart();
            if (/^<svg[\s>]/i.test(trimmed)) return { mime: 'image/svg+xml', ext: 'svg' };
            if (/^(<!DOCTYPE\s+html|<html[\s>])/i.test(trimmed)) return { mime: 'text/html', ext: 'html' };
            if (/^[\[{]/.test(trimmed)) return { mime: 'application/json', ext: 'json' };
            // simple CSV heuristic: commas in first line and at least 2 lines
            const lines = sample.split(/\r?\n/).filter((l) => l.length > 0);
            if (lines.length >= 2 && lines[0].includes(',') && lines[1].includes(',')) return { mime: 'text/csv', ext: 'csv' };
            return { mime: 'text/plain', ext: 'txt' };
        }

        // Extension from original name, if any
        const lastDot = originalName.lastIndexOf('.');
        const nameExt = lastDot > -1 ? originalName.substring(lastDot + 1) : '';

        const mimeType = detected?.mime || clientProvidedMime || guessTextType(buffer)?.mime || 'application/octet-stream';
        const chosenExt = detected?.ext || nameExt || guessTextType(buffer)?.ext || '';

        const id = uuidv7();
        const key = `feedback_attachments/${id}${chosenExt ? `.${chosenExt}` : ''}`;

        const client = getOrCreateS3Client();
        await client.send(
            new PutObjectCommand({
                Bucket: appConfig.pikaS3Bucket,
                Key: key,
                Body: buffer,
                ContentType: mimeType,
                ContentLength: size,
                Tagging: 'feedback=true&confirmed=false'
            })
        );

        const attachment = {
            s3Url: `s3://${appConfig.pikaS3Bucket}/${key}`,
            name: originalName,
            mimeType
        };

        return json({ success: true, attachment });
    } catch (e) {
        handleApiGatewayError(e, 'uploading site admin file');
    }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    const user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }
    if (!isUserSiteAdmin(user)) {
        throw error(403, 'You do not have permission to perform this action');
    }

    const s3Key = url.searchParams.get('s3Key');
    if (!s3Key) {
        throw error(400, 's3Key is required');
    }

    try {
        const client = getOrCreateS3Client();
        await client.send(
            new DeleteObjectCommand({
                Bucket: appConfig.pikaS3Bucket,
                Key: s3Key
            })
        );
        return json({ success: true });
    } catch (e) {
        handleApiGatewayError(e, 'deleting site admin file');
    }
};
