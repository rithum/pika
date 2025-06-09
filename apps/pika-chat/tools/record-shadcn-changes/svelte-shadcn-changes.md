# Svelte Shad CN Component Customizations

This document tracks customizations made to Svelte Shad CN components in our project. It serves as a reference for maintaining customizations when updating components.

## Customizations

### Sheet Content

**File Paths:**

```
Original: apps/pika-chat/tools/record-shadcn-changes/original-unmodified-shadcn-components/sheet-content.svelte
Modified: apps/pika-chat/src/lib/components/ui/sheet/sheet-content.svelte
```

**Customization Purpose:**
The Sheet component was enhanced to support:

1. A "full" mode that removes padding and the close button
2. Custom width specification for side sheets

**Changes Made:**

1. **Added "full" variant to tailwind-variants definition:**

    ```svelte
    export const sheetVariants = tv({
        base: 'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500', // Removed p-6 from base
        variants: {
            side: {
                // ... existing side variants ...
            },
            full: {
                true: 'p-0',
                false: 'p-6',
            },
        },
        defaultVariants: {
            side: 'right',
            full: false,
        },
    });
    ```

2. **Updated props to add full and width parameters:**

    ```svelte
    let {
        ref = $bindable(null),
        class: className,
        portalProps,
        side = 'right',
        full = false,
        width,
        children,
        ...restProps
    }: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
        portalProps?: SheetPrimitive.PortalProps;
        side?: Side;
        full?: boolean;
        width?: string;
        children: Snippet;
    } = $props();
    ```

3. **Added custom width calculation logic:**

    ```svelte
    const contentStyles = $derived(
        width && (side === 'left' || side === 'right') ? { width, maxWidth: width } : undefined
    );
    ```

4. **Updated component usage in template:**
    - Applied the full variant to the component class
    - Added style binding for custom width
    - Conditionally rendered the close button based on full mode
    - Updated the import path for SheetOverlay

**Steps to Reapply Changes:**

1. Remove the `p-6` from the base class and add it to a new `full` variant
2. Add the full variant with true/false options in the sheetVariants
3. Update the defaultVariants to include full: false
4. Add `full` and `width` props to the component props
5. Create a `contentStyles` computation for custom width support
6. Apply the full variant to the component's class binding
7. Add the style binding using contentStyles
8. Update the close button rendering to be conditional on `!full`
9. Fix the import path for SheetOverlay

**Note:** The modified component also corrected the import path for SheetOverlay from `../../src/lib/components/ui/sheet/sheet-overlay.svelte` to `./sheet-overlay.svelte`.

### Sidebar Context

**File Paths:**

```
Original: apps/pika-chat/tools/record-shadcn-changes/original-unmodified-shadcn-components/sidebar/context.svelte.ts
Modified: apps/pika-chat/src/lib/components/ui/sidebar/context.svelte.ts
```

**Customization Purpose:**
The Sidebar context was modified to expose the `SidebarState` class for external usage and type checking.

**Changes Made:**

1. **Made SidebarState class exportable:**

    ```typescript
    // Changed from:
    class SidebarState {

    // To:
    export class SidebarState {
    ```

2. **Disabled keyboard shortcut functionality:**
    - Commented out the keyboard shortcut handler code to prevent the sidebar from being toggled via keyboard shortcuts
    ```typescript
    handleShortcutKeydown = (e: KeyboardEvent) => {
        // if (e.key === SIDEBAR_KEYBOARD_SHORTCUT && (e.metaKey || e.ctrlKey)) {
        //     e.preventDefault();
        //     this.toggle();
        // }
    };
    ```

**Steps to Reapply Changes:**

1. Add the `export` keyword to the `SidebarState` class declaration
2. Comment out the keyboard shortcut handling code in the `handleShortcutKeydown` method
3. Ensure any files importing `SidebarState` for type checking can now properly access it

**Note:** These changes allow external components to use the `SidebarState` type for proper TypeScript type checking while maintaining the same functionality, and disable the keyboard shortcut toggle feature.
