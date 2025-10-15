# Shadcn Component Fixes

This document tracks fixes applied to shadcn-svelte components to ensure compatibility with Tailwind CSS v4.

## Dropdown Menu: Data Attribute Syntax Fix

### Problem

Dropdown menu items were not highlighting on hover. The `data-highlighted` attribute was being set correctly by bits-ui on hover, but the corresponding Tailwind CSS styles were not applying.

### Root Cause

The dropdown menu components were using incorrect Tailwind CSS v4 syntax for data attributes:

- **Incorrect:** `data-highlighted:bg-accent` (without brackets)
- **Correct:** `data-[highlighted]:bg-accent` (with brackets)

In Tailwind CSS v4, data attributes must use the bracket syntax `data-[attribute]:` to work natively. The version without brackets would require a custom variant definition via `@custom-variant`.

### Files Changed

#### 1. `packages/pika-ux/src/shadcn/dropdown-menu/dropdown-menu-item.svelte`

**Before:**

```svelte
class={cn(
    "data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 data-[variant=destructive]:data-highlighted:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground outline-hidden relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[disabled]:pointer-events-none data-[inset]:pl-8 data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    className
)}
```

**After:**

```svelte
class={cn(
    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:data-[highlighted]:bg-destructive/10 dark:data-[variant=destructive]:data-[highlighted]:bg-destructive/20 data-[variant=destructive]:data-[highlighted]:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground outline-hidden relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[disabled]:pointer-events-none data-[inset]:pl-8 data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    className
)}
```

**Changes:**

- `data-highlighted:` → `data-[highlighted]:`
- `data-[variant=destructive]:data-highlighted:` → `data-[variant=destructive]:data-[highlighted]:`

#### 2. `packages/pika-ux/src/shadcn/dropdown-menu/dropdown-menu-sub-trigger.svelte`

**Before:**

```svelte
class={cn(
    "data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground outline-hidden [&_svg:not([class*='text-'])]:text-muted-foreground flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[disabled]:pointer-events-none data-[inset]:pl-8 data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    className
)}
```

**After:**

```svelte
class={cn(
    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground outline-hidden [&_svg:not([class*='text-'])]:text-muted-foreground flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[disabled]:pointer-events-none data-[inset]:pl-8 data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    className
)}
```

**Changes:**

- `data-highlighted:` → `data-[highlighted]:`

### Why This Fix Works

1. **Tailwind v4 Native Support:** The bracket syntax `data-[attribute]:` is natively supported by Tailwind CSS v4 for arbitrary data attributes.

2. **No Custom Variant Needed:** With the bracket syntax, no custom variant definition is required in the CSS configuration.

3. **Consistency:** This matches the syntax used in other shadcn components like `select-item.svelte` which uses `data-[highlighted]:` and works correctly.

4. **Bits-UI Compatibility:** The bits-ui library sets `data-highlighted` as an attribute on hover, and now Tailwind can properly match and apply the styles.

### Testing

After applying this fix and restarting the dev server, dropdown menu items should highlight with the accent color when hovering over them.

### Related Components

Other components that already use the correct syntax and don't need fixing:

- `dropdown-menu-checkbox-item.svelte` (uses `focus:` instead)
- `dropdown-menu-radio-item.svelte` (uses `focus:` instead)
- `select-item.svelte` (already uses `data-[highlighted]:`)

### Date Applied

October 15, 2025
