# UI Customization Implementation Plan

## Executive Summary

This document outlines the implementation plan for enabling comprehensive UI customization in the Pika Framework, allowing cloned projects to customize colors, typography, and styling to conform to their corporate brand guidelines.

**Key Goal**: Allow developers who clone Pika to customize the UI theme without modifying core shadcn components, while providing a mechanism for web components (both Svelte and non-Svelte) to access and use these theme tokens.

**Key Constraint**: No modifications to shadcn components. All customization through CSS variables only.

---

## Implementation Philosophy

**Do it once. Do it completely. Do it right.**

This task is straightforward but requires thoroughness. We will NOT iterate:
- Every hardcoded color will be found and fixed in a single pass
- All semantic variables will be added at once
- All documentation will be created completely
- Testing will be comprehensive before marking complete

The `temp-color-discovery.json` file contains the exhaustive audit results. Use it as the single source of truth for all color-related changes.

---

## Current Architecture Analysis

### How Theming Currently Works

1. **CSS Custom Properties (`:root` variables)**
   - Defined in `apps/pika-chat/src/app.css` and `packages/pika-ux/src/app.css`
   - Use oklch() color format for modern color handling
   - Variables cascade through the DOM

2. **shadcn-svelte Components**
   - Components reference CSS variables via Tailwind classes (e.g., `bg-primary`, `text-foreground`)
   - Component variants are defined in tailwind-variants (`tv()`)
   - Components do NOT hardcode colors—they use semantic variable names

3. **Tailwind v4 Integration**
   - `@theme inline` block maps CSS variables to Tailwind color utilities
   - Classes like `bg-primary`, `text-muted-foreground` are auto-generated from variables

4. **Current Semantic Variables** (shadcn standard):
   ```css
   --background, --foreground
   --card, --card-foreground
   --popover, --popover-foreground
   --primary, --primary-foreground
   --secondary, --secondary-foreground
   --muted, --muted-foreground
   --accent, --accent-foreground
   --destructive, --destructive-foreground
   --border, --input, --ring
   --chart-1 through --chart-5
   --sidebar-* variants
   ```

5. **Current Custom Variables** (Pika-specific):
   ```css
   --gold-50 through --gold-900
   --goldbrighter-50 through --goldbrighter-900
   --goldhighlight-50 through --goldhighlight-900
   --blueish-50 through --blueish-900
   --blueishd-50 through --blueishd-900
   --bluebright-50 through --bluebright-900
   --prominent-50 through --prominent-900
   --gray-50 through --gray-900
   ```

---

## Key Design Decisions

### 1. File Location and Sync Protection

Theme customization files will live in `apps/pika-chat/src/lib/custom/`:

```
apps/pika-chat/src/lib/custom/
├── theme-config.ts       # Main theme configuration
└── theme/                # Additional theme-related files if needed
    └── ...
```

**Why this location?**
- Any path segment starting with `custom-` is automatically protected from sync
- Keeps all customizations organized in one place
- Clear separation from framework code

### 2. Configuration in pika-config.ts

Theme enabling/disabling controlled via `pika-config.ts` under `siteFeatures.uiCustomization`:

```typescript
siteFeatures: {
    uiCustomization: {
        featureId: 'uiCustomization',
        enabled: true,
        showUserRegionInLeftNav: false,
        showChatHistoryInStandaloneMode: true,
        
        // NEW: Custom theming
        customTheme: {
            enabled: false,  // Toggle on/off - false uses default Pika theme
            // Path relative to apps/pika-chat/src/lib/
            themeConfigPath: 'custom/theme-config',
        }
    }
}
```

### 3. Build-Time Integration via Vite Plugin

Following the pattern of `site-features-vite-plugin`, we will create a `theme-vite-plugin` that:

1. Reads theme config at build start
2. Generates CSS file with theme variables
3. Watches for changes in dev mode
4. Triggers full reload when theme changes
5. Provides instant feedback during theme development

### 4. No shadcn Component Modifications

All theming achieved through:
- CSS variable overrides
- Additional semantic variables (success, warning, info, ai)
- Custom Tailwind utility classes

---

## Implementation Phases

### Phase 0: Codebase Color Audit ✅ COMPLETE

**Status**: COMPLETE - All findings documented in `temp-color-discovery.json`

**Goal**: Systematically discover and document all hardcoded colors and understand why custom palettes (gold, blueish, etc.) were created.

#### Scope Clarification

**IN SCOPE:**
- `apps/pika-chat/src` - ALL hardcoded colors
- `packages/pika-ux/src/pika` - ALL hardcoded colors  
- `packages/pika-ux/src/shadcn` - verified clean (no hardcoded colors)
- `packages/pika-cli/src/commands/component.ts` - generated component template

**OUT OF SCOPE:**
- `apps/pika-docs` - Separate Starlight/Astro site with its own theming system. NO CHANGES NEEDED.
- `docs/` folder - Internal documentation
- SVG diagrams and mermaid charts
- Code examples in documentation

**LOWER PRIORITY:**
- `services/samples` - Example widgets (clone projects typically replace)

#### Summary of Findings

| Category | Count | Notes |
|----------|-------|-------|
| Hardcoded hex colors | 19 | In core pika-chat/pika-ux |
| rgba colors | 2 | Shadows in trace.svelte |
| Arbitrary Tailwind colors | 1 | `dark:bg-[#303030]` |
| Tailwind named colors | ~330 | Need semantic mapping |
| SCSS hardcoded colors | 8 | github.scss |
| Broken CSS classes | 4 | token-* classes that don't exist |
| CLI template colors | 4 | Generated component styles |

#### Critical Issues Found

