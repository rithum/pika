import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

// Import theme schema utilities - we'll use dynamic import since it's TypeScript
interface ThemeSchemaChange {
    version: number;
    date: string;
    description: string;
    addedVariables: {
        name: string;
        category: string;
        description: string;
        defaultLight: string;
        defaultDark?: string;
        affectedElements: string[];
    }[];
}

interface ThemeConfig {
    schemaVersion?: number;
    name?: string;
    cssVariables?: {
        light?: Record<string, string>;
        dark?: Record<string, string>;
    };
}

// Inline the schema data since we can't easily import the TypeScript module
const CURRENT_THEME_SCHEMA_VERSION = 1;

const THEME_SCHEMA_CHANGELOG: ThemeSchemaChange[] = [
    {
        version: 1,
        date: '2026-01-19',
        description: 'Initial theme schema with core shadcn variables and Pika extensions',
        addedVariables: [
            { name: 'primary', category: 'core', description: 'Primary brand color', defaultLight: 'oklch(0.514 0.146 255.748)', defaultDark: 'oklch(0.984 0.004 248.227)', affectedElements: ['Buttons', 'Links', 'Active states'] },
            { name: 'primary-foreground', category: 'core', description: 'Text on primary', defaultLight: 'oklch(0.984 0.004 248.227)', defaultDark: 'oklch(0.208 0.04 265.731)', affectedElements: ['Button text'] },
            { name: 'secondary', category: 'core', description: 'Secondary actions', defaultLight: 'oklch(0.968 0.007 248.084)', defaultDark: 'oklch(0.28 0.037 259.981)', affectedElements: ['Secondary buttons', 'Badges'] },
            { name: 'destructive', category: 'core', description: 'Destructive actions', defaultLight: 'oklch(0.577 0.215 27.311)', defaultDark: 'oklch(0.396 0.133 25.712)', affectedElements: ['Delete buttons'] },
            { name: 'background', category: 'surface', description: 'Page background', defaultLight: 'oklch(1 0 263.283)', defaultDark: 'oklch(0.137 0.036 258.532)', affectedElements: ['Page background'] },
            { name: 'foreground', category: 'surface', description: 'Default text', defaultLight: 'oklch(0.501 0 263.283)', defaultDark: 'oklch(0.984 0.004 248.227)', affectedElements: ['Body text'] },
            { name: 'card', category: 'surface', description: 'Card backgrounds', defaultLight: 'oklch(1 0 263.283)', defaultDark: 'oklch(0.137 0.036 258.532)', affectedElements: ['Cards', 'Dialogs'] },
            { name: 'muted', category: 'surface', description: 'Muted backgrounds', defaultLight: 'oklch(0.968 0.007 248.084)', defaultDark: 'oklch(0.28 0.037 259.981)', affectedElements: ['Tab backgrounds', 'Code blocks'] },
            { name: 'muted-foreground', category: 'surface', description: 'Secondary text', defaultLight: 'oklch(0.555 0.041 257.452)', defaultDark: 'oklch(0.711 0.035 256.803)', affectedElements: ['Placeholder text', 'Help text'] },
            { name: 'border', category: 'border', description: 'Border color', defaultLight: 'oklch(0.929 0.013 255.585)', defaultDark: 'oklch(0.28 0.037 259.981)', affectedElements: ['Card borders', 'Dividers'] },
            { name: 'ring', category: 'border', description: 'Focus ring', defaultLight: 'oklch(0.514 0.146 255.748)', defaultDark: 'oklch(0.625 0.05 253.665)', affectedElements: ['Focus outlines'] },
            { name: 'success', category: 'status', description: 'Success state', defaultLight: 'oklch(0.55 0.16 142)', defaultDark: 'oklch(0.65 0.18 142)', affectedElements: ['Success messages', 'Checkmarks'] },
            { name: 'warning', category: 'status', description: 'Warning state', defaultLight: 'oklch(0.75 0.15 75)', defaultDark: 'oklch(0.70 0.15 75)', affectedElements: ['Warning messages'] },
            { name: 'info', category: 'status', description: 'Info state', defaultLight: 'oklch(0.55 0.15 250)', defaultDark: 'oklch(0.60 0.16 250)', affectedElements: ['Info messages'] },
            { name: 'ai', category: 'status', description: 'AI/assistant color', defaultLight: 'oklch(0.55 0.2 280)', defaultDark: 'oklch(0.60 0.22 280)', affectedElements: ['AI indicators'] },
        ]
    }
];

