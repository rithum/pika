/**
 * Manages key version calculations and cleanup for the cookie rotation system.
 *
 * Handles:
 * - Version number cycling (1-100, then back to 1)
 * - Active-version selection after rotation
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

    // Recency is positional, not numeric: versions wrap from maxVersion back to 1.
    nextActiveVersions(newVersion: number, previousCurrentVersion: number, previousActiveVersions: number[], maxVersions: number = 3): number[] {
        if (maxVersions <= 0) {
            throw new Error(`Invalid maxVersions: ${maxVersions}. Must be greater than 0`);
        }

        const ordered = [newVersion, previousCurrentVersion, ...previousActiveVersions].filter((v) => v > 0);
        return [...new Set(ordered)].slice(0, maxVersions);
    }

    /**
     * Sort versions in descending numeric order (not recency order across a rollover)
     * @param versions - Array of version numbers to sort
     * @returns Sorted array in descending order
     */
    sortVersions(versions: number[]): number[] {
        if (!Array.isArray(versions)) {
            throw new Error('Versions must be an array');
        }

        return [...versions].sort((a, b) => b - a);
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