1. **BROKEN CSS CLASSES** in `chat-input.svelte`:
   - `border-token-border-default`, `bg-token-bg-primary`, `text-token-text-primary`, `text-token-text-tertiary`
   - These classes are NOT DEFINED anywhere and do nothing
   - Must replace with `border-border`, `bg-card`, `text-foreground`, `text-muted-foreground`

2. **Hardcoded colors** requiring immediate replacement (see detailed list in temp-color-discovery.json)

3. **Custom palettes** (gold, blueish, bluebright, prominent):
   - Already properly used via semantic variables
   - Clone projects override semantics, not palette definitions
   - No changes needed to palette system

#### Detailed Findings

All findings with exact file paths, line numbers, colors, and suggested mappings are in:
**`/temp-color-discovery.json`** - Use this as the single source of truth

---

### Phase 1: Type System & Config

**Goal**: Extend the type system and configuration to support theming.

#### 1.1 - Extend UiCustomizationFeature Type

Update `packages/shared/src/types/chatbot/chatbot-types.ts`:

```typescript
export interface CustomThemeConfig {
    /** Whether custom theming is enabled. If false, default Pika theme is used. */
    enabled: boolean;
    /** 
     * Path to theme config file relative to apps/pika-chat/src/lib/
     * @example 'custom/theme-config' imports from 'apps/pika-chat/src/lib/custom/theme-config.ts'
     */
    themeConfigPath?: string;
}

export interface UiCustomizationFeature {
    enabled: boolean;
    showChatHistoryInStandaloneMode?: boolean;
    showUserRegionInLeftNav?: boolean;
    
    /** Custom theme configuration */
    customTheme?: CustomThemeConfig;
}
```

#### 1.2 - Create Theme Config Type Definitions

Create `packages/shared/src/types/chatbot/theme-types.ts`:

```typescript
/**
 * Theme configuration for Pika Chat
 * 
 * Clone projects override this in apps/pika-chat/src/lib/custom/theme-config.ts
 */
export interface ThemeConfig {
    /** 
     * Display name for this theme (for documentation/debugging)
     * @example 'Acme Corp Brand Theme'
     */
    name?: string;
    
    /** 
     * Font family override
     * @example '"Figtree", Arial, Helvetica, sans-serif'
     */
    fontFamily?: string;
    
    /** 
     * CSS custom properties to override.
     * Keys are CSS variable names WITHOUT the -- prefix.
     * Values should be valid CSS color values (oklch preferred).
     */
    cssVariables?: {
        /** Light mode variable overrides */
        light?: Record<string, string>;
        /** Dark mode variable overrides */
        dark?: Record<string, string>;
    };
    
    /**
     * Custom color palettes (like gold, blueish in default theme)
     * Clone projects can define their own brand palettes here.
     */
    customPalettes?: Record<string, Record<string, string>>;
}

/** 
 * Standard semantic variable names that can be overridden 
 */
export type SemanticColorVariable = 
    | 'background' | 'foreground'
    | 'card' | 'card-foreground'
    | 'popover' | 'popover-foreground'
    | 'primary' | 'primary-foreground'
    | 'secondary' | 'secondary-foreground'
    | 'muted' | 'muted-foreground'
    | 'accent' | 'accent-foreground'
    | 'destructive' | 'destructive-foreground'
    | 'border' | 'input' | 'ring'
    // Extended semantic colors
    | 'success' | 'success-foreground' | 'success-bg'
    | 'warning' | 'warning-foreground' | 'warning-bg'
    | 'info' | 'info-foreground' | 'info-bg'
    | 'ai' | 'ai-foreground' | 'ai-bg'
    | 'danger-bg';
```

#### 1.3 - Update pika-config.ts with Theme Config

Add to existing `pika-config.ts`:

```typescript
siteFeatures: {
    // ... existing config ...
    uiCustomization: {
        featureId: 'uiCustomization',
        enabled: true,
        showUserRegionInLeftNav: false,
        showChatHistoryInStandaloneMode: true,
        customTheme: {
            enabled: false,  // Set to true to enable custom theming
            themeConfigPath: 'custom/theme-config'
        }
    }
}
```

---

### Phase 2: Theme Vite Plugin

**Goal**: Create a Vite plugin that generates theme CSS at build time with HMR support.

#### 2.1 - Create Theme Vite Plugin

Create `apps/pika-chat/tools/theme-vite-plugin/theme-vite-plugin.ts`:

