# Pika UI Library Design Document

## Overview

The `pika-ux` library is a comprehensive TypeScript-first Svelte component library built on shadcn-svelte components. It serves as the centralized design system for the Pika ecosystem, supporting both SvelteKit applications and pure Svelte web components with shared UI, styling, and iconography.

## Design Goals

1. **Unified Design System** - Single source of truth for UI, styling, and icons across all Pika projects
2. **TypeScript First** - Assumes all consumers use TypeScript
3. **Framework Flexibility** - Works seamlessly in SvelteKit and pure Svelte projects
4. **Standard npm Patterns** - Uses direct imports, no custom aliases required
5. **Self-Contained Library** - All dependencies and tooling contained within pika-ux
6. **Centralized Icon Authority** - Single source for icon types and definitions
7. **Perfect Integration** - Web components built with this library integrate seamlessly with SvelteKit apps

## Core Architecture

### Multi-Project Target Support

The library serves two primary use cases:

1. **SvelteKit Applications** - Full web applications (e.g., pika-chat)
2. **Svelte Web Components** - Self-contained components for use in other stacks

Both consume the exact same UI components, CSS, and icons to ensure visual consistency.

### Source Distribution Strategy

We distribute **raw .svelte files** using standard npm package export patterns. This approach provides:

- **Direct .svelte consumption** via standard import paths
- **Perfect tree shaking** by consumer bundlers
- **Source map accuracy** for debugging
- **Hot reload compatibility** during development
- **No custom alias configuration** required by consumers
- **Standard npm package resolution**

### Package Structure

```
pika-ux/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── app.css                     # Centralized Tailwind 4 styles
│   ├── pika/                       # Custom Pika components
│   │   ├── chip/
│   │   │   ├── chip.svelte         # Uses: import X from '$icons/lucide/x';
│   │   │   └── index.ts
│   │   └── ...
│   ├── shadcn/                     # shadcn-svelte components
│   │   ├── utils.ts                # Shared utilities
│   │   ├── button/
│   │   │   ├── button.svelte
│   │   │   └── index.ts
│   │   └── ...
│   └── icons/                      # Generated icon type definitions (exported)
│       ├── lucide/
│       │   └── index.d.ts          # Full lucide icon types
│       └── ci/
│           └── index.d.ts          # Full ci icon types
├── tools/
│   ├── icon-generator/
│   │   └── generate-icon-ts-indices.ts
│   └── cli/
│       └── setup.ts                # Consumer project setup CLI
├── components.json                 # shadcn-svelte configuration (for pika-ux development)
├── vite.config.ts                  # Configures unplugin-icons + $icons alias
└── package.json
```

### Export Configuration

```json
{
    "exports": {
        ".": "./src/index.ts",
        "./pika/*/": "./src/pika/*/",
        "./shadcn/*/": "./src/shadcn/*/",
        "./icons/*": "./src/icons/*",
        "./app.css": "./src/app.css"
    }
}
```

## Centralized Styling System

### Tailwind 4 Integration

The library includes a comprehensive `src/app.css` file that defines:

- **Design tokens** - Custom color palettes, spacing, typography
- **Theme configuration** - Light/dark mode variables
- **Component styles** - Base styles for all UI components
- **Custom utilities** - Project-specific utility classes

### Consumer Styling Strategy

Consumers **import our CSS directly** rather than defining their own:

```css
/* Consumer's app.css */
@import 'pika-ux/app.css';

/* Optional: Additional project-specific styles */
```

This ensures visual consistency across all projects while allowing for project-specific extensions when needed.

## shadcn Component Integration

### Development Configuration

The `components.json` in pika-ux is used for **library development only**:

```json
{
    "aliases": {
        "components": "$ui",
        "utils": "$ui/shadcn/utils",
        "ui": "$ui/shadcn"
    }
}
```

This enables the shadcn CLI to generate components with the correct internal references within pika-ux during development.

### Seamless Extension Workflow

Adding new shadcn components to pika-ux:

1. **Run shadcn CLI in pika-ux**: `pnpm dlx shadcn-svelte@latest add accordion`
2. **Auto-generation**: Component files created in `src/shadcn/accordion/`
3. **Export update**: Add to `src/shadcn/accordion/index.ts`
4. **Consumer availability**: Components immediately available via direct imports

Consumers import the finished components using standard npm paths - no alias configuration required.

## Centralized Icon System

### Icon Authority Model

**pika-ux is the single source of truth for icons:**

- **Centralized generation** - pika-ux generates all icon TypeScript definitions
- **Export for consumers** - Icon types exported via `pika-ux/icons/*`
- **Consistent intellisense** - All projects get identical icon typing
- **No duplication** - Consumers don't generate their own icon types

### pika-ux Icon Configuration

pika-ux configures unplugin-icons for its own build and exports the results:

```json
{
    "dependencies": {
        "unplugin-icons": "^0.17.0",
        "@iconify-json/lucide": "^1.1.0",
        "@iconify-json/ci": "^1.1.0"
    }
}
```

