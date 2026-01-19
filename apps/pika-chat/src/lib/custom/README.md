# Custom Theme Configuration

This directory contains your project's custom theme configuration. Files in this directory are **protected from pika sync** - your changes will be preserved when you update from upstream.

## Quick Start

1. **Copy the sample theme** and customize it:

```bash
cp sample-purple-theme.ts my-theme.ts
```

2. **Edit your theme file** with your brand colors:

```typescript
export const themeConfig: ThemeConfig = {
    name: 'My Company Theme',
    fontFamily: '"Inter", sans-serif',
    cssVariables: {
        light: {
            'primary': 'oklch(0.55 0.16 195)',  // Your brand color
            'primary-foreground': 'oklch(1 0 0)',
        },
        dark: {
            'primary': 'oklch(0.70 0.14 195)',
        }
    }
};
```

3. **Enable theming** in `pika-config.ts` and point to your theme:

```typescript
siteFeatures: {
    uiCustomization: {
        customTheme: {
            enabled: true,
            // Path to your theme (without .ts extension)
            themeConfigPath: 'src/lib/custom/my-theme'
        }
    }
}
```

4. **Run dev server** - changes auto-reload via HMR:

```bash
pnpm run dev
```

## Files

- `sample-purple-theme.ts` - Sample theme to copy and customize

## Available Variables

### Core Semantic Colors
- `primary`, `primary-foreground` - Primary brand color
- `secondary`, `secondary-foreground` - Secondary actions
- `muted`, `muted-foreground` - Subtle backgrounds/text
- `accent`, `accent-foreground` - Highlights
- `destructive`, `destructive-foreground` - Errors/danger

### Extended Semantic Colors (Pika additions)
- `success`, `success-foreground`, `success-bg` - Success states
- `warning`, `warning-foreground`, `warning-bg` - Warning states
- `info`, `info-foreground`, `info-bg` - Informational
- `ai`, `ai-foreground`, `ai-bg` - AI/assistant actions
- `danger-bg` - Danger background

### UI Elements
- `background`, `foreground` - Page background/text
- `card`, `card-foreground` - Card elements
- `popover`, `popover-foreground` - Popovers/dropdowns
- `border`, `input`, `ring` - Borders and focus states

### Sidebar
- `sidebar-background`, `sidebar-foreground`
- `sidebar-primary`, `sidebar-primary-foreground`
- `sidebar-accent`, `sidebar-accent-foreground`
- `sidebar-border`, `sidebar-ring`

## Color Format

Use **oklch** format for best results:

```
oklch(lightness chroma hue)
```

- **Lightness**: 0 (black) to 1 (white)
- **Chroma**: 0 (gray) to ~0.4 (vivid)
- **Hue**: 0-360 (color wheel angle)

Example: `oklch(0.55 0.16 142)` = medium-bright green

## Web Components

If you're building web components, access theme tokens:

```typescript
import { getThemeVariable, getPikaThemeTokens } from 'pika-shared/util/wc-utils';

// Single variable
const primary = getThemeVariable('primary');

// All semantic tokens
const tokens = getPikaThemeTokens();
```

## Need Help?

See `sample-purple-theme.ts` for a complete reference, or visit the documentation at https://pika.tools/guides/customization/theming