```typescript
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { createJiti } from 'jiti';
import * as path from 'path';
import { format } from 'prettier';
import { fileURLToPath } from 'url';
import type { HmrContext, Plugin, ViteDevServer } from 'vite';
import type { PikaConfig } from '../../../../packages/shared/src/types/chatbot/chatbot-types';
import type { ThemeConfig } from '../../../../packages/shared/src/types/chatbot/theme-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generatedThemeCssFileName = 'generated-theme.css';
const chatWebAppStylesDirName = 'apps/pika-chat/src/lib/styles';
const pikaConfigFileName = 'pika-config.ts';

export async function themeVitePlugin(): Promise<Plugin> {
    let server: ViteDevServer | null = null;
    let pikaConfigAbsolutePath: string | undefined;
    let themeConfigAbsolutePath: string | undefined;

    return {
        name: 'theme-vite-plugin',

        async buildStart() {
            await generateThemeCss();
        },

        configureServer: (_server) => {
            server = _server;
            pikaConfigAbsolutePath = findPathToPikaConfig();
            
            if (pikaConfigAbsolutePath) {
                _server.watcher.add(pikaConfigAbsolutePath);
                
                // Also watch the theme config file if it exists
                const themeConfigPath = getThemeConfigPath(pikaConfigAbsolutePath);
                if (themeConfigPath && existsSync(themeConfigPath)) {
                    themeConfigAbsolutePath = themeConfigPath;
                    _server.watcher.add(themeConfigAbsolutePath);
                }
            }
        },

        async handleHotUpdate(ctx: HmrContext) {
            const changedFile = path.resolve(ctx.file);
            
            // Regenerate theme if pika-config.ts or theme-config.ts changes
            if (
                (pikaConfigAbsolutePath && changedFile === path.resolve(pikaConfigAbsolutePath)) ||
                (themeConfigAbsolutePath && changedFile === path.resolve(themeConfigAbsolutePath))
            ) {
                try {
                    console.log('[theme-vite-plugin] Theme config changed, regenerating CSS...');
                    await generateThemeCss();
                    
                    ctx.server.ws.send({
                        type: 'full-reload',
                        path: '*'
                    });
                } catch (error) {
                    console.error('[theme-vite-plugin] Failed to regenerate theme:', error);
                }
                return [];
            }
        }
    };
}

function findPathToPikaConfig(): string | undefined {
    let currentDir = __dirname;
    while (currentDir !== '/' && currentDir !== path.parse(currentDir).root) {
        const candidate = path.join(currentDir, pikaConfigFileName);
        if (existsSync(candidate)) {
            return path.resolve(candidate);
        }
        currentDir = path.dirname(currentDir);
    }
    return undefined;
}

function getThemeConfigPath(pikaConfigPath: string): string | undefined {
    // This would need to read pika-config to get the theme config path
    // Implementation will parse the config and resolve the path
    // For now, return the default path
    const projectRoot = path.dirname(pikaConfigPath);
    return path.join(projectRoot, 'apps/pika-chat/src/lib/custom/theme-config.ts');
}

async function generateThemeCss(): Promise<void> {
    const pikaConfigPath = findPathToPikaConfig();
    if (!pikaConfigPath) {
        console.log('[theme-vite-plugin] No pika-config.ts found, skipping theme generation');
        return;
    }

    // Load pika-config.ts
    const jiti = createJiti(import.meta.url, { cache: false, requireCache: false });
    const pikaConfigModule = (await jiti.import(pikaConfigPath)) as { pikaConfig: PikaConfig };
    const pikaConfig = pikaConfigModule.pikaConfig;

    const customTheme = pikaConfig.siteFeatures?.uiCustomization?.customTheme;
    
    // If custom theme is disabled, generate empty CSS
    if (!customTheme?.enabled) {
        console.log('[theme-vite-plugin] Custom theme disabled, using default theme');
        await writeThemeCss('/* Custom theme disabled - using default Pika theme */\n', pikaConfigPath);
        return;
    }

    // Load theme config
    const themeConfigPath = getThemeConfigPath(pikaConfigPath);
    if (!themeConfigPath || !existsSync(themeConfigPath)) {
        console.warn('[theme-vite-plugin] Theme config file not found:', themeConfigPath);
        await writeThemeCss('/* Theme config not found */\n', pikaConfigPath);
        return;
    }

    const themeModule = (await jiti.import(themeConfigPath)) as { themeConfig: ThemeConfig };
    const themeConfig = themeModule.themeConfig;

    if (!themeConfig) {
        console.warn('[theme-vite-plugin] No themeConfig export found in theme config file');
        await writeThemeCss('/* No theme config exported */\n', pikaConfigPath);
        return;
    }

    // Generate CSS from theme config
    const css = generateCssFromThemeConfig(themeConfig);
    await writeThemeCss(css, pikaConfigPath);
    
    console.log(`[theme-vite-plugin] Generated theme CSS: ${themeConfig.name || 'Custom Theme'}`);
}

function generateCssFromThemeConfig(config: ThemeConfig): string {
    let css = `/**
 * Generated Theme CSS
 * Theme: ${config.name || 'Custom Theme'}
 * Generated at: ${new Date().toISOString()}
 * DO NOT EDIT - This file is auto-generated by theme-vite-plugin
 */

`;

    // Font family override
    if (config.fontFamily) {
        css += `@layer base {
    :root {
        --font-sans: ${config.fontFamily};
    }
    body {
        font-family: var(--font-sans);
    }
}

`;
    }

    // Light mode variables
    if (config.cssVariables?.light && Object.keys(config.cssVariables.light).length > 0) {
        css += `:root {\n`;
        for (const [key, value] of Object.entries(config.cssVariables.light)) {
            css += `    --${key}: ${value};\n`;
        }
        css += `}\n\n`;
    }

    // Dark mode variables
    if (config.cssVariables?.dark && Object.keys(config.cssVariables.dark).length > 0) {
        css += `.dark {\n`;
        for (const [key, value] of Object.entries(config.cssVariables.dark)) {
            css += `    --${key}: ${value};\n`;
        }
        css += `}\n\n`;
    }

    // Custom palettes
    if (config.customPalettes) {
        css += `/* Custom Palettes */\n:root {\n`;
        for (const [paletteName, shades] of Object.entries(config.customPalettes)) {
            for (const [shade, value] of Object.entries(shades)) {
                css += `    --${paletteName}-${shade}: ${value};\n`;
            }
        }
        css += `}\n`;
    }

    return css;
}

async function writeThemeCss(css: string, pikaConfigPath: string): Promise<void> {
    const projectRoot = path.dirname(pikaConfigPath);
    const stylesDir = path.join(projectRoot, chatWebAppStylesDirName);
    
    // Ensure styles directory exists
    if (!existsSync(stylesDir)) {
        const { mkdirSync } = await import('fs');
        mkdirSync(stylesDir, { recursive: true });
    }
    
    const outputPath = path.join(stylesDir, generatedThemeCssFileName);
    writeFileSync(outputPath, css, 'utf8');
}
```

#### 2.2 - Integrate Plugin into vite.config.ts

