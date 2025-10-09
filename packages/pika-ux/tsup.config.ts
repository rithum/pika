import { defineConfig } from 'tsup';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    // Build only tools for consumers - NOT UI components (those stay as source)
    entry: ['tools/icon-generator/generate-icon-ts-indices.ts', 'tools/shadcn-postinstall/index.ts', 'tools/cli/index.ts'],
    format: ['esm'],
    dts: false, // Tools don't need .d.ts files
    splitting: false,
    sourcemap: false, // Tools don't need sourcemaps
    clean: true,
    treeshake: true,
    outDir: 'dist',
    platform: 'node', // Target Node.js platform
    target: 'node22', // Set proper target for import.meta support
    bundle: true,
    skipNodeModulesBundle: false,
    // Externalize CLI dependencies (they're in dependencies, not devDependencies, so they'll be installed with the package)
    external: ['typescript', '@iconify/json', 'chalk', 'commander', 'inquirer', 'ora', 'semver', 'fs-extra', 'glob'],
    // Preserve the directory structure
    outExtension({ format }) {
        return {
            js: '.js'
        };
    },
    async onSuccess() {
        // Copy CLI template files to dist
        const templateSrc = path.join(__dirname, 'tools/cli/template-files');
        const templateDest = path.join(__dirname, 'dist/cli/template-files');

        // Ensure the dest directory exists
        if (!fs.existsSync(path.dirname(templateDest))) {
            fs.mkdirSync(path.dirname(templateDest), { recursive: true });
        }

        // Remove old template files if they exist
        if (fs.existsSync(templateDest)) {
            fs.rmSync(templateDest, { recursive: true, force: true });
        }

        // Copy template files
        fs.cpSync(templateSrc, templateDest, { recursive: true });

        // Update template pnpm-workspace.yaml with versions from root
        const rootWorkspacePath = path.join(__dirname, '../../pnpm-workspace.yaml');
        const templateWorkspacePath = path.join(templateDest, 'pnpm-workspace.yaml');

        if (fs.existsSync(rootWorkspacePath) && fs.existsSync(templateWorkspacePath)) {
            const rootWorkspace = fs.readFileSync(rootWorkspacePath, 'utf8');
            const templateWorkspace = fs.readFileSync(templateWorkspacePath, 'utf8');

            // Extract catalog section from root
            const rootCatalogMatch = rootWorkspace.match(/catalog:\s*([\s\S]*?)(?:\n\n|\nonlyBuiltDependencies:|$)/);
            const templateCatalogMatch = templateWorkspace.match(/catalog:\s*([\s\S]*?)$/);

            if (rootCatalogMatch && templateCatalogMatch) {
                const rootCatalog = rootCatalogMatch[1];
                const templateCatalogLines = templateCatalogMatch[1].trim().split('\n');

                // For each package in the template, update its version from root
                const updatedLines = templateCatalogLines.map((line) => {
                    const packageMatch = line.match(/^  (['"])?([^'":\s]+)\1?:/);
                    if (packageMatch) {
                        const packageName = packageMatch[2];
                        // Find this package in root catalog
                        const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const rootPackageRegex = new RegExp(`^  (['"])?${escapedName}\\1?:\\s*(.+)$`, 'm');
                        const rootPackageMatch = rootCatalog.match(rootPackageRegex);
                        if (rootPackageMatch) {
                            // Preserve quotes if package name has special chars
                            const needsQuotes = packageName.includes('/') || packageName.includes('@');
                            const quotedName = needsQuotes ? `'${packageName}'` : packageName;
                            return `  ${quotedName}: ${rootPackageMatch[2]}`;
                        }
                    }
                    return line;
                });

                // Ensure all lines have proper indentation (2 spaces)
                const properlyIndentedLines = updatedLines.map((line) => {
                    // Skip empty lines
                    if (!line.trim()) return line;
                    // If line doesn't start with 2 spaces, add them
                    if (!line.startsWith('  ')) return `  ${line}`;
                    return line;
                });

                const updatedWorkspace = `catalog:\n${properlyIndentedLines.join('\n')}\n`;
                fs.writeFileSync(templateWorkspacePath, updatedWorkspace, 'utf8');
                console.log('✓ Template pnpm-workspace.yaml versions updated from root');
            }
        }

        console.log('CLI template files copied to dist');

        // Make CLI executable on Unix systems
        const cliPath = path.join(__dirname, 'dist/cli/index.js');
        if (process.platform !== 'win32' && fs.existsSync(cliPath)) {
            try {
                fs.chmodSync(cliPath, 0o755);
                console.log('CLI made executable');
            } catch (error) {
                console.warn('Failed to make CLI executable:', error);
            }
        }
    }
});
