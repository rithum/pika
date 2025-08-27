import { gunzipSync, gzipSync } from 'zlib';

/**
 * Compresses a string and encodes it as base64
 */
export function gzipAndBase64EncodeString(string: string): string {
    const gzippedHexEncodedString = gzipSync(string).toString('hex');
    const gzippedBase64EncodedString = Buffer.from(gzippedHexEncodedString, 'hex').toString('base64');
    return gzippedBase64EncodedString;
}

/**
 * Decompresses a base64 encoded gzipped string
 */
export function gunzipBase64EncodedString(base64EncodedString: string): string {
    const gzippedHexEncodedString = Buffer.from(base64EncodedString, 'base64').toString('hex');
    const gzippedHexDecodedString = gunzipSync(Buffer.from(gzippedHexEncodedString, 'hex')).toString();
    return gzippedHexDecodedString;
}

/**
 * Generates a CloudFormation-safe resource name
 */
export function generateResourceName(baseName: string, suffix: string): string {
    // CloudFormation resource names must be alphanumeric
    const cleanBaseName = baseName.replace(/[^a-zA-Z0-9]/g, '');
    const cleanSuffix = suffix.replace(/[^a-zA-Z0-9]/g, '');
    return `${cleanBaseName}${cleanSuffix}`;
}