Update `apps/pika-chat/vite.config.ts`:

```typescript
import { themeVitePlugin } from './tools/theme-vite-plugin/theme-vite-plugin';

export default defineConfig(async () => {
    return {
        plugins: [
            tailwindcss(),
            siteFeaturesVitePlugin(),
            themeVitePlugin(),  // Add theme plugin
            sveltekit(),
            Icons({ compiler: 'svelte' })
        ],
        // ... rest of config
    };
});
```

#### 2.3 - Import Generated Theme CSS

Update `apps/pika-chat/src/app.css`:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import './lib/styles/generated-theme.css';  /* Add this line */

/* ... rest of existing CSS ... */
```

---

### Phase 3: Semantic Color Extension

**Goal**: Add semantic color tokens that map to common UI needs.

#### 3.1 - Add Semantic Variables to app.css

Update `apps/pika-chat/src/app.css` to include extended semantic colors:

```css
@layer base {
    :root {
        /* ...existing variables... */
        
        /* Extended semantic colors */
        --success: oklch(0.55 0.16 142);
        --success-foreground: oklch(0.985 0 0);
        --success-bg: oklch(0.95 0.05 142);
        
        --warning: oklch(0.75 0.15 75);
        --warning-foreground: oklch(0.2 0.02 45);
        --warning-bg: oklch(0.95 0.05 75);
        
        --info: oklch(0.55 0.15 250);
        --info-foreground: oklch(0.985 0 0);
        --info-bg: oklch(0.93 0.05 250);
        
        --ai: oklch(0.55 0.2 280);
        --ai-foreground: oklch(0.985 0 0);
        --ai-bg: oklch(0.93 0.05 280);
        
        --danger-bg: oklch(0.95 0.08 25);
    }
    
    .dark {
        /* Dark mode semantic colors */
        --success: oklch(0.65 0.18 142);
        --success-bg: oklch(0.25 0.08 142);
        
        --warning: oklch(0.70 0.15 75);
        --warning-bg: oklch(0.25 0.08 75);
        
        --info: oklch(0.60 0.16 250);
        --info-bg: oklch(0.25 0.08 250);
        
        --ai: oklch(0.60 0.22 280);
        --ai-bg: oklch(0.25 0.08 280);
        
        --danger-bg: oklch(0.25 0.10 25);
    }
}

@theme inline {
    /* ...existing mappings... */
    
    /* Extended semantic color mappings */
    --color-success: var(--success);
    --color-success-foreground: var(--success-foreground);
    --color-success-bg: var(--success-bg);
    --color-warning: var(--warning);
    --color-warning-foreground: var(--warning-foreground);
    --color-warning-bg: var(--warning-bg);
    --color-info: var(--info);
    --color-info-foreground: var(--info-foreground);
    --color-info-bg: var(--info-bg);
    --color-ai: var(--ai);
    --color-ai-foreground: var(--ai-foreground);
    --color-ai-bg: var(--ai-bg);
    --color-danger-bg: var(--danger-bg);
}
```

#### 3.2 - Sync Changes to pika-ux

Mirror the same changes in `packages/pika-ux/src/app.css` to ensure consistency for standalone pika-ux usage.

---

### Phase 4: Refactor Hardcoded Colors

**Goal**: Replace ALL hardcoded colors discovered in Phase 0 in a single comprehensive pass.

**Philosophy**: Do it once, do it completely. No iteration - fix everything in this phase.

#### 4.1 - Fix CRITICAL Issues First

**Broken CSS classes in chat-input.svelte (lines 135, 188):**
| Broken Class | Replace With |
|--------------|--------------|
| `border-token-border-default` | `border-border` |
| `bg-token-bg-primary` | `bg-card` |
| `text-token-text-primary` | `text-foreground` |
| `text-token-text-tertiary` | `text-muted-foreground` |

#### 4.2 - Replace All Hardcoded Hex Colors in pika-chat

| File | Line(s) | Color | Replace With |
|------|---------|-------|--------------|
| trace.svelte | 934 | `background: white` | `var(--background)` |
| trace.svelte | 935 | `#e0e0e0` | `var(--border)` |
| trace.svelte | 940 | `#333` | `var(--foreground)` |
| trace.svelte | 951 | `#007bff` | `var(--ring)` or `var(--primary)` |
| trace.svelte | 952 | `#f8f9ff` | `var(--accent)` |
| trace.svelte | (shadows) | `rgba(0,0,0,0.x)` | Keep or use `hsl(var(--foreground) / 0.x)` |
| chat-input.svelte | 135 | `dark:bg-[#303030]` | `dark:bg-card` or `dark:bg-input` |
| chat-file-attachment.svelte | 28 | `#e2e8f0` | `hsl(var(--muted))` or `var(--border)` |
| chat-file-attachment.svelte | 36 | `#3b82f6` | `hsl(var(--primary))` or `var(--info)` |
| message-renderer.svelte | 207 | `#e5e7eb` | `var(--border)` |
| message-renderer.svelte | 208 | `#f9fafb` | `var(--muted)` |
| message-renderer.svelte | 209 | `#6b7280` | `var(--muted-foreground)` |
| login/+page.svelte | various | See temp-color-discovery.json | Map to semantic vars |

#### 4.3 - Replace Hardcoded Colors in pika-ux

| File | Line(s) | Color | Replace With |
|------|---------|-------|--------------|
| pika-table.svelte | 277 | `#ededed` in shadow | `hsl(var(--border))` |
| github.scss | multiple | 8 hex colors | Map to CSS variables or keep (markdown editor theme) |
| permanent-toast.svelte | 18,24,30 | Tailwind text-*-500 | `text-info`, `text-warning`, `text-destructive` |
| expandable-container.svelte | 83,87,94 | Tailwind text-*-600 | Semantic color classes |

