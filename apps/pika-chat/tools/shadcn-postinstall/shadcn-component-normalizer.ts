import { glob } from 'glob';
import { readFile, writeFile } from 'fs/promises';
import path from 'path'; // path is included but not strictly necessary for this version

async function normalizeIconImports() {
    console.log('Starting icon import normalization...');

    // Define the pattern for Svelte files
    const targetPattern = 'src/lib/components/ui/**/*.svelte';
    const files = await glob(targetPattern, { nodir: true });
    console.log(`Found ${files.length} Svelte files to process.`);

    if (files.length === 0) {
        console.log('No matching files found. Exiting.');
        return;
    }

    let totalFilesModified = 0;
    let filesWithErrors = 0;

    // Regex Explanation:
    // ^                    - Start of the line (due to 'm' flag)
    // (\s*)                - Capture Group 1: Any leading whitespace (zero or more spaces/tabs) - THIS IS THE KEY CHANGE
    // import\s+            - The word 'import', followed by one or more spaces
    // (\w+)                - Capture Group 2: The default import name (e.g., AlertCircle)
    // \s+from\s+           - Whitespace, the word 'from', whitespace
    // ['"]                 - Matches either a single (') or double (") quote
    // @lucide\/svelte\/icons\/ - Matches the literal string '@lucide/svelte/icons/'
    // [^'"]+               - Matches one or more characters that are NOT a quote (the icon file name)
    // ['"]                 - Matches the closing quote
    // [\s;]* - Optional trailing whitespace (\s) or semicolon (;) - zero or more times
    // $                    - End of the line (due to 'm' flag)
    // Flags:
    // g - Global: Find all matches within the string.
    // m - Multiline: Treat ^ and $ as the start/end of lines.
    const importRegex = /^(\s*)import\s+(\w+)\s+from\s+['"]@lucide\/svelte\/icons\/[^'"]+['"][\s;]*$/gm;
    // ^^--- Capture group 1 for leading whitespace
    //          ^^--- Capture group 2 for the icon name

    for (const file of files) {
        try {
            const originalContent = await readFile(file, 'utf-8');
            let fileModified = false;

            // Use replace with a function to perform the transformation
            // The callback now receives arguments for each capture group
            const newContent = originalContent.replace(importRegex, (match, leadingWhitespace, iconName) => {
                // 'match' is the entire matched line (e.g., "  import X from '@lucide/svelte/icons/x';")
                // 'leadingWhitespace' is Capture Group 1 (e.g., "  ")
                // 'iconName' is Capture Group 2 (e.g., "X")

                // Prepend the captured leading whitespace to the new line
                const newImportLine = `${leadingWhitespace}import { ${iconName} } from '$icons/lucide';`;
                fileModified = true; // Mark that a replacement happened
                return newImportLine; // Return the replacement string including original whitespace
            });

            // Only write the file if content has actually changed
            if (fileModified) {
                await writeFile(file, newContent, 'utf-8');
                console.log(`✓ Updated icon imports in ${file}`);
                totalFilesModified++;
            }
        } catch (error: any) {
            console.error(`Error processing file ${file}:`, error.message || error);
            filesWithErrors++;
        }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Processed: ${files.length} files`);
    console.log(`Modified:  ${totalFilesModified} files`);
    console.log(`Errors:    ${filesWithErrors} files`);
    console.log('Normalization complete.');
}

// Run the main function
normalizeIconImports().catch((error) => {
    console.error('Critical error during script execution:', error);
    process.exit(1);
});
