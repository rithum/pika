// Seam: replace this to match your entity data shape.
// Used by custom-data-overrides-ui.svelte for Combobox rendering and dirty-state detection.

/**
 * Combobox field accessors for your entity type.
 * Replace the body of each function with accessors that match your AccountLite / entity shape.
 */
export const comboboxMapping = {
    value: (item: unknown): string => (item as Record<string, string>).accountId ?? '',
    label: (item: unknown): string => {
        const a = item as { details?: { accountName?: string }; accountName?: string };
        return a.details?.accountName ?? a.accountName ?? '';
    },
    secondaryLabel: (item: unknown): string => {
        const a = item as { details?: { accountType?: string }; accountType?: string };
        return a.details?.accountType ?? a.accountType ?? '';
    }
};

/**
 * Return true if the two entity values are different (used for dirty-state detection).
 * Replace with a comparison tailored to your entity shape.
 */
export function accountsAreDifferent(a: unknown, b: unknown): boolean {
    if (!a && !b) return false;
    if (!a || !b) return true;
    const aId = (a as Record<string, string>).accountId;
    const bId = (b as Record<string, string>).accountId;
    return aId !== bId;
}