#### 4.4 - Replace Tailwind Named Colors with Semantic Classes

**~330 instances** across ~25 files. Replace patterns like:
- `bg-blue-50` → `bg-info-bg` or `bg-muted`
- `text-gray-600` → `text-muted-foreground`
- `border-gray-200` → `border-border`
- `bg-green-100` → `bg-success-bg`
- `text-red-500` → `text-destructive`
- `bg-yellow-50` → `bg-warning-bg`

#### 4.5 - Update CLI Component Template

| File | Line(s) | Color | Replace With |
|------|---------|-------|--------------|
| packages/pika-cli/src/commands/component.ts | 273 | `#e2e8f0` | `var(--border)` |
| packages/pika-cli/src/commands/component.ts | 277 | `#ffffff` | `var(--background)` |
| packages/pika-cli/src/commands/component.ts | 287 | `#2d3748` | `var(--foreground)` |
| packages/pika-cli/src/commands/component.ts | 293 | `#4a5568` | `var(--muted-foreground)` |

#### 4.6 - Verification Checklist

After ALL changes:
- [ ] Test all affected components in light mode
- [ ] Test all affected components in dark mode
- [ ] Verify chat input displays correctly
- [ ] Verify file upload progress ring works
- [ ] Verify trace component renders correctly
- [ ] Verify message renderer styling
- [ ] Verify pika-table shadows work
- [ ] Create a new component via CLI and verify it looks correct
- [ ] Run full build with no errors

---

### Phase 5: Custom Palette Investigation & Migration

**Goal**: Understand and properly handle the custom palettes (gold, blueish, etc.).

#### 5.1 - Document Current Usage

Create a comprehensive mapping of where each custom palette is used:

| Palette | Variable | Used In | UI Purpose |
|---------|----------|---------|------------|
| gold | --gold-500 | sidebar-border | Accent border |
| blueish | --blueish-500 | ... | ... |
| etc. | | | |

#### 5.2 - Determine Migration Strategy

For each custom palette usage, decide:
1. **Map to semantic variable**: Replace `--gold-500` with `--accent` or similar
2. **Create new semantic variable**: If purpose is unique, create `--sidebar-accent`
3. **Keep as custom palette**: If clone projects need full palette customization

#### 5.3 - Implement Migration

Based on the strategy, either:
- Refactor to use semantic variables
- Add new semantic variables to the theme system
- Document custom palettes as part of the theming system

---

### Phase 6: Web Component Theme Access

**Goal**: Allow web components to access theme tokens.

#### 6.1 - Create Theme Tokens Export

Create `packages/pika-ux/src/theme/tokens.css`:

```css
/**
 * Pika Theme Tokens for Web Components
 * 
 * Include this in your web component to access Pika's theme tokens.
 * Variables cascade from parent document for non-shadow-DOM components.
 */

:host, :root {
    --pika-primary: var(--primary, oklch(0.514 0.146 255.748));
    --pika-primary-foreground: var(--primary-foreground, oklch(0.984 0.004 248.227));
    /* ... all semantic variables with fallback defaults ... */
}
```

#### 6.2 - Add Theme Helpers to wc-utils

Update `packages/shared/src/util/wc-utils.ts`:

```typescript
/**
 * Get a CSS variable value from the document
 */
export function getThemeVariable(name: string): string {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(`--${name}`).trim();
}

/**
 * Get all Pika theme tokens as an object
 */
export function getPikaThemeTokens(): Record<string, string> {
    const style = getComputedStyle(document.documentElement);
    const tokenNames = [
        'primary', 'primary-foreground',
        'secondary', 'secondary-foreground',
        'success', 'success-foreground',
        'warning', 'warning-foreground',
        'info', 'info-foreground',
        'ai', 'ai-foreground',
        // ... all tokens
    ];
    
    const tokens: Record<string, string> = {};
    for (const name of tokenNames) {
        const value = style.getPropertyValue(`--${name}`).trim();
        if (value) tokens[name] = value;
    }
    return tokens;
}
```

---

### Phase 7: Create Default Theme Template

**Goal**: Create the default custom theme file that clone projects customize.

#### 7.1 - Create Custom Directory Structure

```
apps/pika-chat/src/lib/custom/
├── README.md             # Instructions for customization
└── theme-config.ts       # Default theme config (disabled)
```

#### 7.2 - Create Default Theme Config Template

Create `apps/pika-chat/src/lib/custom/theme-config.ts`:

```typescript
/**
 * Custom Theme Configuration
 * 
 * This file is protected from pika sync - your changes will be preserved.
 * 
 * To enable custom theming:
 * 1. Set customTheme.enabled = true in pika-config.ts
 * 2. Customize the values below
 * 3. The theme will be automatically applied (HMR in dev mode)
 * 
 * See /docs for full theming documentation.
 */

import type { ThemeConfig } from 'pika-shared/types/chatbot/theme-types';

export const themeConfig: ThemeConfig = {
    name: 'Default Custom Theme',
    
    // Uncomment and customize to override the default font
    // fontFamily: '"Figtree", Arial, Helvetica, sans-serif',
    
    cssVariables: {
        light: {
            // Uncomment and customize to override semantic colors
            // 'primary': 'oklch(0.47 0.2 290)',           // Primary brand color
            // 'primary-foreground': 'oklch(1 0 0)',       // Text on primary
            // 'secondary': 'oklch(0.97 0.005 290)',
            // 'secondary-foreground': 'oklch(0.47 0.2 290)',
            
            // Extended semantic colors
            // 'success': 'oklch(0.50 0.15 145)',
            // 'warning': 'oklch(0.60 0.15 75)',
            // 'info': 'oklch(0.52 0.14 250)',
            // 'ai': 'oklch(0.52 0.18 280)',
        },
        dark: {
            // Dark mode overrides
        }
    },
    
    // Custom color palettes for your brand
    // customPalettes: {
    //     brand: {
    //         '50': 'oklch(0.97 0.01 290)',
    //         '100': 'oklch(0.94 0.02 290)',
    //         '500': 'oklch(0.47 0.2 290)',
    //         '900': 'oklch(0.20 0.08 290)',
    //     }
    // }
};
```

