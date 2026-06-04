import { Command } from 'commander';
import { createApp } from './commands/create-app.js';
import { migrateCommand } from './commands/migrate.js';
import { syncCommand } from './commands/sync.js';
import { componentCommand } from './commands/component.js';
import { authCommand } from './commands/auth.js';
import { themeCommand } from './commands/theme.js';
import { capturePatchCommand } from './commands/capture-patch.js';
import { logger } from './utils/logger.js';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

const program = new Command();

program.name('pika').description('CLI tool for creating and managing Pika framework chat applications').version(packageJson.version);

program
    .command('create-app')
    .description('Create a new Pika chat application')
    .argument('[name]', 'Project name')
    .option('-t, --template <template>', 'Template to use (default, minimal, enterprise)', 'default')
    .option('-d, --directory <directory>', 'Output directory')
    .option('--skip-install', 'Skip installing dependencies')
    .option('--skip-git', 'Skip initializing git repository')
    .action(createApp);

program
    .command('migrate')
    .description('Run a Pika framework migration script')
    .argument('<migration>', 'Migration to run (currently: v0.26.0-v0.27.0)')
    .option('--dry-run', 'Print what would be deleted without touching the filesystem')
    .option('--force', 'Skip dirty-tree and consumer-tree checks')
    .option('--force-content-mismatch', 'Delete files even if their content differs from the v0.26.0 default stub (overrides the customized-file safety check)')
    .action(async (migration, options) => {
        await migrateCommand(migration, options);
    });

program
    .command('sync')
    .description('Synchronize with upstream Pika framework changes')
    .option('--version <version>', 'Specific version to sync to (default: latest)')
    .option('--branch <branch>', 'Specific branch to sync from (default: main)')
    .option('--dry-run', 'Preview changes without applying them')
    .option('--force', 'Force sync even if there are conflicts')
    .option('--diff', 'Show diffs for all changes without applying them')
    .option('--visual-diff', 'Open diffs in Cursor or VS Code for all changes without applying them')
    .option('--debug', 'Enable debug logging')
    .option('--verbose', 'Show detailed sync information and configuration')
    .option('--acknowledge-breaking-changes', 'Acknowledge breaking changes and proceed with sync')
    .option('--yes', 'Auto-confirm all prompts (non-interactive mode for CI/CD)')
    .option('--check-collisions', 'Read-only: report framework files whose committed content differs from pristine+patches (used by CI). Exits non-zero if any are found.')
    .option('--help', 'Show detailed help about the sync system')
    .action(syncCommand);

program
    .command('capture-patch')
    .description('Capture an edit to a framework-owned file as a pika-patches/ patch that survives sync')
    .argument('[file]', 'Framework file to capture (auto-detected from the working tree if omitted)')
    .option('--name <name>', 'Patch name (default: derived from the filename)')
    .option('--reason <reason>', 'Why this customization exists (recorded in the patch header)')
    .option('--upstream-ticket <ticket>', 'Optional upstream pika ticket tracking promotion of this edit to a seam')
    .option('--owner <owner>', 'Owner email (default: git config user.email)')
    .action(async (file, options) => {
        await capturePatchCommand(file, options);
    });

program
    .command('component')
    .description('Manage custom markdown components')
    .addCommand(
        new Command('add')
            .description('Add a new custom component')
            .argument('<name>', 'Name of the component to add')
            .action(async (name) => {
                await componentCommand({ add: name });
            })
    )
    .addCommand(
        new Command('list').description('List all registered components').action(async () => {
            await componentCommand({ list: true });
        })
    )
    .addCommand(
        new Command('validate').description('Validate component registry').action(async () => {
            await componentCommand({ validate: true });
        })
    );

program
    .command('auth')
    .description('Manage authentication configuration')
    .addCommand(
        new Command('setup')
            .description('Setup authentication provider')
            .argument('<provider>', 'Authentication provider (mock, auth-js, custom, enterprise-sso)')
            .action(async (provider) => {
                await authCommand({ setup: provider });
            })
    )
    .addCommand(
        new Command('status').description('Show current authentication status').action(async () => {
            await authCommand({ status: true });
        })
    )
    .action(async () => {
        await authCommand();
    });

program
    .command('theme')
    .description('Manage UI theme configuration')
    .addCommand(
        new Command('check')
            .description('Check if your theme is up to date with the latest schema')
            .action(async () => {
                await themeCommand({ check: true });
            })
    )
    .addCommand(
        new Command('update')
            .description('Update theme config with new variables (adds comments with defaults)')
            .action(async () => {
                await themeCommand({ update: true });
            })
    )
    .addCommand(
        new Command('list')
            .description('List all available theme variables with descriptions')
            .action(async () => {
                await themeCommand({ list: true });
            })
    )
    .addCommand(
        new Command('docs')
            .description('Show theme documentation and quick start guide')
            .action(async () => {
                await themeCommand({ docs: true });
            })
    )
    .action(async () => {
        await themeCommand({ check: true });
    });

// Global error handler
program.exitOverride((err) => {
    if (err.code === 'commander.version') {
        process.exit(0);
    }
    if (err.code === 'commander.help') {
        process.exit(0);
    }
    logger.error(`Command failed: ${err.message}`);
    process.exit(1);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Add helpful banner
console.log(
    chalk.cyan(`
╔═══════════════════════════════════════╗
║                                       ║
║        🐦 Pika Framework CLI          ║
║   Build chat apps with AWS & Bedrock  ║
║                                       ║
╚═══════════════════════════════════════╝
`)
);

program.parse();
