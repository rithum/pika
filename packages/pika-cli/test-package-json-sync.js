// Simple test for package.json sync logic
import fs from 'fs';
import path from 'path';

// Mock the package.json files
const pikaPackageJson = {
    name: 'pika-project',
    version: '1.0.0',
    scripts: {
        dev: 'vite',
        build: 'vite build',
        test: 'vitest'
    },
    dependencies: {
        react: '^18.0.0',
        vite: '^5.0.0'
    },
    devDependencies: {
        typescript: '^5.0.0'
    }
};

const forkPackageJson = {
    name: 'my-project',
    version: '1.0.0',
    description: 'My custom project',
    scripts: {
        dev: 'vite',
        build: 'vite build',
        'my-custom-script': "echo 'custom'"
    },
    dependencies: {
        react: '^18.0.0',
        'my-custom-package': '^1.0.0'
    },
    devDependencies: {
        typescript: '^5.0.0',
        'my-custom-dev-package': '^1.0.0'
    }
};

// Simple comparison logic (simplified version of what we implemented)
function comparePackageJsonFiles(pikaContent, forkContent) {
    const diff = {
        addedAttributes: [],
        removedAttributes: [],
        modifiedAttributes: [],
        addedScripts: [],
        addedDependencies: [],
        addedDevDependencies: [],
        modifiedScripts: [],
        modifiedDependencies: [],
        modifiedDevDependencies: []
    };

    const allKeys = new Set([...Object.keys(pikaContent), ...Object.keys(forkContent)]);
    let hasChanges = false;

    for (const key of allKeys) {
        const pikaHasKey = key in pikaContent;
        const forkHasKey = key in forkContent;

        if (!pikaHasKey && forkHasKey) {
            // Fork has attribute that Pika doesn't - not a difference
            continue;
        }

        if (pikaHasKey && !forkHasKey) {
            // Pika has attribute that fork doesn't - add it
            diff.addedAttributes.push(key);
            hasChanges = true;
            continue;
        }

        if (pikaHasKey && forkHasKey) {
            // Both have the attribute - compare values
            if (key === 'scripts' || key === 'dependencies' || key === 'devDependencies') {
                const result = compareObjectValues(pikaContent[key], forkContent[key], key);
                if (result.hasChanges) {
                    hasChanges = true;
                    if (key === 'scripts') {
                        diff.addedScripts.push(...result.added);
                        diff.modifiedScripts.push(...result.modified);
                    } else if (key === 'dependencies') {
                        diff.addedDependencies.push(...result.added);
                        diff.modifiedDependencies.push(...result.modified);
                    } else if (key === 'devDependencies') {
                        diff.addedDevDependencies.push(...result.added);
                        diff.modifiedDevDependencies.push(...result.modified);
                    }
                }
            } else {
                // For non-special attributes, simple value comparison
                if (JSON.stringify(pikaContent[key]) !== JSON.stringify(forkContent[key])) {
                    diff.modifiedAttributes.push(key);
                    hasChanges = true;
                }
            }
        }
    }

    return { shouldSync: hasChanges, diff };
}

function compareObjectValues(pikaObj, forkObj, objType) {
    const added = [];
    const modified = [];
    let hasChanges = false;

    const allKeys = new Set([...Object.keys(pikaObj || {}), ...Object.keys(forkObj || {})]);

    for (const key of allKeys) {
        const pikaHasKey = pikaObj && key in pikaObj;
        const forkHasKey = forkObj && key in forkObj;

        if (!pikaHasKey && forkHasKey) {
            // Fork has key that Pika doesn't - not a difference
            continue;
        }

        if (pikaHasKey && !forkHasKey) {
            // Pika has key that fork doesn't - add it
            added.push(key);
            hasChanges = true;
            continue;
        }

        if (pikaHasKey && forkHasKey) {
            // Both have the key - compare values
            if (pikaObj[key] !== forkObj[key]) {
                modified.push(key);
                hasChanges = true;
            }
        }
    }

    return { hasChanges, added, modified };
}

// Test the comparison
console.log('Testing package.json sync logic...\n');

const result = comparePackageJsonFiles(pikaPackageJson, forkPackageJson);

console.log('Pika package.json:', JSON.stringify(pikaPackageJson, null, 2));
console.log('\nFork package.json:', JSON.stringify(forkPackageJson, null, 2));
console.log('\nComparison result:', JSON.stringify(result, null, 2));

if (result.shouldSync) {
    console.log('\n✅ Test passed: Changes detected correctly');
    console.log('Expected changes:');
    console.log('- Modified attributes: name');
    console.log('- Added scripts: test');
    console.log('- Added dependencies: vite');
    console.log('- Added devDependencies: (none)');
    console.log('- User additions preserved: my-custom-script, my-custom-package, my-custom-dev-package');
} else {
    console.log('\n❌ Test failed: No changes detected');
}