---

### Phase 8: Example Theme Implementation

**Goal**: Create a working example theme that demonstrates customization.

#### 8.1 - Create Example Company Theme

Create `apps/pika-chat/src/lib/custom/examples/purple-brand-theme.ts`:

```typescript
/**
 * Example: Purple Brand Theme
 * 
 * This demonstrates how to create a corporate brand theme.
 * Based on the RCS Service UI Guide v2.
 * 
 * To use this theme:
 * 1. Copy this content to theme-config.ts
 * 2. Set customTheme.enabled = true in pika-config.ts
 */

import type { ThemeConfig } from 'pika-shared/types/chatbot/theme-types';

export const purpleBrandTheme: ThemeConfig = {
    name: 'Purple Brand Theme',
    fontFamily: '"Figtree", Arial, Helvetica, sans-serif',
    
    cssVariables: {
        light: {
            // Primary brand (Purple)
            'primary': 'oklch(0.47 0.2 290)',           // #7537D6
            'primary-foreground': 'oklch(1 0 0)',       // White
            
            // Backgrounds
            'background': 'oklch(1 0 0)',               // #FFFFFF
            'foreground': 'oklch(0.22 0.02 260)',       // #32343F
            'card': 'oklch(1 0 0)',
            'card-foreground': 'oklch(0.22 0.02 260)',
            'muted': 'oklch(0.97 0.002 260)',           // #F7F7FA
            'muted-foreground': 'oklch(0.45 0.03 260)', // #64687E
            
            // Borders
            'border': 'oklch(0.88 0.01 260)',           // #DBDDE5
            'input': 'oklch(0.88 0.01 260)',
            'ring': 'oklch(0.55 0.15 250)',
            
            // Semantic colors
            'destructive': 'oklch(0.55 0.2 25)',        // #CF374B
            'success': 'oklch(0.50 0.15 145)',          // #258531
            'success-bg': 'oklch(0.92 0.08 145)',       // #E8F4D9
            'warning': 'oklch(0.60 0.15 75)',           // #A66404
            'warning-bg': 'oklch(0.96 0.05 75)',        // #FEF1DF
            'info': 'oklch(0.52 0.14 250)',             // #1F6FCE
            'info-bg': 'oklch(0.93 0.05 250)',          // #E2EEFC
            'ai': 'oklch(0.52 0.18 280)',               // #645CCC
            'ai-bg': 'oklch(0.93 0.05 280)',            // #EBE9F8
            
            'radius': '0.375rem',                        // 6px
        },
        dark: {
            'primary': 'oklch(0.70 0.18 290)',
            'primary-foreground': 'oklch(0.15 0.02 290)',
            'background': 'oklch(0.15 0.02 260)',
            'foreground': 'oklch(0.95 0.005 260)',
            // ... dark mode variants
        }
    },
    
    customPalettes: {
        brand: {
            '50': '#F5F0FC',
            '100': '#E3D7F7',
            '500': '#7537D6',
            '600': '#6932C1',
            '700': '#5E2CAB',
            '950': '#231040',
        }
    }
};
```

#### 8.2 - Create Theme Preview Component

Create `apps/pika-chat/src/lib/custom/ThemePreview.svelte`:

```svelte
<script lang="ts">
    import { Button } from 'pika-ux/shadcn/button';
    import * as Card from 'pika-ux/shadcn/card';
</script>

<div class="p-6 space-y-6">
    <h2 class="text-2xl font-bold">Theme Preview</h2>
    
    <!-- Core Colors -->
    <Card.Root>
        <Card.Header>
            <Card.Title>Core Colors</Card.Title>
        </Card.Header>
        <Card.Content>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="p-4 bg-primary text-primary-foreground rounded-lg text-center">Primary</div>
                <div class="p-4 bg-secondary text-secondary-foreground rounded-lg text-center">Secondary</div>
                <div class="p-4 bg-accent text-accent-foreground rounded-lg text-center">Accent</div>
                <div class="p-4 bg-muted text-muted-foreground rounded-lg text-center">Muted</div>
            </div>
        </Card.Content>
    </Card.Root>
    
    <!-- Semantic Status Colors -->
    <Card.Root>
        <Card.Header>
            <Card.Title>Semantic Status Colors</Card.Title>
        </Card.Header>
        <Card.Content>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div class="p-4 bg-destructive text-destructive-foreground rounded-lg text-center">Destructive</div>
                <div class="p-4 bg-success text-success-foreground rounded-lg text-center">Success</div>
                <div class="p-4 bg-warning text-warning-foreground rounded-lg text-center">Warning</div>
                <div class="p-4 bg-info text-info-foreground rounded-lg text-center">Info</div>
                <div class="p-4 bg-ai text-ai-foreground rounded-lg text-center">AI</div>
            </div>
        </Card.Content>
    </Card.Root>
    
    <!-- Semantic Background Colors -->
    <Card.Root>
        <Card.Header>
            <Card.Title>Semantic Backgrounds</Card.Title>
        </Card.Header>
        <Card.Content>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div class="p-4 bg-danger-bg border border-destructive text-destructive rounded-lg text-center">Danger BG</div>
                <div class="p-4 bg-success-bg border border-success text-success rounded-lg text-center">Success BG</div>
                <div class="p-4 bg-warning-bg border border-warning text-warning rounded-lg text-center">Warning BG</div>
                <div class="p-4 bg-info-bg border border-info text-info rounded-lg text-center">Info BG</div>
                <div class="p-4 bg-ai-bg border border-ai text-ai rounded-lg text-center">AI BG</div>
            </div>
        </Card.Content>
    </Card.Root>
    
    <!-- Buttons -->
    <Card.Root>
        <Card.Header>
            <Card.Title>Button Variants</Card.Title>
        </Card.Header>
        <Card.Content>
            <div class="flex flex-wrap gap-4">
                <Button variant="default">Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button class="bg-success hover:bg-success/90 text-success-foreground">Success</Button>
                <Button class="bg-warning hover:bg-warning/90 text-warning-foreground">Warning</Button>
                <Button class="bg-info hover:bg-info/90 text-info-foreground">Info</Button>
            </div>
        </Card.Content>
    </Card.Root>
</div>
```

