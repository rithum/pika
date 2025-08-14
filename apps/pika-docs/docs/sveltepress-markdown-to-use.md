# SveltePress Markdown Reference Guide

A comprehensive guide to all the markdown features and syntax available in SveltePress.

## Frontmatter

SveltePress supports YAML frontmatter at the top of your markdown files to define metadata and configuration options.

```yaml
---
title: Admin Site
description: Explains the featured admin site
author: Your Name
date: 2024-01-01
tags: [admin, documentation]
---
```

## Admonitions

SveltePress includes built-in admonitions using remark-directive syntax for callout blocks.

### Basic Syntax

```markdown
:::type[Title]{icon=icon-collection:icon-name}
Content goes here
:::
```

### Available Types

**Tip**

```markdown
:::tip[Tip title]
Some tip content
:::
```

**Info**

```markdown
:::info[Info title]
Some info content
:::
```

**Note**

```markdown
:::note[Note title]
Some note content
:::
```

**Warning**

```markdown
:::warning[Warning title]
Some warning content
:::
```

**Important**

```markdown
:::important[Important title]
Some important content
:::
```

**Caution**

```markdown
:::caution[Caution title]
Some caution content
:::
```

### Custom Icons

You can add custom icons from iconify collections (requires pre-build configuration):

```markdown
:::tip[Custom Icon Tip]{icon=ph:smiley}
Content with custom icon
:::
```

## Built-in Components

SveltePress provides several built-in components that can be used directly in markdown files.

### Link Component

```markdown
<Link to="https://github.com/" label="Github" />
<Link to="/" label="Home page" />
```

**Props:**

- `label` - The link label text
- `to` - The link address
- `withBase` - Whether to include SvelteKit base path (default: true)

### Tabs & TabPanel

````markdown
<Tabs activeName="Svelte">
  <TabPanel name="Svelte">
    ```svelte title="Counter.svelte"
    <script>
      let count = $state(0)
    </script>
    <button onclick={() => count++}>
      You've clicked {count} times
    </button>
    ```
  </TabPanel>
  <TabPanel name="Vue">
    ```html title="Counter.vue"
    <script setup>
      import { ref } from 'vue'
      const count = ref(0)
    </script>
    <button @click="count++">
      You've clicked {count} times
    </button>
    ```
  </TabPanel>
</Tabs>
````

**Tab Props:**

- `activeName` - Default active panel name
- `bodyPadding` - Whether panel body has padding (default: true)

**TabPanel Props:**

- `name` - Panel name
- `activeIcon` - Icon when tab is active
- `inactiveIcon` - Icon when tab is inactive

### Expansion (Collapsible)

```markdown
<Expansion title="Click to expand/fold panel">
  <div class="text-[24px]">Some content</div>
</Expansion>
```

**Props:**

- `title` - Expansion title
- `showIcon` - Show/hide icon (default: true)
- `headerStyle` - Custom header inline style
- `bind:expanded` - Control expanded status (default: false)

### Icons

Display iconify icons (requires pre-build configuration):

```markdown
<IconifyIcon collection="vscode-icons" name="file-type-svelte" />
```

### Floating

```markdown
<Floating placement="top">
  <div class="text-xl b-1 b-solid b-blue rounded py-10 px-4">
    Trigger
  </div>
  {#snippet floatingContent()}
    <div class="bg-white dark:bg-dark b-solid b-1 b-red rounded p-4">
      Floating content
    </div>
  {/snippet}
</Floating>
```

**Props:**

- `alwaysShow` - Always show floating content (default: false)
- `placement` - Position (default: bottom)
- `floatingClass` - Additional CSS classes

### CodeBlock

```markdown
<CodeBlock lang="ts" code="const foo = 'bar'" />
```

**Props:**

- `lang` - Language name ('svelte', 'md', 'js', etc.)
- `code` - Code content

## Svelte in Markdown

SveltePress allows you to write Svelte syntax directly in markdown files.

### Script Tags

```markdown
<script>
  let count = $state(0)
  const items = ['foo', 'bar', 'zoo']
  let boolVal = $state(false)
</script>
```

### Interactive Elements

```markdown
<button onclick={() => count++}>
You've clicked {count} times
</button>
```

### Svelte Logic

```markdown
{#if boolVal}

  <p>Condition is true</p>
{/if}

{#each items as item}

  <li>{item}</li>
{/each}

{#await promise}

  <p>Loading...</p>
{:then value}
  <p>Result: {value}</p>
{:catch error}
  <p>Error: {error}</p>
{/await}
```

### Reactive Statements

```markdown
<script>
  let name = $state('world')
  let greeting = $derived(`Hello ${name}!`)
</script>

<p>{greeting}</p>
```

### Snippets

```markdown
{#snippet mySnippet(name)}

  <p>Hello {name}!</p>
{/snippet}

{@render mySnippet('SveltePress')}
```

## Standard Markdown Features

### Headers

```markdown
# H1 Header

## H2 Header

### H3 Header

#### H4 Header

##### H5 Header

###### H6 Header
```

### Text Formatting

```markdown
**Bold text**
_Italic text_
**_Bold and italic_**
~~Strikethrough~~
`Inline code`
```

### Lists

**Unordered:**

```markdown
- Item 1
- Item 2
    - Nested item
    - Another nested item
- Item 3
```

**Ordered:**

```markdown
1. First item
2. Second item
    1. Nested item
    2. Another nested item
3. Third item
```

### Links and Images

```markdown
[Link text](https://example.com)
[Link with title](https://example.com 'Title')
![Alt text](image.jpg)
![Alt text](image.jpg 'Image title')
```

### Code Blocks

**With syntax highlighting:**

````markdown
```javascript
function hello() {
    console.log('Hello, world!');
}
```
````

````

**With title:**
```markdown
```svelte title="Counter.svelte"
<script>
  let count = $state(0)
</script>
````

````

### Tables
```markdown
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Row 1    | Cell 1   | Cell 2   |
| Row 2    | Cell 3   | Cell 4   |
````

### Blockquotes

```markdown
> This is a blockquote
>
> With multiple lines
```

### Horizontal Rule

```markdown
---
```

## Best Practices

### Always Use Quotes

Always use quotes in markdown files when working with Svelte attributes:

```markdown
<!-- Good -->

<button onclick="{() => count++}">Click me</button>

<!-- Also good -->

<button onclick={() => count++}>Click me</button>
```

### Component Imports

When using custom Svelte components in markdown:

```markdown
<script>
  import MyComponent from './MyComponent.svelte'
</script>

<MyComponent prop="value" />
```

### Iconify Icon Configuration

Icons must be pre-configured in your SveltePress config for admonitions and IconifyIcon components to work.

### Manual Imports in Svelte Files

Built-in components work directly in markdown but need manual imports in .svelte files:

```svelte
<script>
  import { Link, Tabs, TabPanel } from '@sveltepress/theme-default/components'
</script>
```

## Advanced Features

### Custom Layouts

Define custom layouts via frontmatter:

```yaml
---
layout: custom
---
```

### Plugin Integration

SveltePress integrates with remark and rehype plugins for extended functionality.

### Table of Contents

Generate TOC from headings:

```markdown
{#each frontmatter.toc as toc}

  <li><a href="#{toc.id}">{toc.value}</a></li>
{/each}
```

This reference covers the core markdown features available in SveltePress. The combination of standard markdown, Svelte components, and built-in features makes SveltePress a powerful tool for creating interactive documentation and content sites.