interface ThemeCommandOptions {
    check?: boolean;
    update?: boolean;
    list?: boolean;
    docs?: boolean;
}

export async function themeCommand(options: ThemeCommandOptions = {}): Promise<void> {
    const cwd = process.cwd();
    
    // Find theme config file - get path from pika-config.ts or use default
    const pikaConfigContent = existsSync(path.join(cwd, 'pika-config.ts')) 
        ? readFileSync(path.join(cwd, 'pika-config.ts'), 'utf-8') 
        : '';
    const themePathMatch = pikaConfigContent.match(/themeConfigPath:\s*['"]([^'"]+)['"]/);
    const relativePath = themePathMatch?.[1] || 'src/lib/custom/sample-purple-theme';
    const themeConfigPath = path.join(cwd, 'apps/pika-chat', relativePath + '.ts');
    const pikaConfigPath = path.join(cwd, 'pika-config.ts');

    if (options.check) {
        await checkTheme(themeConfigPath, pikaConfigPath);
    } else if (options.update) {
        await updateTheme(themeConfigPath);
    } else if (options.list) {
        listVariables();
    } else if (options.docs) {
        showDocs();
    } else {
        // Default: show status
        await checkTheme(themeConfigPath, pikaConfigPath);
    }
}

async function checkTheme(themeConfigPath: string, pikaConfigPath: string): Promise<void> {
    console.log(chalk.cyan('\n Theme Schema Check\n'));

    // Check if pika-config.ts exists
    if (!existsSync(pikaConfigPath)) {
        logger.error('Not in a Pika project root. Run this command from your project directory.');
        return;
    }

    // Check if custom theme is enabled
    const pikaConfig = readFileSync(pikaConfigPath, 'utf-8');
    const themeEnabledMatch = pikaConfig.match(/customTheme:\s*\{[^}]*enabled:\s*(true|false)/s);
    const themeEnabled = themeEnabledMatch?.[1] === 'true';

    if (!themeEnabled) {
        console.log(chalk.yellow('  Custom theming is disabled in pika-config.ts'));
        console.log(chalk.gray('   To enable, set siteFeatures.uiCustomization.customTheme.enabled = true'));
        console.log();
        console.log(chalk.gray('   Current theme schema version: ') + chalk.cyan(`v${CURRENT_THEME_SCHEMA_VERSION}`));
        console.log(chalk.gray('   Run ') + chalk.cyan('pika theme list') + chalk.gray(' to see all available variables.'));
        return;
    }

    // Check if theme config exists
    if (!existsSync(themeConfigPath)) {
        console.log(chalk.yellow('  Theme config file not found at:'));
        console.log(chalk.gray(`   ${themeConfigPath}`));
        console.log();
        console.log(chalk.gray('   Run ') + chalk.cyan('pika sync') + chalk.gray(' to create the custom directory.'));
        return;
    }

    // Try to parse the schema version from theme config
    const themeConfig = readFileSync(themeConfigPath, 'utf-8');
    const versionMatch = themeConfig.match(/schemaVersion:\s*(\d+)/);
    const userVersion = versionMatch ? parseInt(versionMatch[1], 10) : 1;

    console.log(chalk.gray('Current schema version: ') + chalk.cyan(`v${CURRENT_THEME_SCHEMA_VERSION}`));
    console.log(chalk.gray('Your theme version:     ') + chalk.cyan(`v${userVersion}`));
    console.log();

    if (userVersion >= CURRENT_THEME_SCHEMA_VERSION) {
        console.log(chalk.green('✓ Your theme is up to date!'));
    } else {
        const newChanges = THEME_SCHEMA_CHANGELOG.filter(c => c.version > userVersion);
        console.log(chalk.yellow(`  Theme update available (v${userVersion} → v${CURRENT_THEME_SCHEMA_VERSION})`));
        console.log();

        for (const change of newChanges) {
            console.log(chalk.cyan(`Version ${change.version}`) + chalk.gray(` (${change.date})`));
            console.log(chalk.white(`  ${change.description}`));
            console.log();
            console.log(chalk.gray('  New variables:'));
            for (const v of change.addedVariables) {
                console.log(chalk.green(`    + ${v.name}`) + chalk.gray(` - ${v.description}`));
            }
            console.log();
        }

        console.log(chalk.gray('Run ') + chalk.cyan('pika theme update') + chalk.gray(' to add new variables with defaults.'));
    }
}