---

### Phase 9: Documentation

**Goal**: Comprehensive documentation for users on how to create and use themes.

#### 9.1 - Create Theme Documentation Page

Create `apps/pika-docs/src/content/docs/guides/customization/theming.mdoc`:

```markdown
---
title: Customize Theme and Colors
description: Complete guide to customizing colors, typography, and styling in your Pika clone
---

Learn how to customize the Pika Framework's visual appearance to match your corporate brand guidelines.

## What You'll Accomplish

By the end of this guide, you will:

- Understand how Pika's theming system works
- Enable custom theming in your project
- Create a custom theme with your brand colors
- Configure light and dark mode variants
- Provide theme tokens to your web components
- Preview and test your theme changes

## Prerequisites

- A cloned Pika installation
- Basic understanding of CSS custom properties
- Your brand color palette (preferably in oklch format)

## How Theming Works

Pika uses CSS custom properties (variables) for theming, following the shadcn-svelte conventions:

1. **Base variables** defined in `app.css` (`:root` and `.dark`)
2. **Tailwind mappings** in `@theme inline` block
3. **shadcn components** reference variables via Tailwind classes

When you enable custom theming, your overrides are injected via a generated CSS file that takes precedence over the defaults.

## Quick Start

### Step 1: Enable Custom Theming

Edit `pika-config.ts`:

```typescript
siteFeatures: {
    uiCustomization: {
        // ... existing config ...
        customTheme: {
            enabled: true,  // Set to true
            themeConfigPath: 'custom/theme-config'
        }
    }
}
```

### Step 2: Customize Your Theme

Edit `apps/pika-chat/src/lib/custom/theme-config.ts`:

```typescript
import type { ThemeConfig } from 'pika-shared/types/chatbot/theme-types';

export const themeConfig: ThemeConfig = {
    name: 'My Company Theme',
    fontFamily: '"Inter", sans-serif',
    
    cssVariables: {
        light: {
            'primary': 'oklch(0.47 0.2 290)',
            'primary-foreground': 'oklch(1 0 0)',
            // Add more overrides...
        },
        dark: {
            // Dark mode overrides...
        }
    }
};
```

### Step 3: Test Your Changes

Run the dev server:

```bash
pnpm run dev
```

Changes to your theme config will automatically trigger a reload.

## Available Variables

[Full table of all semantic variables and their purposes...]

## Best Practices

1. **Use oklch colors** - Modern color space with better perceptual uniformity
2. **Test both modes** - Always verify light and dark mode variants
3. **Start with semantic colors** - Override `primary`, `secondary`, etc. before custom palettes
4. **Use the preview component** - Import `ThemePreview.svelte` to see all colors

## Examples

### Corporate Purple Theme

[Full example with code...]

### Minimal Dark Theme

[Full example with code...]

## Using Theme in Web Components

Web components can access theme tokens:

```typescript
import { getPikaThemeTokens } from 'pika-shared/util/wc-utils';

// Get all tokens as an object
const tokens = getPikaThemeTokens();
console.log(tokens.primary); // 'oklch(0.47 0.2 290)'

// Or use CSS variables directly
const element = document.createElement('div');
element.style.backgroundColor = 'var(--primary)';
```

## Troubleshooting

### Theme not applying
- Verify `customTheme.enabled: true` in pika-config.ts
- Check browser console for errors
- Ensure theme-config.ts exports `themeConfig`

### Colors look wrong in dark mode
- Verify you've provided `.dark` overrides
- Dark mode colors should have lower lightness values

## Related Documentation

- [Customize the UI](/guides/customization/ui/)
- [CSS Custom Properties Reference](/reference/ui-components/css-variables/)
- [pika-ux Module](/guides/advanced/pika-ux-module/)
```

#### 9.2 - Update Sidebar Config

Add to `apps/pika-docs/sidebar-config.ts`:

```typescript
{
    label: 'Customization',
    collapsed: true,
    items: [
        { label: 'Customize the UI', slug: 'guides/customization/ui' },
        { label: 'Customize Theme and Colors', slug: 'guides/customization/theming' },  // NEW
        { label: 'Build Custom Web Components', slug: 'guides/customization/build-web-components' },
        // ... rest of items
    ]
}
```

---

## Implementation Checklist

### Phase 0: Codebase Color Audit ✅ COMPLETE
- [x] Create temp-color-discovery.json tracking file
- [x] Generate list of all files to scan
- [x] Scan pika-chat .svelte files for hardcoded colors (152 files)
- [x] Scan pika-chat .ts files for hardcoded colors (111 files)
- [x] Scan pika-ux/pika .svelte files for hardcoded colors (47 files)
- [x] Scan pika-ux/pika .ts files for hardcoded colors (31 files)
- [x] Full monorepo sweep for missed patterns
- [x] Document custom palette usage and purposes
- [x] Create refactoring plan from findings
- [x] Identify broken CSS classes (token-* in chat-input.svelte)
- [x] Scope clarification: pika-docs OUT OF SCOPE (separate theming system)