```javascript
// pika-ux/vite.config.ts
export default {
    plugins: [Icons({ compiler: 'svelte' })],
    resolve: {
        alias: {
            $icons: '~icons'
        }
    }
};
```

### Consumer Icon Setup

**All Project Types:**

- Import icon types from pika-ux: `pika-ux/icons/lucide/index.d.ts`
- Configure local `$icons` → `~icons` alias for runtime
- Install unplugin-icons for runtime icon resolution
- No local icon type generation needed

**TypeScript Configuration:**

```json
{
    "compilerOptions": {
        "paths": {
            "$icons/*": ["node_modules/pika-ux/src/icons/*"]
        }
    }
}
```

**Vite Configuration:**

```javascript
{
    plugins: [Icons({ compiler: 'svelte' })],
    resolve: {
        alias: { '$icons': '~icons' }
    }
}
```

## Simplified CLI Setup System

### Minimal Project Setup

The CLI provides lightweight configuration assistance:

```bash
npx pika-ux setup
```

### CLI Capabilities

1. **Project Detection**

    - SvelteKit vs pure Svelte identification
    - Existing unplugin-icons configuration detection

2. **Icon System Setup**

    - Install unplugin-icons if needed
    - Configure `$icons` → `~icons` alias
    - Set up TypeScript paths for pika-ux icon types
    - CSS import guidance

3. **Interactive Setup**
    - Project type confirmation
    - Icon system installation
    - Configuration validation

### Example CLI Flow

```bash
$ npx pika-ux setup

🔧 Pika UI Setup Wizard
├─ 📁 Detected SvelteKit project
├─ 🎯 Icons: Install unplugin-icons? (Y/n)
├─ 🔗 Configure $icons alias in vite.config.ts
├─ 📝 Update tsconfig.json paths for icon types
├─ 🎨 Add 'pika-ux/app.css' import to src/app.css
└─ ✅ Setup complete!

Ready to use:
import Button from 'pika-ux/shadcn/button/button.svelte';
import CheckIcon from '$icons/lucide/check';
```

## Usage Patterns

### Monorepo Usage

Direct workspace imports with standard npm patterns:

```json
// Consumer package.json
{
    "dependencies": {
        "pika-ux": "workspace:*"
    }
}
```

```typescript
// Direct component imports - no alias needed
import Button from 'pika-ux/shadcn/button/button.svelte';
import Chip from 'pika-ux/pika/chip/chip.svelte';
```

### External Project Usage

Simple install and use:

```bash
# 1. Install
npm install pika-ux

# 2. Optional setup for icons
npx pika-ux setup

# 3. Use directly
import Button from 'pika-ux/shadcn/button/button.svelte';
```

### Icon Usage

Consistent across all project types with centralized typing:

```svelte
<script>
  import CheckIcon from '$icons/lucide/check';   // Types from pika-ux/icons
  import ErrorIcon from '$icons/ci/error';       // Types from pika-ux/icons
</script>

<CheckIcon />
<ErrorIcon class="text-red-500" />
```

### CSS Import

Simple CSS import in your main stylesheet:

```css
/* src/app.css */
@import 'pika-ux/app.css';

/* Optional project-specific styles */
```

## Implementation Roadmap

### Phase 1: Self-Contained Library (Week 1)

- [ ] **Package exports configuration**

    - Update package.json exports for direct imports
    - Configure proper peer dependencies
    - Test import resolution

- [ ] **Icon system integration**

    - Configure unplugin-icons in pika-ux
    - Port icon generator to generate types in src/icons/
    - Set up vite.config.ts with $icons alias
    - Export icon types via package.json

- [ ] **CSS centralization**
    - Ensure src/app.css is properly exported
    - Test CSS imports from external projects

### Phase 2: Library Components (Week 1-2)

- [ ] **Update existing components**

    - Ensure all pika-ux components use $icons for icon imports
    - Test component functionality with new icon system
    - Verify all components are self-contained

- [ ] **shadcn integration**
    - Verify components.json works for library development
    - Test adding new shadcn components
    - Ensure proper internal imports within pika-ux

### Phase 3: Minimal CLI Development (Week 2-3)

- [ ] **Simplified CLI framework**

    - Project type detection (SvelteKit vs Svelte)
    - unplugin-icons installation check
    - Configuration file updates

- [ ] **Setup workflows**
    - Configure $icons → ~icons alias
    - Update TypeScript paths for icon types
    - CSS import guidance
    - Validation and verification

### Phase 4: Migration and Testing (Week 3-4)

- [ ] **pika-chat migration**

    - Update package.json dependency to workspace:\*
    - Change imports from alias-based to direct
    - Test all functionality works identically

- [ ] **External project testing**

    - Fresh SvelteKit project setup
    - Fresh Svelte project setup
    - CLI setup verification
    - Icon system verification

- [ ] **Documentation**
    - Update setup guides for direct import approach
    - Component usage examples
    - Migration guide from alias-based systems

