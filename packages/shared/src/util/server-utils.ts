import { gunzipSync, gzipSync } from 'zlib';

export function gunzipBase64EncodedString(base64EncodedString: string): string {
    const gzippedHexEncodedString = Buffer.from(base64EncodedString, 'base64').toString('hex');
    const gzippedHexDecodedString = gunzipSync(Buffer.from(gzippedHexEncodedString, 'hex')).toString();
    return gzippedHexDecodedString;
}

export function gzipAndBase64EncodeString(string: string): string {
    const gzippedHexEncodedString = gzipSync(string).toString('hex');
    const gzippedBase64EncodedString = Buffer.from(gzippedHexEncodedString, 'hex').toString('base64');
    return gzippedBase64EncodedString;
}