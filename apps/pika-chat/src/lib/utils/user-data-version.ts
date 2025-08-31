import type { ChatUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Fields that should trigger a reactive update when they change
 */
const REACTIVE_USER_FIELDS = ['userId', 'firstName', 'lastName', 'userType', 'roles', 'viewingContentFor', 'customData', 'overrideData'] as const;

/**
 * Creates a version hash of user data to detect when important fields change.
 * This hash will change whenever any of the reactive fields change, triggering
 * client-side updates.
 */
export function createUserDataVersion(user: ChatUser<RecordOrUndef>): string {
    const reactiveData: Record<string, any> = {};

    for (const field of REACTIVE_USER_FIELDS) {
        if (field in user) {
            reactiveData[field] = user[field as keyof ChatUser<RecordOrUndef>];
        }
    }

    // Create a stable string representation
    const dataString = JSON.stringify(reactiveData, Object.keys(reactiveData).sort());

    // Simple hash function (could use crypto.subtle for better hashing if needed)
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
        const char = dataString.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    return hash.toString(36) + '-' + Date.now().toString(36);
}

/**
 * Checks if two user data versions are different
 */
export function hasUserDataChanged(oldVersion: string | undefined, newVersion: string): boolean {
    if (!oldVersion) return true;

    // Extract the hash part (before the timestamp)
    const oldHash = oldVersion.split('-')[0];
    const newHash = newVersion.split('-')[0];

    return oldHash !== newHash;
}