## Future Enhancements

### Enhanced CLI Features

1. **Component Explorer** - Browse and add components interactively
2. **Theme Customization** - CLI-guided theme configuration
3. **Migration Tools** - Automated migration from other UI libraries
4. **Health Checks** - Validate project configuration and dependencies

### Advanced Icon Features

1. **Custom Icon Sets** - Support for project-specific icon collections
2. **Icon Optimization** - Automatic SVG optimization and bundling
3. **Icon Search** - CLI tool for finding and previewing icons

### Development Workflow

1. **Component Templates** - Scaffolding for new Pika components
2. **Design Tokens** - Programmatic access to design system values
3. **Storybook Integration** - Automated component documentation

## Success Metrics

### Developer Experience

- **Setup time**: From npm install to first component use < 5 minutes
- **Configuration errors**: Near-zero setup-related issues
- **Documentation satisfaction**: High clarity ratings

### Technical Performance

- **Bundle size impact**: Minimal overhead, excellent tree shaking
- **Build time**: No significant impact on consumer build times
- **Type safety**: Complete TypeScript coverage

### Adoption and Growth

- **Internal adoption**: All Pika projects using the library
- **Component usage**: High utilization across the component set
- **Extension activity**: Regular addition of new components

---

## Appendix

### Consumer Configuration Examples

#### SvelteKit Project Configuration

```javascript
// svelte.config.js - No special configuration needed for pika-ux components
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter()
    }
};

export default config;
```

```javascript
// vite.config.js (for SvelteKit with icons)
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';

export default {
    plugins: [
        sveltekit(),
        Icons({
            compiler: 'svelte'
        })
    ],
    resolve: {
        alias: {
            $icons: '~icons'
        }
    }
};
```

```json
// tsconfig.json (for icon intellisense)
{
    "compilerOptions": {
        "baseUrl": ".",
        "paths": {
            "$icons/*": ["node_modules/pika-ux/src/icons/*"]
        }
    }
}
```

```css
/* src/app.css */
@import 'pika-ux/app.css';

/* Optional project-specific styles */
```

#### Pure Svelte Project Configuration

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
    plugins: [
        svelte(),
        Icons({
            compiler: 'svelte'
        })
    ],
    resolve: {
        alias: {
            $icons: '~icons'
        }
    }
});
```

```json
// tsconfig.json
{
    "compilerOptions": {
        "baseUrl": ".",
        "paths": {
            "$icons/*": ["node_modules/pika-ux/src/icons/*"]
        }
    },
    "include": ["src/**/*.ts", "src/**/*.svelte", "src/**/*.d.ts"]
}
```

### Component Import Patterns

```typescript
// Direct component imports (recommended approach)
import Button from 'pika-ux/shadcn/button/button.svelte';
import Chip from 'pika-ux/pika/chip/chip.svelte';
import Alert from 'pika-ux/shadcn/alert/alert.svelte';

// Or via index.ts exports (if available)
import { Button } from 'pika-ux/shadcn/button';
import { Chip } from 'pika-ux/pika/chip';

// Icon imports with centralized typing from pika-ux
import CheckIcon from '$icons/lucide/check'; // Type definitions from pika-ux/icons
import CloseIcon from '$icons/ci/close'; // Type definitions from pika-ux/icons
```

### CLI Command Reference

```bash
# Basic setup (icon system and CSS guidance)
npx pika-ux setup

# Icon management (for pika-ux library development)
pnpm run icons:generate    # Run from within pika-ux package

# Configuration validation
npx pika-ux doctor         # Validate consumer project setup
```

**Note**: With direct imports, most CLI complexity is eliminated. Components are imported directly from the package without special setup.

### Troubleshooting Guide

**Common Issues:**

1. **Component import failures**

    - Ensure pika-ux is installed: `npm install pika-ux`
    - Use correct direct import paths: `import Button from 'pika-ux/shadcn/button/button.svelte';`
    - Check package.json exports are resolved correctly

2. **Icon import failures**

    - Ensure unplugin-icons is installed: `npm install unplugin-icons`
    - Configure `$icons` alias: `'$icons': '~icons'` in vite.config
    - Add TypeScript paths: `"$icons/*": ["node_modules/pika-ux/src/icons/*"]`

3. **CSS not loading**

    - Verify `@import 'pika-ux/app.css'` in your app.css
    - Ensure proper CSS processing in your build setup

4. **TypeScript errors with icons**
    - Check TypeScript paths configuration for icon types
    - Ensure pika-ux icon types are accessible
    - Verify all peer dependencies are installed

**Getting Help:**

- Run `npx pika-ux doctor` for automated diagnosis
- Check import paths match package exports
- File issues at [GitHub repository URL]

**Migration from alias-based systems:**

- Replace `$ui/component` imports with direct `pika-ux/path/component.svelte` imports
- Remove custom alias configuration from svelte.config.js/vite.config.js
- Keep `$icons` alias but point TypeScript paths to pika-ux icon types
