/**
 * Theme Schema Versioning System
 *
 * This module tracks changes to the theme variable system over time.
 * When new CSS variables are added to Pika's theme system, a new schema version
 * is created so users can be notified and optionally update their theme configs.
 *
 * Usage:
 * - `pika theme check` - Shows what's new since your schema version
 * - `pika theme update` - Adds new variables with suggested defaults
 *
 * @since 0.16.0
 */

import type { SemanticColorVariable } from './theme-types';

/**
 * The current theme schema version.
 * Increment this when adding new theme variables.
 */
export const CURRENT_THEME_SCHEMA_VERSION = 1;

/**
 * Represents a change in a theme schema version
 */
export interface ThemeSchemaChange {
    /** Version number (must be sequential) */
    version: number;
    /** Release date in ISO format */
    date: string;
    /** Brief description of changes */
    description: string;
    /** New CSS variables added in this version */
    addedVariables: {
        /** Variable name without -- prefix */
        name: string;
        /** Category for organization */
        category: ThemeVariableCategory;
        /** Description of what this variable controls */
        description: string;
        /** Suggested default value (oklch format preferred) */
        defaultLight: string;
        /** Suggested dark mode value */
        defaultDark?: string;
        /** What UI elements are affected */
        affectedElements: string[];
    }[];
    /** Variables that were deprecated */
    deprecatedVariables?: {
        name: string;
        replacement?: string;
        reason: string;
    }[];
}

/**
 * Categories for organizing theme variables
 */
export type ThemeVariableCategory =
    | 'core'
    | 'surface'
    | 'text'
    | 'border'
    | 'status'
    | 'sidebar'
    | 'chart'
    | 'brand';

/**
 * Complete documentation of a theme variable
 */
export interface ThemeVariableDoc {
    name: SemanticColorVariable | string;
    category: ThemeVariableCategory;
    description: string;
    defaultLight: string;
    defaultDark: string;
    affectedElements: string[];
    introduced: number; // Schema version when introduced
}

/**
 * Schema changelog - documents all changes to the theme system
 */
