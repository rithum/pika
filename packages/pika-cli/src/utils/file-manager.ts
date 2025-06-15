import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import mustache from 'mustache';
import { logger } from './logger.js';
import { minimatch } from 'minimatch';

export interface CopyOptions {
    exclude?: string[];
    transform?: (content: string, filePath: string) => string;
    templateVariables?: Record<string, any>;
}

export class FileManager {
    async ensureDir(dirPath: string): Promise<void> {
        await fs.ensureDir(dirPath);
    }

    async copyTemplate(sourcePath: string, destPath: string, options: CopyOptions = {}): Promise<void> {
        const { exclude = [], transform, templateVariables = {} } = options;

        const sourceStats = await fs.stat(sourcePath);

        if (sourceStats.isDirectory()) {
            await this.ensureDir(destPath);

            const items = await fs.readdir(sourcePath);

            for (const item of items) {
                const sourceItem = path.join(sourcePath, item);
                const destItem = path.join(destPath, item);

                const shouldExclude = exclude.some((pattern) => {
                    // Handle glob patterns
                    if (pattern.includes('*')) {
                        return minimatch(sourceItem, pattern) || minimatch(item, pattern);
                    }
                    // Handle simple string matches
                    return sourceItem.includes(pattern) || item === pattern;
                });

                if (!shouldExclude) {
                    await this.copyTemplate(sourceItem, destItem, options);
                }
            }
        } else {
            let content = await fs.readFile(sourcePath, 'utf8');

            // Apply mustache templating if variables provided
            if (Object.keys(templateVariables).length > 0) {
                content = mustache.render(content, templateVariables);
            }

            // Apply custom transform
            if (transform) {
                content = transform(content, sourcePath);
            }

            await fs.writeFile(destPath, content);
        }
    }

    async findFiles(pattern: string, cwd: string = process.cwd()): Promise<string[]> {
        return glob(pattern, { cwd });
    }

    async readJsonFile(filePath: string): Promise<any> {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            logger.debug(`Failed to read JSON file ${filePath}:`, error);
            return null;
        }
    }

    async writeJsonFile(filePath: string, data: any): Promise<void> {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    async exists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async isDirectory(filePath: string): Promise<boolean> {
        try {
            const stats = await fs.stat(filePath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    async createDirectory(dirPath: string): Promise<void> {
        await fs.ensureDir(dirPath);
    }

    async removeDirectory(dirPath: string): Promise<void> {
        await fs.remove(dirPath);
    }

    async copyFile(source: string, dest: string): Promise<void> {
        await fs.copy(source, dest);
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        await fs.writeFile(filePath, content);
    }

    async readFile(filePath: string): Promise<string> {
        return fs.readFile(filePath, 'utf8');
    }

    getRelativePath(from: string, to: string): string {
        return path.relative(from, to);
    }

    resolvePath(...paths: string[]): string {
        return path.resolve(...paths);
    }

    joinPath(...paths: string[]): string {
        return path.join(...paths);
    }

    basename(filePath: string): string {
        return path.basename(filePath);
    }

    dirname(filePath: string): string {
        return path.dirname(filePath);
    }

    extname(filePath: string): string {
        return path.extname(filePath);
    }
}

export const fileManager = new FileManager();
