import { SimpleAuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
//import * as jwt from 'jsonwebtoken';
import * as jwt2 from 'jsonwebtoken';

// Added this because running locally did not import default correctly
let jwt = jwt2;
if ('default' in jwt) {
    jwt = jwt['default'] as any;
}

/**
 * Converts a payload containing a userId into a JWT string.
 * @param userId The user's ID to embed in the token.
 * @returns A JWT string.
 */
export function convertToJwtString(userId: string, jwtSecret: string): string {
    const payload = { userId };
    return jwt.sign(payload, jwtSecret, { expiresIn: '1h' });
}

/**
 * Extracts the payload from a JWT string.
 * @param jwtToken - The JWT string to decode.
 * @returns An object containing the userId and maybe authData.  Note authData is customizable and may or may not be present.
 */
export function extractFromJwtString<T>(jwtToken: string, jwtSecret: string): SimpleAuthenticatedUser<T> {
    try {
        const decoded = jwt.verify(jwtToken, jwtSecret);

        if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
            return decoded as SimpleAuthenticatedUser<T>;
        }

        throw new Error('Invalid token payload: "userId" or "authData" not found in payload object.');
    } catch (error) {
        console.error('JWT verification failed:', error);
        throw new Error(`Invalid or expired JWT token. Reason: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
}

/**
 *
 * If it worked, the first value in the tuple will be the {userId: string}.  If it didn't work, the first value will be the
 * http status code to return and the second value will be the error message.
 *
 * @param httpHeaders
 * @returns
 */
export function getUserFromAuthHeader<T>(authHeader: string | undefined, jwtSecret: string): [SimpleAuthenticatedUser<T> | number, string?] {
    if (!authHeader) {
        return [401, 'Authorization header not found in HTTP header'];
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return [401, 'Unauthorized: Missing or invalid token format.'];
    }
    const token = authHeader.substring(7); // "Bearer ".length is 7

    try {
        return [extractFromJwtString<T>(token, jwtSecret)];
    } catch (error) {
        return [401, 'Unauthorized: Invalid or expired token.'];
    }
}
