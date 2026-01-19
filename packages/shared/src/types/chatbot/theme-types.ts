/**
 * Theme Types for Pika UI Customization
 *
 * These types define the structure of theme configuration for clone projects.
 * Import via: import type { ThemeConfig } from 'pika-shared/types/chatbot/theme-types';
 *
 * @since 0.16.0
 */

/**
 * Theme configuration for Pika Chat
 *
 * Clone projects copy sample-purple-theme.ts, customize it, and update themeConfigPath
 * in pika-config.ts to point to their theme file.
 *
 * @example
 * ```typescript
 * import type { ThemeConfig } from 'pika-shared/types/chatbot/theme-types';
 *
 * export const themeConfig: ThemeConfig = {
 *     name: 'Acme Corp Theme',
 *     fontFamily: '"Inter", sans-serif',
 *     cssVariables: {
 *         light: {
 *             'primary': 'oklch(0.47 0.2 290)',
 *             'primary-foreground': 'oklch(1 0 0)',
 *         },
 *         dark: {
 *             'primary': 'oklch(0.70 0.18 290)',
 *         }
 *     }
 * };
 * ```
 *
 * @since 0.16.0
 */
export interface ThemeConfig {
    /**
     * Schema version of this theme configuration.
     * Used by `pika theme check` to notify you of new theme variables.
     * See theme-schema.ts for the changelog of schema versions.
     *
     * @default 1 (if not specified)
     * @example schemaVersion: 1
     */
    schemaVersion?: number;

    /**
     * Display name for this theme (for documentation/debugging)
     * @example 'Acme Corp Brand Theme'
     */
    name?: string;

    /**
     * Font family override. Applied to --font-sans CSS variable.
     * @example '"Figtree", Arial, Helvetica, sans-serif'
     */
    fontFamily?: string;

    /**
     * CSS custom properties to override.
     * Keys are CSS variable names WITHOUT the -- prefix.
     * Values should be valid CSS color values (oklch preferred for modern color handling).
     *
     * @example
     * ```typescript
     * cssVariables: {
     *     light: {
     *         'primary': 'oklch(0.47 0.2 290)',
     *         'border': 'oklch(0.88 0.01 260)',
     *     },
     *     dark: {
     *         'primary': 'oklch(0.70 0.18 290)',
     *     }
     * }
     * ```
     */
    cssVariables?: {
        /** Light mode variable overrides */
        light?: Record<string, string>;
        /** Dark mode variable overrides */
        dark?: Record<string, string>;
    };

    /**
     * Custom color palettes for your brand.
     * Creates CSS variables like --{paletteName}-{shade}
     *
     * @example
     * ```typescript
     * customPalettes: {
     *     brand: {
     *         '50': 'oklch(0.97 0.01 290)',
     *         '500': 'oklch(0.47 0.2 290)',
     *         '900': 'oklch(0.20 0.08 290)',
     *     }
     * }
     * ```
     */
    customPalettes?: Record<string, Record<string, string>>;

    /**
     * Custom header icon for chat apps. Replaces the default AI sparkle icon.
     * The icon will be constrained to roughly 44x44px.
     *
     * Can be specified as:
     * - A single string URL (used for both light and dark modes)
     * - An object with separate light/dark URLs for mode-specific icons
     *
     * For sync-safe storage, place your icons in:
     * `apps/pika-chat/static/custom/assets/`
     *
     * @example Single icon for both modes:
     * ```typescript
     * chatAppHeaderIcon: '/custom/assets/my-logo.svg'
     * ```
     *
     * @example Separate icons for light/dark modes:
     * ```typescript
     * chatAppHeaderIcon: {
     *     light: '/custom/assets/logo-dark.svg',   // Dark logo on light background
     *     dark: '/custom/assets/logo-light.svg'    // Light logo on dark background
     * }
     * ```
     *
     * @since 0.16.4
     */
    chatAppHeaderIcon?: string | {
        /** Icon URL for light mode */
        light: string;
        /** Icon URL for dark mode (falls back to light if not provided) */
        dark?: string;
    };
}