export const THEME_SCHEMA_CHANGELOG: ThemeSchemaChange[] = [
    {
        version: 1,
        date: '2026-01-19',
        description: 'Initial theme schema with core shadcn variables and Pika extensions',
        addedVariables: [
            // Core Colors
            {
                name: 'primary',
                category: 'core',
                description: 'Primary brand color for buttons, links, and key actions',
                defaultLight: 'oklch(0.514 0.146 255.748)',
                defaultDark: 'oklch(0.984 0.004 248.227)',
                affectedElements: ['Buttons (primary)', 'Links', 'Active states', 'Focus rings', 'Checkboxes', 'Radio buttons']
            },
            {
                name: 'primary-foreground',
                category: 'core',
                description: 'Text/icon color on primary backgrounds',
                defaultLight: 'oklch(0.984 0.004 248.227)',
                defaultDark: 'oklch(0.208 0.04 265.731)',
                affectedElements: ['Text on primary buttons', 'Icons on primary backgrounds']
            },
            {
                name: 'secondary',
                category: 'core',
                description: 'Secondary actions and less prominent elements',
                defaultLight: 'oklch(0.968 0.007 248.084)',
                defaultDark: 'oklch(0.28 0.037 259.981)',
                affectedElements: ['Secondary buttons', 'Badges', 'Tags']
            },
            {
                name: 'secondary-foreground',
                category: 'core',
                description: 'Text on secondary backgrounds',
                defaultLight: 'oklch(0.514 0.146 255.748)',
                defaultDark: 'oklch(0.984 0.004 248.227)',
                affectedElements: ['Text on secondary buttons']
            },
            {
                name: 'destructive',
                category: 'core',
                description: 'Destructive/danger actions like delete buttons',
                defaultLight: 'oklch(0.577 0.215 27.311)',
                defaultDark: 'oklch(0.396 0.133 25.712)',
                affectedElements: ['Delete buttons', 'Error buttons', 'Destructive actions']
            },
            {
                name: 'destructive-foreground',
                category: 'core',
                description: 'Text on destructive backgrounds',
                defaultLight: 'oklch(0.984 0.004 248.227)',
                defaultDark: 'oklch(0.984 0.004 248.227)',
                affectedElements: ['Text on delete buttons']
            },

            // Surface Colors
            {
                name: 'background',
                category: 'surface',
                description: 'Main page background',
                defaultLight: 'oklch(1 0 263.283)',
                defaultDark: 'oklch(0.137 0.036 258.532)',
                affectedElements: ['Page background', 'App background']
            },
            {
                name: 'foreground',
                category: 'surface',
                description: 'Default text color on backgrounds',
                defaultLight: 'oklch(0.501 0 263.283)',
                defaultDark: 'oklch(0.984 0.004 248.227)',
                affectedElements: ['Body text', 'Headings', 'Default text']
            },
            {
                name: 'card',
                category: 'surface',
                description: 'Card and elevated surface backgrounds',
                defaultLight: 'oklch(1 0 263.283)',
                defaultDark: 'oklch(0.137 0.036 258.532)',
                affectedElements: ['Cards', 'Dialogs', 'Elevated surfaces', 'Dropdowns']
            },
            {
                name: 'card-foreground',
                category: 'surface',
                description: 'Text on card backgrounds',
                defaultLight: 'oklch(0.137 0.036 258.532)',
                defaultDark: 'oklch(0.984 0.004 248.227)',
                affectedElements: ['Card text', 'Dialog text']
            },
            {
                name: 'popover',
                category: 'surface',
                description: 'Popover and tooltip backgrounds',
                defaultLight: 'oklch(1 0 263.283)',
                defaultDark: 'oklch(0.137 0.036 258.532)',
                affectedElements: ['Popovers', 'Tooltips', 'Dropdown menus']
            },
            {
                name: 'popover-foreground',
                category: 'surface',
                description: 'Text in popovers',
                defaultLight: 'oklch(0.137 0.036 258.532)',
                defaultDark: 'oklch(0.984 0.004 248.227)',
                affectedElements: ['Popover text', 'Tooltip text']
            },
            {
                name: 'muted',
                category: 'surface',
                description: 'Muted/subtle backgrounds',
                defaultLight: 'oklch(0.968 0.007 248.084)',
                defaultDark: 'oklch(0.28 0.037 259.981)',
                affectedElements: ['Disabled states', 'Tab backgrounds', 'Code blocks']
            },
            {
                name: 'muted-foreground',
                category: 'surface',
                description: 'Muted/secondary text',
                defaultLight: 'oklch(0.555 0.041 257.452)',
                defaultDark: 'oklch(0.711 0.035 256.803)',
                affectedElements: ['Placeholder text', 'Help text', 'Secondary labels']
            },
            {
                name: 'accent',
                category: 'surface',
                description: 'Accent backgrounds for highlights',
                defaultLight: 'oklch(0.968 0.007 248.084)',
                defaultDark: 'oklch(0.28 0.037 259.981)',
                affectedElements: ['Hover states', 'Selected rows', 'Accent highlights']
            },
            {
                name: 'accent-foreground',
                category: 'surface',
                description: 'Text on accent backgrounds',
                defaultLight: 'oklch(0.514 0.146 255.748)',
                defaultDark: 'oklch(0.984 0.004 248.227)',
                affectedElements: ['Text on highlighted items']
            },

            // Border & Input
            {
                name: 'border',
                category: 'border',
                description: 'Default border color',
                defaultLight: 'oklch(0.929 0.013 255.585)',
                defaultDark: 'oklch(0.28 0.037 259.981)',
                affectedElements: ['Card borders', 'Table borders', 'Dividers']
            },
            {
                name: 'input',
                category: 'border',
                description: 'Input field borders',
                defaultLight: 'oklch(0.929 0.013 255.585)',
                defaultDark: 'oklch(0.28 0.037 259.981)',
                affectedElements: ['Text inputs', 'Textareas', 'Select inputs']
            },
            {
                name: 'ring',
                category: 'border',
                description: 'Focus ring color',
                defaultLight: 'oklch(0.514 0.146 255.748)',
                defaultDark: 'oklch(0.625 0.05 253.665)',
                affectedElements: ['Focus outlines', 'Keyboard navigation indicators']
            },

            // Status Colors (Pika Extensions)
            {
                name: 'success',
                category: 'status',
                description: 'Success state color',
                defaultLight: 'oklch(0.55 0.16 142)',
                defaultDark: 'oklch(0.65 0.18 142)',
                affectedElements: ['Success messages', 'Checkmarks', 'Completed states']
            },
            {
                name: 'success-foreground',
                category: 'status',
                description: 'Text on success backgrounds',
                defaultLight: 'oklch(0.985 0 0)',
                defaultDark: 'oklch(0.15 0.02 142)',
                affectedElements: ['Text on success badges']
            },
            {
                name: 'success-bg',
                category: 'status',
                description: 'Success background for badges/alerts',
                defaultLight: 'oklch(0.95 0.05 142)',
                defaultDark: 'oklch(0.25 0.08 142)',
                affectedElements: ['Success alerts', 'Success badges background']
            },
            {
                name: 'warning',
                category: 'status',
                description: 'Warning state color',
                defaultLight: 'oklch(0.75 0.15 75)',
                defaultDark: 'oklch(0.70 0.15 75)',
                affectedElements: ['Warning messages', 'Caution indicators']
            },
            {
                name: 'warning-foreground',
                category: 'status',
                description: 'Text on warning backgrounds',
                defaultLight: 'oklch(0.20 0.02 45)',
                defaultDark: 'oklch(0.15 0.02 75)',
                affectedElements: ['Text on warning badges']
            },
            {
                name: 'warning-bg',
                category: 'status',
                description: 'Warning background for badges/alerts',
                defaultLight: 'oklch(0.95 0.05 75)',
                defaultDark: 'oklch(0.25 0.08 75)',
                affectedElements: ['Warning alerts', 'Warning badges background']
            },
            {
                name: 'info',
                category: 'status',
                description: 'Informational state color',
                defaultLight: 'oklch(0.55 0.15 250)',
                defaultDark: 'oklch(0.60 0.16 250)',
                affectedElements: ['Info messages', 'Help indicators']
            },
            {
                name: 'info-foreground',
                category: 'status',
                description: 'Text on info backgrounds',
                defaultLight: 'oklch(0.985 0 0)',
                defaultDark: 'oklch(0.15 0.02 250)',
                affectedElements: ['Text on info badges']
            },
            {
                name: 'info-bg',
                category: 'status',
                description: 'Info background for badges/alerts',
                defaultLight: 'oklch(0.93 0.05 250)',
                defaultDark: 'oklch(0.25 0.08 250)',
                affectedElements: ['Info alerts', 'Info badges background']
            },
            {
                name: 'ai',
                category: 'status',
                description: 'AI/assistant-specific color',
                defaultLight: 'oklch(0.55 0.2 280)',
                defaultDark: 'oklch(0.60 0.22 280)',
                affectedElements: ['AI status indicators', 'Assistant messages', 'Processing states']
            },
            {
                name: 'ai-foreground',
                category: 'status',
                description: 'Text on AI backgrounds',
                defaultLight: 'oklch(0.985 0 0)',
                defaultDark: 'oklch(0.15 0.02 280)',
                affectedElements: ['Text on AI badges']
            },
            {
                name: 'ai-bg',
                category: 'status',
                description: 'AI background for badges/indicators',
                defaultLight: 'oklch(0.93 0.05 280)',
                defaultDark: 'oklch(0.25 0.08 280)',
                affectedElements: ['AI status backgrounds', 'Processing indicators']
            },
            {
                name: 'danger-bg',
                category: 'status',
                description: 'Danger/error background for alerts',
                defaultLight: 'oklch(0.95 0.08 25)',
                defaultDark: 'oklch(0.25 0.10 25)',
                affectedElements: ['Error alerts', 'Danger badges background']
            },

            // Sidebar (for apps with sidebars)
            {
                name: 'sidebar-background',
                category: 'sidebar',
                description: 'Sidebar background color',
                defaultLight: 'oklch(0.985 0 263.283)',
                defaultDark: 'oklch(0.21 0.006 285.819)',
                affectedElements: ['Navigation sidebar background']
            },
            {
                name: 'sidebar-foreground',
                category: 'sidebar',
                description: 'Text in sidebar',
                defaultLight: 'oklch(0.37 0.012 285.746)',
                defaultDark: 'oklch(0.968 0.001 285.04)',
                affectedElements: ['Sidebar navigation text']
            },
            {
                name: 'sidebar-primary',
                category: 'sidebar',
                description: 'Primary/selected items in sidebar',
                defaultLight: 'oklch(0.21 0.006 285.819)',
                defaultDark: 'oklch(0.488 0.217 264.393)',
                affectedElements: ['Active sidebar items']
            },
            {
                name: 'sidebar-primary-foreground',
                category: 'sidebar',
                description: 'Text on selected sidebar items',
                defaultLight: 'oklch(0.985 0 263.283)',
                defaultDark: 'oklch(1 0 263.283)',
                affectedElements: ['Active sidebar item text']
            },
            {
                name: 'sidebar-accent',
                category: 'sidebar',
                description: 'Hover state in sidebar',
                defaultLight: 'oklch(0.968 0.001 285.04)',
                defaultDark: 'oklch(0.274 0.005 285.941)',
                affectedElements: ['Sidebar item hover background']
            },
            {
                name: 'sidebar-accent-foreground',
                category: 'sidebar',
                description: 'Text on hovered sidebar items',
                defaultLight: 'oklch(0.21 0.006 285.819)',
                defaultDark: 'oklch(0.968 0.001 285.04)',
                affectedElements: ['Sidebar item hover text']
            },
            {
                name: 'sidebar-border',
                category: 'sidebar',
                description: 'Sidebar border color',
                defaultLight: 'oklch(0.873 0.115 95.71)',
                defaultDark: 'oklch(0.712 0.141 92.714)',
                affectedElements: ['Sidebar dividers', 'Sidebar edge border']
            },
            {
                name: 'sidebar-ring',
                category: 'sidebar',
                description: 'Focus ring in sidebar',
                defaultLight: 'oklch(0.623 0.188 259.803)',
                defaultDark: 'oklch(0.623 0.188 259.803)',
                affectedElements: ['Sidebar focus indicators']
            },

            // Chart colors
            {
                name: 'chart-1',
                category: 'chart',
                description: 'First color in chart series',
                defaultLight: 'oklch(0.646 0.222 41.116)',
                defaultDark: 'oklch(0.488 0.243 264.376)',
                affectedElements: ['Chart series 1', 'Primary data visualization']
            },
            {
                name: 'chart-2',
                category: 'chart',
                description: 'Second color in chart series',
                defaultLight: 'oklch(0.6 0.118 184.704)',
                defaultDark: 'oklch(0.696 0.17 162.48)',
                affectedElements: ['Chart series 2']
            },
            {
                name: 'chart-3',
                category: 'chart',
                description: 'Third color in chart series',
                defaultLight: 'oklch(0.398 0.07 227.392)',
                defaultDark: 'oklch(0.769 0.188 70.08)',
                affectedElements: ['Chart series 3']
            },
            {
                name: 'chart-4',
                category: 'chart',
                description: 'Fourth color in chart series',
                defaultLight: 'oklch(0.828 0.189 84.429)',
                defaultDark: 'oklch(0.627 0.265 303.9)',
                affectedElements: ['Chart series 4']
            },
            {
                name: 'chart-5',
                category: 'chart',
                description: 'Fifth color in chart series',
                defaultLight: 'oklch(0.769 0.188 70.08)',
                defaultDark: 'oklch(0.645 0.246 16.439)',
                affectedElements: ['Chart series 5']
            }
        ]
    }
    // Future versions will be added here:
    // {
    //     version: 2,
    //     date: '202X-XX-XX',
    //     description: 'Added new variables...',
    //     addedVariables: [...]
    // }
];

