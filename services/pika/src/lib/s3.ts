import { CopyObjectCommand, DeleteObjectCommand, GetObjectTaggingCommand, GetObjectTaggingCommandOutput, PutObjectCommand, PutObjectTaggingCommand, S3, S3Client, Tag } from '@aws-sdk/client-s3';
import { getRegion } from './utils';

let s3: S3Client | undefined;

function getS3Client() {
    if (!s3) {
        s3 = new S3({
            region: getRegion()
        });
    }
    return s3;
}

export async function deleteS3Object(bucket: string, key: string) {
    const s3 = getS3Client();
    const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
    });
    await s3.send(command);
}

export async function getS3ObjectTagging(bucket: string, key: string): Promise<Tag[] | undefined> {
    const s3 = getS3Client();
    const command = new GetObjectTaggingCommand({
        Bucket: bucket,
        Key: key
    });
    const response: GetObjectTaggingCommandOutput = await s3.send(command);
    return response.TagSet;
}

export async function updateS3ObjectTagging(bucket: string, key: string, tags: Tag[]) {
    const s3 = getS3Client();
    const command = new PutObjectTaggingCommand({
        Bucket: bucket,
        Key: key,
        Tagging: { TagSet: tags }
    });
    await s3.send(command);
}

export async function copyS3Object(sourceBucket: string, sourceKey: string, destinationBucket: string, destinationKey: string) {
    const s3 = getS3Client();
    const command = new CopyObjectCommand({
        CopySource: `${sourceBucket}/${sourceKey}`,
        Bucket: destinationBucket,
        Key: destinationKey
    });
    await s3.send(command);
}

export async function putS3Object(bucket: string, key: string, body: string | Buffer, contentType?: string) {
    const s3 = getS3Client();
    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType || 'application/json'
    });
    await s3.send(command);
}