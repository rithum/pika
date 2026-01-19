# Theme Examples

This directory contains example theme configurations you can use as starting points.

## Available Examples

### Purple Brand Theme (`purple-brand-theme.ts`)

A complete corporate brand theme demonstrating:
- Purple primary color with full light/dark mode support
- Custom status colors harmonized with the brand
- Full color palette with 10 shades

## How to Use

1. **Copy to theme-config.ts**
   ```bash
   cp purple-brand-theme.ts ../theme-config.ts
   ```

2. **Enable theming** in `pika-config.ts`:
   ```typescript
   siteFeatures: {
       uiCustomization: {
           customTheme: { enabled: true }
       }
   }
   ```

3. **Customize** the values in `theme-config.ts` to match your brand.

## Creating Your Own Theme

### Quick Start

```typescript
import type { ThemeConfig } from 'pika-shared/types/chatbot/theme-types';

export const themeConfig: ThemeConfig = {
    schemaVersion: 1,
    name: 'My Brand Theme',
    
    cssVariables: {
        light: {
            primary: 'oklch(0.55 0.2 YOUR_HUE)',
            'primary-foreground': 'oklch(1 0 0)',
        }
    }
};
```

### OKLCH Color Format

```
oklch(lightness chroma hue)
```

| Component | Range | Description |
|-----------|-------|-------------|
| Lightness | 0-1 | 0 = black, 1 = white |
| Chroma | 0-0.4 | 0 = gray, higher = more vibrant |
| Hue | 0-360 | Color wheel position |

### Common Hue Values

| Hue | Color |
|-----|-------|
| 25 | Red |
| 75 | Amber/Orange |
| 142 | Green |
| 195 | Teal |
| 250 | Blue |
| 290 | Purple |

## Theme Management CLI

```bash
# Check if your theme is current
pika theme check

# Add new variables when schema updates
pika theme update

# List all available variables
pika theme list

# Show documentation
pika theme docs
```

## Documentation

Full theming documentation: https://pika.tools/guides/customization/theming
