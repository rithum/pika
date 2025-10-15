# ScrollableTabs Component

A Svelte 5 component for creating scrollable tab interfaces with support for pinned tabs and an add button.

## Features

- **Pinned Tabs**: Non-scrollable tabs on the left that remain visible
- **Scrollable Section**: Horizontally scrollable tabs in the center
- **Add Button**: Persistent "+ Add" button on the right
- **Tailwind Styled**: Uses Tailwind CSS classes exclusively
- **Svelte 5**: Built with Svelte 5 runes ($state, $derived, $effect)
- **Keyboard Accessible**: Full keyboard navigation support

## Components

- `ScrollableTabs.Root` - Main container (provides context)
- `ScrollableTabs.List` - Tab bar container
- `ScrollableTabs.PinnedSection` - Container for pinned tabs
- `ScrollableTabs.ScrollableSection` - Container for scrollable tabs
- `ScrollableTabs.PinnedTrigger` - Individual pinned tab
- `ScrollableTabs.Trigger` - Individual scrollable tab
- `ScrollableTabs.AddButton` - Add new tab button
- `ScrollableTabs.Content` - Content area for each tab

## Basic Usage

```svelte
<script lang="ts">
    import * as ScrollableTabs from 'pika-ux/pika/scrollable-tabs';

    let activeTab = $state('dashboard');

    function handleAddTab() {
        console.log('Add new tab clicked');
    }
</script>

<ScrollableTabs.Root bind:value={activeTab}>
    <ScrollableTabs.List>
        <!-- Pinned tabs on the left -->
        <ScrollableTabs.PinnedSection>
            <ScrollableTabs.PinnedTrigger value="dashboard">
                📊 Dashboard
            </ScrollableTabs.PinnedTrigger>
            <ScrollableTabs.PinnedTrigger value="quick-actions">
                ⚡ Quick Actions
            </ScrollableTabs.PinnedTrigger>
        </ScrollableTabs.PinnedSection>

        <!-- Scrollable tabs in the middle -->
        <ScrollableTabs.ScrollableSection>
            <ScrollableTabs.Trigger value="trends">
                📈 Trends
            </ScrollableTabs.Trigger>
            <ScrollableTabs.Trigger value="notifications">
                🔔 Notifications
            </ScrollableTabs.Trigger>
            <ScrollableTabs.Trigger value="settings">
                🛠️ Settings
            </ScrollableTabs.Trigger>
            <ScrollableTabs.Trigger value="experiments">
                🧪 Experiments
            </ScrollableTabs.Trigger>
        </ScrollableTabs.ScrollableSection>

        <!-- Add button on the right -->
        <ScrollableTabs.AddButton onclick={handleAddTab} />
    </ScrollableTabs.List>

    <!-- Tab content -->
    <ScrollableTabs.Content value="dashboard">
        <div class="p-6">
            <h2 class="text-xl font-semibold mb-2">📊 Dashboard</h2>
            <p>Dashboard content goes here...</p>
        </div>
    </ScrollableTabs.Content>

    <ScrollableTabs.Content value="quick-actions">
        <div class="p-6">
            <h2 class="text-xl font-semibold mb-2">⚡ Quick Actions</h2>
            <p>Quick actions content goes here...</p>
        </div>
    </ScrollableTabs.Content>

    <!-- More content sections... -->
</ScrollableTabs.Root>
```

## Advanced Usage

### Custom Add Button

```svelte
<ScrollableTabs.AddButton onclick={handleAddTab}>
    <span class="text-sm">+ New</span>
</ScrollableTabs.AddButton>
```

### Custom Styling

```svelte
<ScrollableTabs.Root value={activeTab} class="max-w-5xl mx-auto">
    <ScrollableTabs.List class="border-b-2">
        <ScrollableTabs.PinnedSection class="bg-blue-50">
            <!-- Pinned tabs -->
        </ScrollableTabs.PinnedSection>

        <ScrollableTabs.ScrollableSection class="bg-gray-50">
            <!-- Scrollable tabs -->
        </ScrollableTabs.ScrollableSection>
    </ScrollableTabs.List>
</ScrollableTabs.Root>
```

### Disabled Tabs

```svelte
<ScrollableTabs.Trigger value="disabled-tab" disabled>
    Disabled Tab
</ScrollableTabs.Trigger>
```

### Controlled State

```svelte
<script lang="ts">
    let activeTab = $state('dashboard');

    function handleValueChange(newValue: string) {
        console.log('Tab changed to:', newValue);
        // Perform additional logic here
    }
</script>

<ScrollableTabs.Root
    bind:value={activeTab}
    onValueChange={handleValueChange}
>
    <!-- ... -->
</ScrollableTabs.Root>
```

## Props

### Root

- `value` (string, bindable) - Currently active tab value
- `onValueChange` (function, optional) - Callback when tab changes
- `class` (string, optional) - Additional CSS classes

### List

- `class` (string, optional) - Additional CSS classes

### PinnedSection / ScrollableSection

- `class` (string, optional) - Additional CSS classes

### Trigger / PinnedTrigger

- `value` (string, required) - Tab identifier
- `disabled` (boolean, optional) - Disable tab interaction
- `class` (string, optional) - Additional CSS classes

### AddButton

- `onclick` (function, optional) - Click handler
- `disabled` (boolean, optional) - Disable button
- `class` (string, optional) - Additional CSS classes

### Content

- `value` (string, required) - Tab identifier to match
- `class` (string, optional) - Additional CSS classes

## Styling

The component uses Tailwind CSS and respects your theme's color variables:

- `bg-background`, `text-foreground` - Main background/text
- `bg-muted`, `text-muted-foreground` - Muted sections
- `bg-primary`, `text-primary` - Primary color accents
- `ring-ring` - Focus ring color

The scrollable section hides scrollbars by default for a cleaner look.

## Accessibility

- Full keyboard navigation support
- Focus management with visible focus rings
- ARIA-compliant button roles
- Disabled state support
