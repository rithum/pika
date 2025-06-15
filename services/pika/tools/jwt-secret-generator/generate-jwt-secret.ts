import crypto from 'crypto';

/**
 * Generates a cryptographically secure random secret for JWT signing.
 * @param lengthInBytes The desired length of the secret in bytes. A value of 64 is recommended.
 * @returns A hexadecimal string representation of the secret.
 */
function generateJwtSecret(lengthInBytes: number): string {
    return crypto.randomBytes(lengthInBytes).toString('hex');
}

// For HMAC-SHA256 (HS256) used in JWT, a strong, random secret is needed.
// 64 bytes (512 bits) provides a very high level of security.
const jwtSecret = generateJwtSecret(64);

console.log('Generated JWT Secret:');
console.log('----------------------------------------------------------------');
console.log(`JWT Secret (64 bytes, hex): ${jwtSecret}`);
console.log('----------------------------------------------------------------');
console.log('\nIMPORTANT:');
console.log('1. Store this secret securely in AWS SSM Parameter Store as a "SecureString".');
console.log('2. DO NOT hardcode this secret into your application source code.');
console.log('3. Your microservices should fetch this secret from SSM at runtime.');
console.log('4. This single secret is what both services will use to sign and verify the JWT tokens.');
