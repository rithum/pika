# Enterprise Documentation with Starlight & Markdoc

[![Built with Starlight](https://astro.badg.es/v2/built-with-starlight/tiny.svg)](https://starlight.astro.build)

A comprehensive, enterprise-ready documentation site built with [Astro Starlight](https://starlight.astro.build/) and [Markdoc](https://markdoc.dev/), featuring all built-in Starlight components and Tailwind CSS integration.

## ✨ Features

- **🎨 All Starlight Components**: Complete examples of every built-in component in Markdoc format
- **📝 Markdoc-First**: Type-safe, validated content authoring perfect for enterprise docs
- **🎯 Tailwind CSS**: Full Tailwind v4 integration for custom styling
- **📚 Comprehensive Examples**: Real-world usage patterns for all components
- **🏢 Enterprise-Ready**: Organized structure suitable for large-scale documentation
- **♿ Accessible**: WCAG compliant with keyboard navigation and screen reader support
- **⚡ Fast**: Static site generation for optimal performance
- **🔍 Searchable**: Built-in search functionality

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

The site will be available at `http://localhost:4321`

## 🔌 Recommended Extensions

### VS Code

When you open this project in VS Code, you'll be prompted to install the recommended extensions:

- **Astro**: Syntax highlighting and IntelliSense for Astro files
- **Markdoc Language Support**: Syntax highlighting, validation, and autocompletion for `.mdoc` files

The extensions are automatically suggested via `.vscode/extensions.json`.

### Cursor

Cursor uses a separate extension marketplace and may not have all VS Code extensions available. To install the Markdoc extension in Cursor:

1. Download the VSIX file:
   ```bash
   curl -L "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/Stripe/vsextensions/markdoc-language-support/0.0.13/vspackage" | gunzip > markdoc-language-support.vsix
   ```

2. Install from VSIX in Cursor:
   - Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
   - Type and select `Extensions: Install from VSIX...`
   - Select the downloaded `markdoc-language-support.vsix` file

3. Reload the window when prompted

4. Clean up the VSIX file:
   ```bash
   rm markdoc-language-support.vsix
   ```

## 📁 Project Structure

```
src/
├── assets/              # Images and static assets
├── content/
│   └── docs/           # Documentation content (Markdoc)
│       ├── index.mdoc              # Homepage
│       ├── getting-started/
│       │   └── quick-start.mdoc
│       ├── components/             # Component examples
│       │   ├── overview.mdoc
│       │   ├── cards.mdoc
│       │   ├── asides.mdoc
│       │   ├── badges.mdoc
│       │   ├── code.mdoc
│       │   ├── file-tree.mdoc
│       │   ├── icons.mdoc
│       │   ├── link-buttons.mdoc
│       │   ├── link-cards.mdoc
│       │   ├── steps.mdoc
│       │   └── tabs.mdoc
│       ├── guides/                 # How-to guides
│       │   ├── best-practices.mdoc
│       │   └── writing-content.mdoc
│       └── reference/              # Reference docs
│           ├── api.mdoc
│           └── configuration.mdoc
├── styles/
│   └── global.css      # Global styles and Tailwind
├── content.config.ts   # Content collection configuration
astro.config.mjs        # Astro configuration
markdoc.config.mjs      # Markdoc configuration with Starlight preset
package.json
```

## 🧩 Component Examples

This project demonstrates all Starlight components in Markdoc format:

### Layout Components
- **Cards & Card Grids**: Organized content display with icons
- **Tabs**: Multi-language code examples and platform-specific content
- **Steps**: Sequential tutorials and instructions

### Content Components
- **Asides**: Callout boxes for notes, tips, warnings, and dangers
- **Code Blocks**: Syntax-highlighted code with titles and line highlighting
- **File Trees**: Visual directory structure representation
- **Badges**: Inline labels for status and versions

### Navigation Components
- **Link Cards**: Prominent navigation cards
- **Link Buttons**: Call-to-action buttons
- **Icons**: Extensive icon library integration

Visit `/components/overview` in the running site to see all examples.

## 🎨 Tailwind CSS

This project uses Tailwind CSS v4 with the Vite plugin. Custom styles can be added in:

- `src/styles/global.css` - Global styles and Tailwind layers
- Component-specific classes in `.astro` files

## 📝 Creating Content

### New Documentation Page

Create a new `.mdoc` file in `src/content/docs/`:

```markdoc
---
title: Your Page Title
description: Brief description for SEO
---

## Your Content Here

{% card title="Example" icon="star" %}
  Content in a card component
{% /card %}
```

### Using Components

All Starlight components are available without imports:

```markdoc
{% card title="Title" icon="star" %}
  Card content
{% /card %}

{% aside type="tip" %}
  A helpful tip
{% /aside %}

{% steps %}
1. First step
2. Second step
{% /steps %}
```

See `/guides/writing-content` for comprehensive examples.

## 🛠️ Configuration

### Astro Config

Main configuration in `astro.config.mjs`:
- Site metadata
- Sidebar navigation
- Social links
- Custom CSS
- Integrations

### Markdoc Config

Markdoc setup in `markdoc.config.mjs`:
- Starlight preset
- Custom components (if needed)
- Tag configuration

See `/reference/configuration` for complete documentation.

## 📚 Documentation Highlights

### Getting Started
- **Quick Start**: 5-minute setup guide
- **Component Overview**: Visual catalog of all components

### Component Docs
Each component has dedicated documentation with:
- Basic usage examples
- Advanced patterns
- Best practices
- Syntax reference
- Real-world use cases

### Guides
- **Best Practices**: Guidelines for maintainable docs
- **Writing Content**: Complete authoring guide

### Reference
- **API Reference**: Complete API documentation example
- **Configuration**: Full config options reference

## 🤝 Why Markdoc?

Markdoc offers several advantages for enterprise documentation:

- **Type Safety**: Built-in validation catches errors before deployment
- **Better DX**: Clear error messages and predictable parsing
- **Git-Friendly**: Clean diffs and easier merge conflict resolution
- **Writer-Friendly**: Simpler syntax for non-technical contributors
- **Validation**: Content validation at build time
- **Extensible**: Easy to add custom components

## 🔧 Development

### Commands

| Command | Action |
|---------|--------|
| `pnpm dev` | Start dev server at `localhost:4321` |
| `pnpm build` | Build production site to `./dist/` |
| `pnpm preview` | Preview production build locally |
| `pnpm astro ...` | Run Astro CLI commands |

### Adding Custom Components

1. Create your component in `src/components/`
2. Register it in `markdoc.config.mjs`
3. Use it in your `.mdoc` files

Example:

```javascript
// markdoc.config.mjs
import { component } from '@astrojs/markdoc/config';

export default defineMarkdocConfig({
  extends: [starlightMarkdoc()],
  tags: {
    myComponent: {
      render: component('./src/components/MyComponent.astro'),
      attributes: {
        title: { type: String },
      },
    },
  },
});
```

## 📖 Resources

- [Starlight Documentation](https://starlight.astro.build/)
- [Astro Documentation](https://docs.astro.build/)
- [Markdoc Documentation](https://markdoc.dev/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)

## 🙏 Acknowledgments

Built with:
- [Astro](https://astro.build/) - Static site framework
- [Starlight](https://starlight.astro.build/) - Documentation theme
- [Markdoc](https://markdoc.dev/) - Content authoring
- [Tailwind CSS](https://tailwindcss.com/) - Styling

## 📄 License

This is a demonstration project. Adjust licensing as needed for your use case.

---

**Ready to build your enterprise documentation?** Start by exploring the component examples and customizing the configuration to match your needs!
