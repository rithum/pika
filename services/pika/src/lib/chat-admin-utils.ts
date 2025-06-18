import type { AgentDefinition, ToolDefinition } from '@pika/shared/types/chatbot/chatbot-types';
import cloneDeep from 'lodash.clonedeep';
import { areSame } from './same';

/**
 * Utility function to handle optional field updates with null removal support.
 * This pattern is repeated across agent and tool update functions.
 *
 * @param newValue The new value from the request (can be undefined, null, or a value)
 * @param existingValue The current value in the database
 * @param fieldName The name of the field being updated
 * @param fieldsToUpdate Object to add update values to
 * @param fieldsToRemove Array to add fields that should be removed
 * @param useJsonComparison Whether to use JSON.stringify for comparison (for complex objects)
 */
export function handleOptionalFieldUpdate<T, K extends keyof T>(
    newValue: T[K] | null | undefined,
    existingValue: T[K] | undefined,
    fieldName: K,
    fieldsToUpdate: Partial<T>,
    fieldsToRemove: K[],
    useJsonComparison: boolean = false
): void {
    if (newValue !== undefined) {
        if (newValue === null) {
            // Explicitly removing the field
            if (existingValue !== undefined) {
                fieldsToRemove.push(fieldName);
            }
        } else {
            // Check if the value has changed
            const valuesAreDifferent = useJsonComparison ? JSON.stringify(newValue) !== JSON.stringify(existingValue) : newValue !== existingValue;

            if (valuesAreDifferent) {
                fieldsToUpdate[fieldName] = newValue;
            }
        }
    }
}

/**
 * Utility function to handle required field updates.
 * For required fields, we only update if the value is different (no removal).
 *
 * @param newValue The new value from the request
 * @param existingValue The current value in the database
 * @param fieldName The name of the field being updated
 * @param fieldsToUpdate Object to add update values to
 * @param useJsonComparison Whether to use JSON.stringify for comparison (for complex objects)
 */
export function handleRequiredFieldUpdate<T, K extends keyof T>(
    newValue: T[K] | undefined,
    existingValue: T[K],
    fieldName: K,
    fieldsToUpdate: Partial<T>,
    useJsonComparison: boolean = false
): void {
    if (newValue !== undefined) {
        const valuesAreDifferent = useJsonComparison ? JSON.stringify(newValue) !== JSON.stringify(existingValue) : newValue !== existingValue;

        if (valuesAreDifferent) {
            fieldsToUpdate[fieldName] = newValue;
        }
    }
}

/**
 * Utility function to handle array field updates with proper comparison.
 * Arrays are compared by length and element-wise equality.
 *
 * @param newArray The new array from the request
 * @param existingArray The current array in the database
 * @param fieldName The name of the field being updated
 * @param fieldsToUpdate Object to add update values to
 * @param fieldsToRemove Array to add fields that should be removed (if newArray is null)
 * @param isOptional Whether this is an optional field that can be removed
 */
export function handleArrayFieldUpdate<T, K extends keyof T>(
    newArray: T[K] | null | undefined,
    existingArray: T[K] | undefined,
    fieldName: K,
    fieldsToUpdate: Partial<T>,
    fieldsToRemove: K[],
    isOptional: boolean = false
): void {
    if (newArray !== undefined) {
        if (newArray === null) {
            // Explicitly removing the field (only if optional)
            if (isOptional && existingArray !== undefined) {
                fieldsToRemove.push(fieldName);
            } else if (!isOptional) {
                // For required fields, null should be treated as an empty array
                fieldsToUpdate[fieldName] = [] as T[K];
            }
        } else if (Array.isArray(newArray)) {
            // newArray is a valid array
            if (Array.isArray(existingArray)) {
                // Both are arrays - compare them properly
                const arraysAreDifferent =
                    newArray.length !== existingArray.length || !newArray.every((item) => existingArray.includes(item)) || !existingArray.every((item) => newArray.includes(item));

                if (arraysAreDifferent) {
                    fieldsToUpdate[fieldName] = newArray as T[K];
                }
            } else {
                // existingArray is not an array (undefined, null, or other type)
                // Update with the new array
                fieldsToUpdate[fieldName] = newArray as T[K];
            }
        } else {
            // newArray is not null but also not an array - this is likely an error
            // but we'll update it anyway to maintain consistency
            if (newArray !== existingArray) {
                fieldsToUpdate[fieldName] = newArray as T[K];
            }
        }
    }
}

