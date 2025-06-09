import crypto from 'crypto';

/**
 * Generates a cryptographically secure random key.
 * @param lengthInBytes The desired length of the key in bytes.
 * @returns A hexadecimal string representation of the key.
 */
function generateSecureKey(lengthInBytes: number): string {
    return crypto.randomBytes(lengthInBytes).toString('hex');
}

// For AES-256, the key needs to be 32 bytes (256 bits).
const masterKey = generateSecureKey(32);

// For AES modes like CBC or GCM, an Initialization Vector (IV) is also needed.
// For CBC with a static master key, you'd use a static IV (16 bytes for AES).
// For GCM, the IV should ideally be unique per encryption, but if you are starting
// with a simpler setup and a single master key for all cookies, you might also
// store a primary IV. However, be aware of IV reuse implications with GCM.
// For CBC mode, a 16-byte (128-bit) IV is common for AES.
const initializationVector = generateSecureKey(16);

console.log('Generated Keys:');
console.log('----------------------------------------------------------------');
console.log(`AES-256 Master Key (32 bytes, hex): ${masterKey}`);
console.log(`Initialization Vector (IV) (16 bytes, hex): ${initializationVector}`);
console.log('----------------------------------------------------------------');
console.log('\nIMPORTANT:');
console.log('1. Store these keys securely (e.g., AWS SSM Parameter Store, HashiCorp Vault).');
console.log('2. DO NOT hardcode these keys into your application source code.');
console.log('3. Ensure your application loads these keys from environment variables or a secure config service at runtime.');
console.log('4. The IV should also be stored securely. For AES-GCM, IVs should generally be unique per encryption and not reused with the same key. If using AES-CBC with this static IV, ensure you understand the security implications if the key is not rotated frequently.');