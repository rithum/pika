import findIndex from 'lodash.findindex';
import isEqualWith from 'lodash.isequalwith';

/**
 * Checks if two variables are "the same" based on specific rules:
 * - Scalar types: uses strict equality (`===`), with special handling for NaN.
 * - Objects: recursively checks that each attribute exists in both objects and their values are "the same" (applying these rules).
 * This is handled by _.isEqualWith's default object comparison logic when the customizer returns undefined.
 * - Arrays: checks that both arrays contain the "same" elements, irrespective of order.
 * Element "sameness" is determined by these rules via recursive calls.
 *
 * @param val1 The first variable to compare.
 * @param val2 The second variable to compare.
 * @returns True if the variables are considered "the same", false otherwise.
 */
export function areSame(val1: unknown, val2: unknown): boolean {
    // Use a WeakSet to track visited object pairs to handle circular references
    const visitedPairs = new WeakSet();

    // The customizer function for _.isEqualWith
    const customizer = (objValue: unknown, othValue: unknown, indexOrKey?: unknown, object?: unknown, other?: unknown, stack?: unknown): boolean | undefined => {
        // Rule: Scalar type comparison (delegated if undefined, but NaN needs explicit handling if not relying on _.isEqual's NaN)
        // _.isEqual handles NaN correctly (NaN is equal to NaN).
        // Explicitly handling here for clarity, though _.isEqualWith's default also covers it.
        if (Number.isNaN(objValue) && Number.isNaN(othValue)) {
            return true;
        }

        // Rule: Array comparison (order-agnostic)
        if (Array.isArray(objValue) && Array.isArray(othValue)) {
            // Create a unique identifier for this comparison pair
            const pairId = { a: objValue, b: othValue };
            
            // Check if we've already started comparing these arrays
            if (visitedPairs.has(pairId)) {
                // We're in a circular reference, delegate to lodash's default comparison
                return undefined;
            }
            
            // Mark this pair as being compared
            visitedPairs.add(pairId);
            
            try {
                if (objValue.length !== othValue.length) {
                    return false; // Different lengths, cannot be same
                }
                if (objValue.length === 0) {
                    return true; // Both are empty arrays, considered same
                }

                // Create a mutable copy of the second array to track matched elements.
                // This is important for correctly handling duplicate elements.
                const othValueCopy = [...othValue];

                for (const item1 of objValue) {
                    // Try to find an element in othValueCopy that is "the same" as item1.
                    // For circular references, we need to use areSame recursively, but with caution
                    const foundIndex = findIndex(othValueCopy, (item2) => {
                        // If both items are the same reference and we're dealing with circular objects,
                        // they should be considered equal
                        if (item1 === item2) {
                            return true;
                        }
                        // Otherwise, use lodash's default comparison which handles circular references
                        return isEqualWith(item1, item2, (a, b) => {
                            // For nested arrays, we want to maintain order-agnostic comparison
                            if (Array.isArray(a) && Array.isArray(b)) {
                                // Only apply our custom logic if these aren't the same arrays we're already comparing
                                if (a !== objValue && b !== othValue && a !== othValue && b !== objValue) {
                                    return areSame(a, b);
                                }
                            }
                            // For everything else, let lodash handle it
                            return undefined;
                        });
                    });

                    if (foundIndex === -1) {
                        // item1 from objValue was not found in othValueCopy
                        return false;
                    }
                    // Remove the matched element from othValueCopy to prevent it from being matched again.
                    othValueCopy.splice(foundIndex, 1);
                }
                // All elements in objValue found a match in othValue
                return true;
            } finally {
                // Remove the pair from visited set when we're done
                visitedPairs.delete(pairId);
            }
        }

        // For all other types (objects, scalars not handled above, etc.):
        // Return `undefined` to let `_.isEqualWith` use its default comparison logic.
        // - For objects: _.isEqualWith will check if they have the same keys. If so, it
        //   will recursively call itself (with this customizer) for the values of those keys.
        //   This satisfies the "each attribute exists in both and are the same" rule.
        // - For scalars: _.isEqualWith will perform a strict equality check (or equivalent for Date/RegExp).
        return undefined;
    };

    // Use _.isEqualWith along with the customizer.
    // _.isEqualWith handles circular references internally.
    return isEqualWith(val1, val2, customizer);
}