/**
 * Get all theme variables introduced up to a specific version
 */
export function getVariablesForVersion(version: number): ThemeVariableDoc[] {
    const variables: ThemeVariableDoc[] = [];

    for (const change of THEME_SCHEMA_CHANGELOG) {
        if (change.version <= version) {
            for (const v of change.addedVariables) {
                variables.push({
                    name: v.name as SemanticColorVariable,
                    category: v.category,
                    description: v.description,
                    defaultLight: v.defaultLight,
                    defaultDark: v.defaultDark || v.defaultLight,
                    affectedElements: v.affectedElements,
                    introduced: change.version
                });
            }
        }
    }

    return variables;
}

/**
 * Get variables added between two schema versions
 */
export function getNewVariablesSince(fromVersion: number): ThemeSchemaChange[] {
    return THEME_SCHEMA_CHANGELOG.filter(change => change.version > fromVersion);
}

/**
 * Check if a theme config is up to date
 */
export function isThemeSchemaUpToDate(schemaVersion: number | undefined): boolean {
    return (schemaVersion || 1) >= CURRENT_THEME_SCHEMA_VERSION;
}

/**
 * Get all variables organized by category
 */
export function getVariablesByCategory(): Record<ThemeVariableCategory, ThemeVariableDoc[]> {
    const allVars = getVariablesForVersion(CURRENT_THEME_SCHEMA_VERSION);
    const byCategory: Record<ThemeVariableCategory, ThemeVariableDoc[]> = {
        core: [],
        surface: [],
        text: [],
        border: [],
        status: [],
        sidebar: [],
        chart: [],
        brand: []
    };

    for (const v of allVars) {
        byCategory[v.category].push(v);
    }

    return byCategory;
}

/**
 * Generate a theme config snippet with defaults for new variables
 */
export function generateThemeSnippetForNewVariables(
    fromVersion: number,
    mode: 'light' | 'dark' = 'light'
): string {
    const newChanges = getNewVariablesSince(fromVersion);
    if (newChanges.length === 0) {
        return '// Your theme is up to date!';
    }

    let snippet = `// New variables added since schema version ${fromVersion}:\n`;
    snippet += `// Add these to your cssVariables.${mode} object if you want to customize them:\n\n`;

    for (const change of newChanges) {
        snippet += `// Version ${change.version} (${change.date}): ${change.description}\n`;
        for (const v of change.addedVariables) {
            const value = mode === 'dark' && v.defaultDark ? v.defaultDark : v.defaultLight;
            snippet += `'${v.name}': '${value}', // ${v.description}\n`;
        }
        snippet += '\n';
    }

    return snippet;
}