/**
 * Configuration for the custom theme feature in pika-config.ts
 *
 * @since 0.16.0
 */
export interface CustomThemeConfig {
    /**
     * Whether custom theming is enabled.
     * If false, the default Pika theme is used and the theme config is not loaded.
     */
    enabled: boolean;

    /**
     * Path to theme config file relative to apps/pika-chat/
     * The file must export a `themeConfig` object of type ThemeConfig.
     *
     * @default 'src/lib/custom/sample-purple-theme'
     * @example 'src/lib/custom/my-theme' imports from 'apps/pika-chat/src/lib/custom/my-theme.ts'
     */
    themeConfigPath?: string;
}

/**
 * Standard semantic variable names that can be overridden in a theme.
 * These are the shadcn-svelte standard variables plus Pika extensions.
 *
 * @since 0.16.0
 */
export type SemanticColorVariable =
    // Core shadcn variables
    | 'background'
    | 'foreground'
    | 'card'
    | 'card-foreground'
    | 'popover'
    | 'popover-foreground'
    | 'primary'
    | 'primary-foreground'
    | 'secondary'
    | 'secondary-foreground'
    | 'muted'
    | 'muted-foreground'
    | 'accent'
    | 'accent-foreground'
    | 'destructive'
    | 'destructive-foreground'
    | 'destructive-bg'
    | 'border'
    | 'input'
    | 'ring'
    // Chart colors
    | 'chart-1'
    | 'chart-2'
    | 'chart-3'
    | 'chart-4'
    | 'chart-5'
    // Sidebar variants
    | 'sidebar-background'
    | 'sidebar-foreground'
    | 'sidebar-primary'
    | 'sidebar-primary-foreground'
    | 'sidebar-accent'
    | 'sidebar-accent-foreground'
    | 'sidebar-border'
    | 'sidebar-ring'
    // Pika extended semantic colors
    | 'success'
    | 'success-foreground'
    | 'success-bg'
    | 'warning'
    | 'warning-foreground'
    | 'warning-bg'
    | 'info'
    | 'info-foreground'
    | 'info-bg'
    | 'ai'
    | 'ai-foreground'
    | 'ai-bg'
    | 'danger-bg'
    // Header/branding
    | 'chat-app-icon'
    | 'chat-app-header-icon-height'
    | 'chat-app-header-icon-gap';

/**
 * All semantic variables as a readonly array for iteration
 *
 * @since 0.16.0
 */
export const SEMANTIC_COLOR_VARIABLES: readonly SemanticColorVariable[] = [
    // Core
    'background',
    'foreground',
    'card',
    'card-foreground',
    'popover',
    'popover-foreground',
    'primary',
    'primary-foreground',
    'secondary',
    'secondary-foreground',
    'muted',
    'muted-foreground',
    'accent',
    'accent-foreground',
    'destructive',
    'destructive-foreground',
    'destructive-bg',
    'border',
    'input',
    'ring',
    // Charts
    'chart-1',
    'chart-2',
    'chart-3',
    'chart-4',
    'chart-5',
    // Sidebar
    'sidebar-background',
    'sidebar-foreground',
    'sidebar-primary',
    'sidebar-primary-foreground',
    'sidebar-accent',
    'sidebar-accent-foreground',
    'sidebar-border',
    'sidebar-ring',
    // Extended
    'success',
    'success-foreground',
    'success-bg',
    'warning',
    'warning-foreground',
    'warning-bg',
    'info',
    'info-foreground',
    'info-bg',
    'ai',
    'ai-foreground',
    'ai-bg',
    'danger-bg',
    // Header/branding
    'chat-app-icon',
    'chat-app-header-icon-height',
    'chat-app-header-icon-gap'
] as const;
