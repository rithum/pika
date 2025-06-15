#!/usr/bin/env node

import { Command } from 'commander';
import { createApp } from './commands/create-app.js';
import { syncCommand } from './commands/sync.js';
import { componentCommand } from './commands/component.js';
import { authCommand } from './commands/auth.js';
import { logger } from './utils/logger.js';
import chalk from 'chalk';

const program = new Command();

program.name('pika').description('CLI tool for creating and managing Pika framework chat applications').version('1.0.0');

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
    .command('sync')
    .description('Synchronize with upstream Pika framework changes')
    .option('--version <version>', 'Specific version to sync to (default: latest)')
    .option('--dry-run', 'Preview changes without applying them')
    .option('--force', 'Force sync even if there are conflicts')
    .action(syncCommand);

program
    .command('component')
    .description('Manage custom markdown components')
    .option('add <name>', 'Add a new custom component')
    .option('list', 'List all registered components')
    .option('validate', 'Validate component registry')
    .action(componentCommand);

program
    .command('auth')
    .description('Manage authentication configuration')
    .option('setup <provider>', 'Setup authentication provider (mock, auth-js, custom, enterprise-sso)')
    .option('status', 'Show current authentication status')
    .action(authCommand);

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