/**
 * Utility function to handle object field updates with proper deep comparison.
 * Objects are compared using JSON.stringify after sorting keys.
 *
 * @param newObject The new object from the request
 * @param existingObject The current object in the database
 * @param fieldName The name of the field being updated
 * @param fieldsToUpdate Object to add update values to
 * @param fieldsToRemove Array to add fields that should be removed (if newObject is null)
 * @param isOptional Whether this is an optional field that can be removed
 */
export function handleObjectFieldUpdate<T, K extends keyof T>(
    newObject: T[K] | null | undefined,
    existingObject: T[K] | undefined,
    fieldName: K,
    fieldsToUpdate: Partial<T>,
    fieldsToRemove: K[],
    isOptional: boolean = false
): void {
    if (newObject !== undefined) {
        if (newObject === null && isOptional) {
            // Explicitly removing the field
            if (existingObject !== undefined) {
                fieldsToRemove.push(fieldName);
            }
        } else {
            // Deep comparison using JSON.stringify
            if (JSON.stringify(newObject) !== JSON.stringify(existingObject)) {
                fieldsToUpdate[fieldName] = newObject as T[K];
            }
        }
    }
}

/**
 * Utility function to compare two objects while ignoring metadata fields.
 * This is used to determine if the business logic fields of entities have changed.
 *
 * @param newObj The new object (may be partial)
 * @param existingObj The existing object
 * @param fieldsToIgnore List of fields to ignore during comparison (e.g., timestamps, version)
 * @returns true if objects are the same (ignoring specified fields)
 */
export function entitiesAreSame<T extends Record<string, any>>(newObj: Partial<T>, existingObj: T, fieldsToIgnore: (keyof T)[]): boolean {
    // Clone both objects to avoid modifying originals
    const newCopy = cloneDeep(newObj);
    const existingCopy = cloneDeep(existingObj);

    // Remove ignored fields from both objects
    for (const field of fieldsToIgnore) {
        delete newCopy[field];
        delete existingCopy[field];
    }

    // Compare the objects
    return areSame(newCopy, existingCopy);
}

/**
 * Pre-configured function to compare agents while ignoring metadata fields
 */
export function agentsAreSame(newAgent: Partial<AgentDefinition>, existingAgent: AgentDefinition): boolean {
    return entitiesAreSame(newAgent, existingAgent, ['version', 'createdAt', 'createdBy', 'updatedAt', 'lastModifiedBy']);
}

/**
 * Pre-configured function to compare tools while ignoring metadata fields
 */
export function toolsAreSame(newTool: ToolDefinition, existingTool: ToolDefinition): boolean {
    return entitiesAreSame(newTool, existingTool, ['version', 'createdAt', 'createdBy', 'updatedAt', 'lastModifiedBy']);
}

/**
 * Utility function to validate that all requested IDs exist in the fetched entities.
 * Throws an error with missing IDs if validation fails.
 *
 * @param requestedIds Array of IDs that were requested
 * @param fetchedEntities Array of entities that were actually found
 * @param entityName Name of the entity type for error messages (e.g., "tools", "agents")
 * @param idField The field name that contains the ID in the entity objects
 * @param customErrorPrefix Optional custom error message prefix
 */
