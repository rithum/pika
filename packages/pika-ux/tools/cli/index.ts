#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createCommand } from './commands/create.js';
import { logger } from './utils/logger.js';
import { validatePnpm, validateNodeVersion } from './utils/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));

const program = new Command();

program.name('pika-ux').description('CLI tool for creating Pika webcomponent applications').version(packageJson.version);

program
    .command('create')
    .description('Create a new Pika webcomponent application')
    .argument('[name]', 'Project name')
    .action(async (name?: string) => {
        // Validate environment
        await validateNodeVersion();
        await validatePnpm();

        // Run create command
        await createCommand({ projectName: name });
    });

// Help command (default behavior when no command is provided)
program.on('--help', () => {
    console.log('');
    console.log(chalk.bold('Examples:'));
    console.log(chalk.gray('  $ pika-ux create'));
    console.log(chalk.gray('  $ pika-ux create my-webcomponent'));
    console.log('');
    console.log(chalk.dim('Tip: You can also use "pikaux" for shorter typing'));
    console.log('');
});

// Global error handler
program.exitOverride((err: any) => {
    if (err.code === 'commander.version' || err.code === 'commander.help' || err.code === 'commander.helpDisplayed') {
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

// Show banner
console.log(
    chalk.cyan(`
╔═══════════════════════════════════════╗
║                                       ║
║     🎨 Pika UX Webcomponent CLI       ║
║   Create webcomponents with ease      ║
║                                       ║
╚═══════════════════════════════════════╝
`)
);

program.parse();
