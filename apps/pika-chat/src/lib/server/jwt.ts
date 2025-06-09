import jsonwebtoken from 'jsonwebtoken';
const { sign, verify } = jsonwebtoken;
import { appConfig } from './config';
import type { UserAuthData } from '$lib/shared-types';
import type { SimpleAuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';

/**
 * Converts a payload containing a userId into a JWT string.
 * @param userId The user's ID to embed in the token.
 * @returns A JWT string.
 */
export function convertToJwtString<T>(payload: SimpleAuthenticatedUser<T>): string {
    return sign(payload, appConfig.jwtSecret, { expiresIn: '1h' });
}

/**
 * Extracts the payload from a JWT string.
 * @param jwtToken - The JWT string to decode.
 * @returns An object containing the userId.
 */
export function extractFromJwtString(jwtToken: string): { userId: string } {
    try {
        const decoded = verify(jwtToken, appConfig.jwtSecret);

        if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
            return { userId: (decoded as { userId: string }).userId };
        }

        throw new Error('Invalid token payload: "userId" not found.');
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
export function getUserIdFromAuthHeader(authHeader: string | undefined): [{ userId: string } | number, string?] {
    if (!authHeader) {
        return [401, 'Authorization header not found in HTTP header'];
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return [401, 'Unauthorized: Missing or invalid token format.'];
    }
    const token = authHeader.substring(7); // "Bearer ".length is 7

    try {
        return [extractFromJwtString(token)];
    } catch (error) {
        return [401, 'Unauthorized: Invalid or expired token.'];
    }
}