async function updateTheme(themeConfigPath: string): Promise<void> {
    console.log(chalk.cyan('\n Theme Update\n'));

    if (!existsSync(themeConfigPath)) {
        logger.error('Theme config file not found. Run pika sync first.');
        return;
    }

    let themeConfig = readFileSync(themeConfigPath, 'utf-8');
    const versionMatch = themeConfig.match(/schemaVersion:\s*(\d+)/);
    const userVersion = versionMatch ? parseInt(versionMatch[1], 10) : 1;

    if (userVersion >= CURRENT_THEME_SCHEMA_VERSION) {
        console.log(chalk.green('✓ Your theme is already up to date!'));
        return;
    }

    // Update schema version
    if (versionMatch) {
        themeConfig = themeConfig.replace(
            /schemaVersion:\s*\d+/,
            `schemaVersion: ${CURRENT_THEME_SCHEMA_VERSION}`
        );
    } else {
        // Add schemaVersion if it doesn't exist
        themeConfig = themeConfig.replace(
            /export const themeConfig:\s*ThemeConfig\s*=\s*\{/,
            `export const themeConfig: ThemeConfig = {\n    schemaVersion: ${CURRENT_THEME_SCHEMA_VERSION},`
        );
    }

    // Get new variables to add
    const newChanges = THEME_SCHEMA_CHANGELOG.filter(c => c.version > userVersion);
    const newVarsComment = generateNewVarsComment(newChanges);

    // Add comment about new variables at the end of the file (before closing brace)
    if (newVarsComment) {
        // Find the last closing brace and add a comment before it
        const lastBraceIndex = themeConfig.lastIndexOf('};');
        if (lastBraceIndex !== -1) {
            themeConfig = themeConfig.slice(0, lastBraceIndex) + newVarsComment + themeConfig.slice(lastBraceIndex);
        }
    }

    writeFileSync(themeConfigPath, themeConfig);

    console.log(chalk.green(`✓ Updated theme schema version to v${CURRENT_THEME_SCHEMA_VERSION}`));
    console.log();
    console.log(chalk.gray('New variables added as comments. Uncomment and customize as needed.'));
    console.log(chalk.gray('See ') + chalk.cyan('pika theme list') + chalk.gray(' for full variable documentation.'));
}

function generateNewVarsComment(changes: ThemeSchemaChange[]): string {
    if (changes.length === 0) return '';

    let comment = '\n    // ═══════════════════════════════════════════════════════════════════\n';
    comment += '    // NEW VARIABLES - Uncomment and customize as needed\n';
    comment += '    // ═══════════════════════════════════════════════════════════════════\n';
    
    for (const change of changes) {
        comment += `    // Version ${change.version} (${change.date}): ${change.description}\n`;
        comment += '    // cssVariables: { light: {\n';
        for (const v of change.addedVariables.slice(0, 5)) { // Show first 5
            comment += `    //     '${v.name}': '${v.defaultLight}',\n`;
        }
        if (change.addedVariables.length > 5) {
            comment += `    //     // ... and ${change.addedVariables.length - 5} more (run 'pika theme list' to see all)\n`;
        }
        comment += '    // } }\n';
    }

    return comment;
}

function listVariables(): void {
    console.log(chalk.cyan('\n📋 Theme Variables Reference\n'));
    console.log(chalk.gray(`Current schema version: v${CURRENT_THEME_SCHEMA_VERSION}`));
    console.log();

    const categories: Record<string, typeof THEME_SCHEMA_CHANGELOG[0]['addedVariables']> = {};
    
    for (const change of THEME_SCHEMA_CHANGELOG) {
        for (const v of change.addedVariables) {
            if (!categories[v.category]) {
                categories[v.category] = [];
            }
            categories[v.category].push(v);
        }
    }

    const categoryNames: Record<string, string> = {
        core: ' Core Brand Colors',
        surface: ' Surface & Background',
        border: ' Borders & Focus',
        status: ' Status Colors',
        sidebar: ' Sidebar',
        chart: ' Charts'
    };

    for (const [category, vars] of Object.entries(categories)) {
        console.log(chalk.cyan.bold(categoryNames[category] || category));
        console.log();
        
        for (const v of vars) {
            console.log(chalk.white(`  --${v.name}`));
            console.log(chalk.gray(`     ${v.description}`));
            console.log(chalk.gray(`     Light: ${v.defaultLight}`));
            if (v.defaultDark) {
                console.log(chalk.gray(`     Dark:  ${v.defaultDark}`));
            }
            console.log(chalk.gray(`     Used in: ${v.affectedElements.join(', ')}`));
            console.log();
        }
    }

    console.log(chalk.gray('━'.repeat(60)));
    console.log(chalk.gray('For full documentation, see: ') + chalk.cyan('https://pika.tools/guides/customization/ui'));
}

function showDocs(): void {
    console.log(chalk.cyan('\n Theme Documentation\n'));
    
    console.log(chalk.white.bold('Quick Start:'));
    console.log(chalk.gray('1. Enable theming in pika-config.ts:'));
    console.log(chalk.cyan('   customTheme: { enabled: true, themeConfigPath: "src/lib/custom/my-theme" }'));
    console.log();
    console.log(chalk.gray('2. Copy sample-purple-theme.ts and customize:'));
    console.log(chalk.gray('   cp apps/pika-chat/src/lib/custom/sample-purple-theme.ts apps/pika-chat/src/lib/custom/my-theme.ts'));
    console.log();
    console.log(chalk.gray('3. Run dev server - changes auto-reload via HMR'));
    console.log();

    console.log(chalk.white.bold('Color Format (OKLCH):'));
    console.log(chalk.gray('  oklch(lightness chroma hue)'));
    console.log(chalk.gray('  - Lightness: 0 (black) to 1 (white)'));
    console.log(chalk.gray('  - Chroma: 0 (gray) to ~0.4 (vivid)'));
    console.log(chalk.gray('  - Hue: 0-360 (color wheel)'));
    console.log();
    console.log(chalk.cyan('  Example: oklch(0.55 0.16 142) = medium-bright green'));
    console.log();

    console.log(chalk.white.bold('Commands:'));
    console.log(chalk.cyan('  pika theme check') + chalk.gray('  - Check if your theme is up to date'));
    console.log(chalk.cyan('  pika theme update') + chalk.gray(' - Add new variables to your config'));
    console.log(chalk.cyan('  pika theme list') + chalk.gray('   - List all available variables'));
    console.log(chalk.cyan('  pika theme docs') + chalk.gray('   - Show this documentation'));
    console.log();

    console.log(chalk.gray('Full documentation: ') + chalk.cyan('https://pika.tools/guides/customization/ui'));
}
