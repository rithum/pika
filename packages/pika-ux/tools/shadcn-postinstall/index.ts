#!/usr/bin/env node

/**
 * shadcn-svelte Post-Install Normalizer
 *
 * This tool converts alias-based imports to relative imports in shadcn components
 * after running `pnpm dlx shadcn-svelte@latest add [component]`
 *
 * Usage: pnpm run shadcn:normalize
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the shadcn directory
const shadcnDirPath = path.resolve(__dirname, '../../src/shadcn');

interface ImportReplacement {
    from: string;
    to: string;
}

/**
 * Calculate relative path from current file to target within src/shadcn/
 */
function calculateRelativePath(fromFile: string, toPath: string): string {
    const fromDir = path.dirname(fromFile);
    const fromDepth = fromDir.replace(shadcnDirPath, '').split('/').length - 1;

    // If toPath starts with 'shadcn/', remove it since we're already in shadcn/
    const cleanToPath = toPath.startsWith('shadcn/') ? toPath.replace('shadcn/', '') : toPath;

    // Calculate relative path
    const upLevels = fromDepth > 0 ? '../'.repeat(fromDepth) : './';
    return upLevels + cleanToPath;
}

/**
 * Get all .svelte and .ts files recursively from shadcn directory
 */
function getAllShadcnFiles(dir: string = shadcnDirPath): string[] {
    const files: string[] = [];

    if (!existsSync(dir)) {
        console.log(`Directory ${dir} does not exist`);
        return files;
    }

    const entries = readdirSync(dir);

    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
            files.push(...getAllShadcnFiles(fullPath));
        } else if (stat.isFile() && (entry.endsWith('.svelte') || entry.endsWith('.ts'))) {
            files.push(fullPath);
        }
    }

    return files;
}

/**
 * Parse import statements and convert aliases to relative paths
 */
function normalizeImports(content: string, filePath: string): string {
    // Pattern to match import statements with $ui/ or $lib/ aliases
    const importPattern = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+['"])([^'"]+)(['"])/g;

    let updatedContent = content;
    let match;

    while ((match = importPattern.exec(content)) !== null) {
        const [fullMatch, importPath, quote] = match;

        if (importPath.startsWith('$ui/shadcn/is-mobile.svelte.js')) {
            // Special case: hooks file is now directly in shadcn directory
            const newImport = fullMatch.replace(importPath, '../is-mobile.svelte.js');
            updatedContent = updatedContent.replace(fullMatch, newImport);
            console.log(`  ${path.basename(filePath)}: ${importPath} → ../is-mobile.svelte.js`);
        } else if (importPath.startsWith('$ui/shadcn/')) {
            // Convert $ui/shadcn/component to relative path
            const componentPath = importPath.replace('$ui/shadcn/', '');
            const relativePath = calculateRelativePath(filePath, componentPath);
            const newImport = fullMatch.replace(importPath, relativePath);
            updatedContent = updatedContent.replace(fullMatch, newImport);
            console.log(`  ${path.basename(filePath)}: ${importPath} → ${relativePath}`);
        } else if (importPath.startsWith('$ui/')) {
            // Convert $ui/something to relative path from shadcn root
            const targetPath = importPath.replace('$ui/', '../');
            const newImport = fullMatch.replace(importPath, targetPath);
            updatedContent = updatedContent.replace(fullMatch, newImport);
            console.log(`  ${path.basename(filePath)}: ${importPath} → ${targetPath}`);
        } else if (importPath.startsWith('$lib/')) {
            // Convert $lib/something to relative path (assuming src/lib structure)
            const targetPath = importPath.replace('$lib/', '../lib/');
            const newImport = fullMatch.replace(importPath, targetPath);
            updatedContent = updatedContent.replace(fullMatch, newImport);
            console.log(`  ${path.basename(filePath)}: ${importPath} → ${targetPath}`);
        }
    }

    return updatedContent;
}

/**
 * Process a single file
 */
function processFile(filePath: string): boolean {
    try {
        const originalContent = readFileSync(filePath, 'utf8');
        const normalizedContent = normalizeImports(originalContent, filePath);

        if (originalContent !== normalizedContent) {
            writeFileSync(filePath, normalizedContent);
            return true;
        }

        return false;
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
        return false;
    }
}

/**
 * Main function
 */
function main(): void {
    console.log('🔧 shadcn-svelte Post-Install Normalizer');
    console.log('Converting alias-based imports to relative imports...\n');

    const files = getAllShadcnFiles();

    if (files.length === 0) {
        console.log('No .svelte or .ts files found in src/shadcn/');
        return;
    }

    console.log(`Found ${files.length} files to process:`);

    let processedCount = 0;
    let changedCount = 0;

    for (const file of files) {
        console.log(`\nProcessing: ${path.relative(shadcnDirPath, file)}`);
        const wasChanged = processFile(file);

        processedCount++;
        if (wasChanged) {
            changedCount++;
        }
    }

    console.log(`\nProcessing complete!`);
    console.log(`Files processed: ${processedCount}`);
    console.log(`Files modified: ${changedCount}`);

    if (changedCount > 0) {
        console.log('\n All shadcn components now use relative imports!');
        console.log('They will work correctly in all three scenarios:');
        console.log('  1. pika-ux project itself');
        console.log('  2. Monorepo projects (workspace:*)');
        console.log('  3. External npm projects');
    } else {
        console.log('\n All files were already using relative imports.');
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
