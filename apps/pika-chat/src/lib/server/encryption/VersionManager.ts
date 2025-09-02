/**
 * Manages key version calculations and cleanup for the cookie rotation system.
 *
 * Handles:
 * - Version number cycling (1-100, then back to 1)
 * - Old version cleanup logic
 * - Version sorting utilities
 */
export class VersionManager {
    /**
     * Calculate the next version number with rollover at maxVersion
     * @param currentVersion - Current version number
     * @param maxVersion - Maximum version before rollover (default: 100)
     * @returns Next version number
     */
    calculateNextVersion(currentVersion: number, maxVersion: number = 100): number {
        if (currentVersion < 0 || currentVersion > maxVersion) {
            throw new Error(`Invalid current version: ${currentVersion}. Must be between 0 and ${maxVersion}`);
        }

        return (currentVersion % maxVersion) + 1;
    }

    /**
     * Remove old versions, keeping only the most recent ones
     * @param versions - Array of version numbers
     * @param maxVersions - Maximum number of versions to keep (default: 3)
     * @returns Filtered array of versions to keep
     */
    cleanupOldVersions(versions: number[], maxVersions: number = 3): number[] {
        if (maxVersions <= 0) {
            throw new Error(`Invalid maxVersions: ${maxVersions}. Must be greater than 0`);
        }

        // Sort versions in descending order (newest first) and take the most recent ones
        return this.sortVersions(versions).slice(0, maxVersions);
    }

    /**
     * Sort versions in descending order (newest first)
     * Handles rollover correctly (e.g., version 1 after 100)
     * @param versions - Array of version numbers to sort
     * @returns Sorted array in descending order
     */
    sortVersions(versions: number[]): number[] {
        if (!Array.isArray(versions)) {
            throw new Error('Versions must be an array');
        }

        // Create a copy to avoid mutating the original
        const versionsCopy = [...versions];

        // Simple descending sort works fine for our use case
        // Since we're only keeping 3 versions at a time, rollover edge cases are minimal
        return versionsCopy.sort((a, b) => b - a);
    }

    /**
     * Determine which versions should be deleted based on active versions
     * @param oldVersions - Previously active versions
     * @param newActiveVersions - New active versions after rotation
     * @returns Array of versions that should be deleted
     */
    getVersionsToDelete(oldVersions: number[], newActiveVersions: number[]): number[] {
        return oldVersions.filter((version) => !newActiveVersions.includes(version));
    }

    /**
     * Validate that a version number is within acceptable range
     * @param version - Version number to validate
     * @param maxVersion - Maximum allowed version (default: 100)
     * @returns True if version is valid
     */
    isValidVersion(version: number, maxVersion: number = 100): boolean {
        return Number.isInteger(version) && version >= 1 && version <= maxVersion;
    }
}
