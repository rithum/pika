# Test App

A webcomponent application built with Pika UX components.

## Overview

This project creates custom webcomponents that can be dynamically injected into a Pika chat application. Components can appear:

- **In-conversation**: Embedded within the chat message flow
- **Spotlight section**: Displayed above the chat input field

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Type checking
pnpm check
```

## Project Structure

```
test-app/
├── src/
│   ├── lib/          # Reusable components
│   ├── App.svelte    # Main application component
│   ├── main.ts       # Application entry point
│   └── app.css       # Global styles
├── package.json
└── vite.config.ts
```

## Development

This project uses:

- **Svelte 5**: Modern reactive framework
- **Pika UX**: Component library with shadcn-style components
- **Tailwind CSS v4**: Utility-first styling
- **Vite**: Fast build tool and dev server
- **TypeScript**: Type-safe development

## Building Webcomponents

Create your webcomponents in `src/lib/` and export them from your main application. These components can then be integrated with Pika chat applications for dynamic UI injection.

## Learn More

- [Pika Framework Documentation](https://pika.tools)
- [Pika UX Components](https://github.com/rithum/pika/tree/main/packages/pika-ux)
- [Svelte Documentation](https://svelte.dev)
- [Tailwind CSS](https://tailwindcss.com)
