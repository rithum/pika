---
title: pika-ux NPM Module
description: Pre-built UI components and TypeScript types for building Pika web components
outline: [2, 3]
---

The `pika-ux` package provides pre-built UI components and design system elements for building web components that integrate seamlessly with Pika chat applications.

## Installation

```bash
npm install pika-ux
```

## What's Included

### shadcn/ui Components

Pre-built, accessible UI components based on shadcn/ui:

```js
import { Button } from 'pika-ux/shadcn/button';
import * as Dialog from 'pika-ux/shadcn/dialog';
import * as Card from 'pika-ux/shadcn/card';
import * as DropdownMenu from 'pika-ux/shadcn/dropdown-menu';
import { Input } from 'pika-ux/shadcn/input';
import { Label } from 'pika-ux/shadcn/label';
import { Checkbox } from 'pika-ux/shadcn/checkbox';
// ... and many more
```

### Custom Pika Components

Additional components specific to Pika:

```js
import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';
import ExpandableContainer from 'pika-ux/pika/expandable-container/expandable-container.svelte';
```

### TypeScript Types

All Pika-specific types are exported from `pika-shared`, but `pika-ux` re-exports commonly used types for convenience.

## Using Components

### Button Example

```js
<script lang="ts">
    import { Button } from 'pika-ux/shadcn/button';

    function handleClick() {
        console.log('Button clicked!');
    }
</script>

<Button onclick={handleClick} variant="default" size="lg">
    Click Me
</Button>

<Button variant="outline" size="sm">
    Secondary Action
</Button>

<Button variant="ghost">
    Ghost Button
</Button>
```

### Dialog Example

```js
<script lang="ts">
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import { Button } from 'pika-ux/shadcn/button';

    let dialogOpen = $state(false);
</script>

<Button onclick={() => dialogOpen = true}>
    Open Dialog
</Button>

<Dialog.Root bind:open={dialogOpen}>
    <Dialog.Content>
        <Dialog.Header>
            <Dialog.Title>Dialog Title</Dialog.Title>
            <Dialog.Description>
                This is a description of the dialog content.
            </Dialog.Description>
        </Dialog.Header>

        <div class="py-4">
            <!-- Dialog content -->
        </div>

        <Dialog.Footer>
            <Button onclick={() => dialogOpen = false}>
                Close
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
```

### Card Example

```js
<script lang="ts">
    import * as Card from 'pika-ux/shadcn/card';
</script>

<Card.Root>
    <Card.Header>
        <Card.Title>Card Title</Card.Title>
        <Card.Description>Card description goes here</Card.Description>
    </Card.Header>
    <Card.Content>
        <p>Main content of the card</p>
    </Card.Content>
    <Card.Footer>
        <Button>Action</Button>
    </Card.Footer>
</Card.Root>
```

## Component Variants

Many components support variants for different styles:

### Button Variants

- `default` - Primary button style
- `destructive` - For destructive actions
- `outline` - Outlined button
- `secondary` - Secondary style
- `ghost` - Minimal style
- `link` - Link-styled button

### Button Sizes

- `default`
- `sm` - Small
- `lg` - Large
- `icon` - Square for icons

## Styling

### Using Tailwind Classes

All pika-ux components are styled with Tailwind CSS and can be customized using Tailwind utility classes:

```js
<Button class="mt-4 w-full">
    Full Width Button
</Button>

<Card.Root class="max-w-md">
    <!-- Card content -->
</Card.Root>
```

### Theme Integration

Components automatically use the theme configured in your Pika chat app, including:

- Color scheme
- Typography
- Spacing
- Border radius
- Shadows

## Best Practices

- **Import only what you need**: Tree-shake unused components
- **Use semantic HTML**: Components render proper HTML elements
- **Leverage variants**: Use built-in variants instead of custom styles
- **Test accessibility**: Components are built with a11y in mind, but test your usage

## Available Components

### Layout & Structure

- `Card` - Flexible content container
- `Separator` - Visual divider
- `Sidebar` - Collapsible sidebar navigation

### Forms & Input

- `Input` - Text input field
- `Label` - Form label
- `Checkbox` - Checkbox input
- `RadioGroup` - Radio button group
- `Select` - Dropdown select
- `Switch` - Toggle switch
- `Textarea` - Multi-line text input

### Feedback & Overlays

- `Dialog` - Modal dialog
- `AlertDialog` - Confirmation dialog
- `Tooltip` - Hover tooltip
- `Popover` - Floating popover
- `Toast` - Notification message
- `Progress` - Progress indicator

### Navigation

- `Dropdown Menu` - Dropdown menu
- `Tabs` - Tabbed interface
- `Breadcrumb` - Breadcrumb navigation

### Data Display

- `Table` - Data table
- `Badge` - Status badge
- `Avatar` - User avatar

## Next Steps

- [Building Web Components](/docs/developer/building-web-components) - Use these components in your widgets
- [Web Components Overview](/docs/features/web-components) - Understand the widget system
- [shadcn/ui Docs](https://ui.shadcn.com/) - Original component documentation