export function validateEntitiesExist<T>(requestedIds: string[], fetchedEntities: T[], entityName: string, idField: keyof T, customErrorPrefix?: string): void {
    if (fetchedEntities.length !== requestedIds.length) {
        const missingIds = requestedIds.filter((id) => !fetchedEntities.some((entity) => entity[idField] === id));
        const errorPrefix = customErrorPrefix ?? `These ${entityName} don't exist`;
        throw new Error(`${errorPrefix}: ${missingIds.join(', ')}`);
    }
}

/**
 * Utility function to check if two arrays have the same elements (order independent)
 *
 * @param array1 First array to compare
 * @param array2 Second array to compare
 * @returns true if arrays contain the same elements
 */
export function arraysHaveSameElements<T>(array1: T[], array2: T[]): boolean {
    if (array1.length !== array2.length) {
        return false;
    }
    return array1.every((item) => array2.includes(item));
}

/**
 * Utility function to check if two Records have the same elements (key-value pairs)
 *
 * @param record1 First record to compare (can be undefined)
 * @param record2 Second record to compare (can be undefined)
 * @returns true if records contain the same key-value pairs
 */
export function recordsHaveSameElements<T>(record1?: Record<string, T>, record2?: Record<string, T>): boolean {
    // Handle undefined/null cases
    if (!record1 && !record2) {
        return true;
    }
    if (!record1 || !record2) {
        return false;
    }

    const keys1 = Object.keys(record1);
    const keys2 = Object.keys(record2);

    // Check if they have the same number of keys
    if (keys1.length !== keys2.length) {
        return false;
    }

    // Check if all keys exist in both records and values are the same
    return keys1.every((key) => {
        if (!(key in record2)) {
            return false;
        }
        // Use JSON comparison for deep equality
        return JSON.stringify(record1[key]) === JSON.stringify(record2[key]);
    });
}

/**
 * Utility function to create a new entity with standard metadata fields
 *
 * @param entityData The core entity data
 * @param entityId The ID for the entity (will be generated if not provided)
 * @param userId The user creating the entity
 * @param now Current timestamp
 * @param generateId Function to generate an ID if one isn't provided
 * @returns Complete entity with metadata
 */
export function createEntityWithMetadata<T extends { version: number; createdBy: string; lastModifiedBy: string; createdAt: string; updatedAt: string }>(
    entityData: Omit<T, 'version' | 'createdBy' | 'lastModifiedBy' | 'createdAt' | 'updatedAt'>,
    userId: string,
    now: string
): T {
    return {
        ...entityData,
        version: 1,
        createdBy: userId,
        lastModifiedBy: userId,
        createdAt: now,
        updatedAt: now
    } as T;
}

/**
 * Utility function to handle required array field updates.
 * For required arrays, we only update if the array content is different (no removal).
 *
 * @param newArray The new array from the request
 * @param existingArray The current array in the database
 * @param fieldName The name of the field being updated
 * @param fieldsToUpdate Object to add update values to
 */
export function handleRequiredArrayFieldUpdate<T, K extends keyof T>(newArray: T[K] | undefined, existingArray: T[K], fieldName: K, fieldsToUpdate: Partial<T>): void {
    if (newArray !== undefined && Array.isArray(newArray) && Array.isArray(existingArray)) {
        // Compare arrays by length and elements
        const arraysAreDifferent = newArray.length !== existingArray.length || !newArray.every((item) => existingArray.includes(item));

        if (arraysAreDifferent) {
            fieldsToUpdate[fieldName] = newArray;
        }
    } else if (newArray !== undefined && newArray !== existingArray) {
        // Handle case where types don't match or one is undefined
        fieldsToUpdate[fieldName] = newArray;
    }
}

/**
 * Utility function to calculate a TTL value based on the number of days from now
 *
 * @param daysFromNow Number of days from now
 * @returns TTL value in seconds
 */
export function calculateTTL(daysFromNow: number): number {
    return Math.floor(Date.now() / 1000) + daysFromNow * 24 * 60 * 60;
}
