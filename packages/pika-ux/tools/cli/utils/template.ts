import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { logger } from './logger.js';

interface TemplateVariables {
    projectName: string;
    humanReadableProjectName: string;
    pikaUxVersion: string;
}

/**
 * Recursively processes template files, replacing placeholders
 */
export async function processTemplateFiles(sourceDir: string, targetDir: string, variables: TemplateVariables): Promise<void> {
    logger.debug(`Processing template files from: ${sourceDir}`);
    logger.debug(`Target directory: ${targetDir}`);

    // Get all files in the template directory using glob
    let files: string[];
    try {
        files = await glob('**/*', {
            cwd: sourceDir,
            dot: true,
            nodir: true,
            absolute: false
        });
        logger.debug(`Glob found ${files.length} files`);
    } catch (error) {
        logger.debug(`Glob error: ${error}`);
        throw new Error(`Failed to read template directory: ${error}`);
    }

    if (files.length === 0) {
        logger.warn(`No files found in template directory: ${sourceDir}`);
        // List what's actually in the directory
        try {
            const dirContents = await fs.readdir(sourceDir);
            logger.debug(`Directory contents: ${dirContents.join(', ')}`);
        } catch (e) {
            logger.debug(`Could not read directory: ${e}`);
        }
    }

    for (const file of files) {
        const sourcePath = path.join(sourceDir, file);
        const targetPath = path.join(targetDir, file);

        logger.debug(`Copying: ${file}`);

        // Ensure target directory exists
        await fs.ensureDir(path.dirname(targetPath));

        // Read file content
        let content = await fs.readFile(sourcePath, 'utf8');

        // Replace template variables
        content = content
            .replace(/\{projectName\}/g, variables.projectName)
            .replace(/\{humanReadableProjectName\}/g, variables.humanReadableProjectName)
            .replace(/\{pikaUxVersion\}/g, variables.pikaUxVersion);

        // Write processed file
        await fs.writeFile(targetPath, content, 'utf8');
    }

    logger.debug(`Processed ${files.length} template files`);
}

/**
 * Copies and processes template directory to target location
 */
export async function copyAndProcessTemplate(templateDir: string, targetDir: string, variables: TemplateVariables): Promise<void> {
    // Ensure target directory exists
    await fs.ensureDir(targetDir);

    // Process all template files
    await processTemplateFiles(templateDir, targetDir, variables);
}
