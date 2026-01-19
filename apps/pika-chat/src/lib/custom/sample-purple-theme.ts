/**
 * Sample Purple Theme
 *
 * This is a sample theme you can use as a starting point.
 * Copy this file, customize the values, and update themeConfigPath in pika-config.ts.
 *
 * To enable custom theming:
 * 1. Copy this file: cp sample-purple-theme.ts my-theme.ts
 * 2. Edit my-theme.ts with your brand colors
 * 3. Update pika-config.ts: themeConfigPath: 'src/lib/custom/my-theme'
 * 4. Set customTheme.enabled = true in pika-config.ts
 *
 * See the documentation for full theming guide: https://pika.tools/guides/customization/theming
 */

import type { ThemeConfig } from 'pika-shared/types/chatbot/theme-types';

export const themeConfig: ThemeConfig = {
    // Schema version - used by 'pika theme check' to notify of new variables
    schemaVersion: 1,

    name: 'Purple Brand Theme',
    fontFamily: '"Inter", Arial, Helvetica, sans-serif',

    cssVariables: {
        light: {
            // Primary brand (Purple)
            primary: 'oklch(0.47 0.2 290)',
            'primary-foreground': 'oklch(1 0 0)',

            // Custom header icon sizing
            'chat-app-header-icon-height': '28px',
            'chat-app-header-icon-gap': '8px',

            // Backgrounds
            background: 'oklch(1 0 0)',
            foreground: 'oklch(0.22 0.02 260)',
            card: 'oklch(1 0 0)',
            'card-foreground': 'oklch(0.22 0.02 260)',
            muted: 'oklch(0.97 0.002 260)',
            'muted-foreground': 'oklch(0.45 0.03 260)',

            // Borders
            border: 'oklch(0.88 0.01 260)',
            input: 'oklch(0.88 0.01 260)',
            ring: 'oklch(0.55 0.15 250)',

            // Semantic colors
            destructive: 'oklch(0.55 0.2 25)',
            'destructive-bg': 'oklch(0.95 0.06 25)',
            success: 'oklch(0.50 0.15 145)',
            'success-bg': 'oklch(0.92 0.08 145)',
            warning: 'oklch(0.60 0.15 75)',
            'warning-bg': 'oklch(0.96 0.05 75)',
            info: 'oklch(0.52 0.14 250)',
            'info-bg': 'oklch(0.93 0.05 250)',
            ai: 'oklch(0.52 0.18 280)',
            'ai-bg': 'oklch(0.93 0.05 280)'
        },
        dark: {
            primary: 'oklch(0.70 0.18 290)',
            'primary-foreground': 'oklch(0.15 0.02 290)',

            // Custom header icon sizing
            'chat-app-header-icon-height': '28px',
            'chat-app-header-icon-gap': '8px',

            background: 'oklch(0.15 0.02 260)',
            foreground: 'oklch(0.95 0.005 260)',
            card: 'oklch(0.18 0.02 260)',
            'card-foreground': 'oklch(0.95 0.005 260)',
            muted: 'oklch(0.22 0.02 260)',
            'muted-foreground': 'oklch(0.65 0.02 260)',
            border: 'oklch(0.30 0.02 260)',
            input: 'oklch(0.30 0.02 260)',

            // Dark mode semantic colors
            destructive: 'oklch(0.55 0.2 25)',
            'destructive-bg': 'oklch(0.25 0.08 25)',
            success: 'oklch(0.65 0.18 145)',
            'success-bg': 'oklch(0.25 0.08 145)',
            warning: 'oklch(0.70 0.15 75)',
            'warning-bg': 'oklch(0.25 0.08 75)',
            info: 'oklch(0.60 0.16 250)',
            'info-bg': 'oklch(0.25 0.08 250)',
            ai: 'oklch(0.60 0.22 280)',
            'ai-bg': 'oklch(0.25 0.08 280)'
        }
    },

    // Custom header icon - separate icons for light/dark modes
    // chatAppHeaderIcon: {
    //     light: '/custom/assets/ai-light-mode-theme-sample.png',  // Icon shown in light mode
    //     dark: '/custom/assets/ai-dark-mode-theme-sample.png'     // Icon shown in dark mode
    // },

    customPalettes: {
        brand: {
            '50': 'oklch(0.97 0.01 290)',
            '100': 'oklch(0.94 0.02 290)',
            '200': 'oklch(0.88 0.05 290)',
            '300': 'oklch(0.78 0.10 290)',
            '400': 'oklch(0.62 0.15 290)',
            '500': 'oklch(0.47 0.2 290)',
            '600': 'oklch(0.40 0.18 290)',
            '700': 'oklch(0.33 0.15 290)',
            '800': 'oklch(0.26 0.12 290)',
            '900': 'oklch(0.20 0.08 290)'
        }
    }
};
