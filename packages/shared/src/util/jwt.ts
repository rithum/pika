import type { RecordOrUndef, SimpleAuthenticatedUser } from '../types/chatbot/chatbot-types';
import * as jwt2 from 'jsonwebtoken';

// Added this because running locally did not import default correctly
let jwt = jwt2;
if ('default' in jwt) {
    jwt = jwt['default'] as any;
}

/**
 * Converts a payload containing a userId and optional customUserData into a JWT string.
 *
 * Here the generic T is the type of the customUserData field.  If not known, pass unknown.
 *
 * @param payload The payload to convert to a JWT string.
 * @returns A JWT string.
 */
export function convertToJwtString<T extends RecordOrUndef = undefined>(payload: SimpleAuthenticatedUser<T>, jwtSecret: string): string {
    return jwt.sign(payload, jwtSecret, { expiresIn: '1h' });
}

/**
 * Extracts the payload from a JWT string.  If successful, the first value in the tuple will be the SimpleAuthenticatedUser<T> object.
 * If not successful, the first value in the tuple will be the number of the HTTP status code and the second value will be the error message,
 * so check the first value to see if it is a number and if it is, then the second value will be the error message.
 *
 * Here the generic T is the type of the customUserData field.  If not known, pass unknown.
 * @param jwtToken - The JWT string to decode.
 * @returns An object containing the userId and optional customUserData or the number of the HTTP status code and the error message.
 */
export function extractFromJwtString<T extends RecordOrUndef = undefined>(jwtToken: string, jwtSecret: string): [SimpleAuthenticatedUser<T> | number, string | undefined] {
    try {
        const decoded = jwt.verify(jwtToken, jwtSecret);
        let userId: string;
        let customUserData: T | undefined;

        if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
            userId = (decoded as { userId: string }).userId;
            customUserData = (decoded as { customUserData: T }).customUserData ?? undefined;
            return [{ userId, customUserData }, undefined];
        }

        return [401, 'Unauthorized: Invalid or expired JWT token: code 1A'];
    } catch (error) {
        console.error('JWT verification failed:', error);
        return [401, `Unauthorized: Invalid or expired JWT token: code 1B`];
    }
}
