# pika-ux

UI Components library for the Pika project. This package contains both custom Pika components and shadcn/ui components adapted for Svelte.

## Quick Start: Create a Webcomponent Project

The fastest way to create a new webcomponent project with Pika UX:

```bash
pnpm dlx pika-ux create my-webcomponent
```

### Global Installation (Optional)

If you'll be creating multiple projects, you can install globally:

```bash
# pnpm (recommended)
pnpm add -g pika-ux

# npm
npm install -g pika-ux

# yarn
yarn global add pika-ux
```

Then use the command:

```bash
pika-ux create my-webcomponent
# or use the shorter alias
pikaux create my-webcomponent
```

Both `pika-ux` and `pikaux` commands work identically - use whichever you prefer!

## Manual Installation

If you prefer to add Pika UX to an existing project:

1. Install the module

```bash
pnpm install pika-ux
# or
npm install pika-ux
```

2. Install peer dependencies

```bash
pnpm install @iconify-json/ci @iconify-json/lucide @tailwindcss/vite tailwindcss unplugin-icons
```

3. Modify `vite.config.ts`

The config below turns on tailwind and also the unplugin-icons to make icons available.

```ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        tailwindcss(),
        svelte(),
        Icons({
            compiler: 'svelte'
        }) as any // necessary since slightly different versions of vite are in use
    ],
    resolve: {
        alias: {
            // You have to have this
            '$icons/': '~icons/'
        }
    }
});
```

## Usage

### Importing Components

You can import components from either the `pika` or `shadcn` collections:

```typescript
// Pika custom components
import { Chip } from 'pika-ux/pika/chip';
import { PikaAlert } from 'pika-ux/pika/pika-alert';

// shadcn/ui components
import { Button } from 'pika-ux/shadcn/button';
import { Card } from 'pika-ux/shadcn/card';
```

## Component Collections

### Pika Components

Custom UI components designed specifically for the Pika framework.

### shadcn Components

Svelte implementations of popular shadcn/ui components.

## Development

```bash
# Install dependencies
pnpm install

# Build the library
pnpm run build

# Watch for changes during development
pnpm run dev
```