### Phase 1: Type System & Config ✅ COMPLETE
- [x] Create theme-types.ts with ThemeConfig interface
- [x] Extend UiCustomizationFeature with customTheme property
- [x] Update pika-config.ts with customTheme default config
- [x] Export types from pika-shared (via direct path imports)

### Phase 2: Theme Vite Plugin ✅ COMPLETE
- [x] Create theme-vite-plugin directory and file
- [x] Implement plugin with buildStart, configureServer, handleHotUpdate
- [x] Integrate into vite.config.ts
- [x] Create lib/styles directory
- [x] Update app.css to import generated theme
- [ ] Test HMR on theme config change (needs manual verification)

### Phase 3: Semantic Color Extension ✅ COMPLETE
- [x] Add success, warning, info, ai variables to app.css (light)
- [x] Add success, warning, info, ai variables to app.css (dark)
- [x] Add @theme inline mappings for new colors
- [x] Mirror changes to pika-ux/app.css
- [ ] Test Tailwind utility classes work (needs manual verification)

### Phase 4: Refactor Hardcoded Colors ✅ COMPLETE
- [x] **CRITICAL: Fix broken token-* classes in chat-input.svelte**
- [x] Replace hardcoded colors in trace.svelte (6 items)
- [x] Replace hardcoded colors in chat-input.svelte (1 arbitrary Tailwind)
- [x] Replace hardcoded colors in chat-file-attachment.svelte (2 SVG strokes)
- [x] Replace hardcoded colors in message-renderer.svelte (3 items)
- [x] Replace hardcoded colors in login/+page.svelte (verified: none found)
- [x] Replace hardcoded colors in pika-table.svelte (shadow)
- [x] Review github.scss - INTENTIONALLY KEPT (GitHub markdown theme)
- [x] Replace Tailwind named colors in permanent-toast.svelte
- [x] Replace Tailwind named colors in expandable-container.svelte
- [x] Update CLI component template (4 hex colors)
- [x] Tailwind named grays (~330) - NOT NEEDED (Tailwind theme handles these; semantic colors for status are done)
- [ ] Verify all changes in light mode (needs manual verification)
- [ ] Verify all changes in dark mode (needs manual verification)
- [ ] Full build verification (needs manual verification)

### Phase 5: Custom Palette Investigation ✅ NOT NEEDED
- [x] Analysis complete: Custom palettes (gold, blueish, etc.) are already used via semantic variables
- [x] Clone projects override semantic variables, not palette definitions
- [x] No migration needed - system works as designed

### Phase 6: Web Component Theme Access ✅ COMPLETE
- [x] Add getThemeVariable to wc-utils (packages/shared/src/util/wc-utils.ts)
- [x] Add getPikaThemeTokens to wc-utils
- [x] Uses existing SEMANTIC_COLOR_VARIABLES from theme-types.ts
- [x] Documented in README.md

### Phase 7: Default Theme Template ✅ COMPLETE
- [x] Create apps/pika-chat/src/lib/custom/ directory
- [x] Create README.md with instructions
- [x] Create theme-config.ts template (disabled by default)

### Phase 8: Example Theme ✅ COMPLETE
- [x] Create examples/ directory
- [x] Create purple-brand-theme.ts example
- [ ] ThemePreview.svelte - DEFERRED (nice-to-have, not blocking)

### Phase 9: Documentation - OUT OF SCOPE
- pika-docs has its own theming system (Starlight/Astro)
- README.md in custom/ directory serves as primary documentation

---

## Files to Create/Modify Summary

### New Files
- `packages/shared/src/types/chatbot/theme-types.ts`
- `apps/pika-chat/tools/theme-vite-plugin/theme-vite-plugin.ts`
- `apps/pika-chat/src/lib/styles/generated-theme.css` (generated)
- `apps/pika-chat/src/lib/custom/README.md`
- `apps/pika-chat/src/lib/custom/theme-config.ts`
- `apps/pika-chat/src/lib/custom/examples/purple-brand-theme.ts`
- `apps/pika-chat/src/lib/custom/ThemePreview.svelte`
- `packages/pika-ux/src/theme/tokens.css`
- `apps/pika-docs/src/content/docs/guides/customization/theming.mdoc`
- `temp-color-discovery.json` (temporary, for audit)

### Modified Files
- `packages/shared/src/types/chatbot/chatbot-types.ts` (extend UiCustomizationFeature)
- `pika-config.ts` (add customTheme config)
- `apps/pika-chat/vite.config.ts` (add theme plugin)
- `apps/pika-chat/src/app.css` (add semantic colors, import generated theme)
- `packages/pika-ux/src/app.css` (add semantic colors)
- `packages/shared/src/util/wc-utils.ts` (add theme helpers)
- `apps/pika-docs/sidebar-config.ts` (add theming guide)
- Various component files (Phase 4 hardcoded color refactoring)

---

## Risk Considerations

1. **Backward compatibility**: Default theme should be unchanged when customTheme.enabled = false
2. **Build performance**: Theme generation should be fast (< 100ms)
3. **HMR reliability**: Theme changes should always trigger reload
4. **Dark mode**: Must test all changes in both light and dark modes
5. **Web component isolation**: Ensure theme tokens cascade correctly

---

## Success Criteria

1. Clone project can create custom theme matching their brand
2. Theme changes reload automatically in dev mode
3. Default Pika theme unchanged when customization disabled
4. All hardcoded colors replaced with variables
5. Web components can access theme tokens
6. Documentation enables self-service theming
