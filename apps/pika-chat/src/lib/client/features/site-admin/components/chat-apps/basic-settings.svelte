<script lang="ts">
    import type { ChatApp } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import { Checkbox } from 'pika-ux/shadcn/checkbox';
    import { Input } from 'pika-ux/shadcn/input';
    import { Label } from 'pika-ux/shadcn/label';
    import ConfigSection from '../config-section.svelte';

    interface Props {
        chatApp: ChatApp;
        chatAppOriginal: ChatApp;
        isOverrideMode: boolean;
        expanded: boolean;
        onToggleSection: () => void;
        disabled: boolean;
    }

    let {
        chatApp = $bindable(),
        chatAppOriginal,
        isOverrideMode,
        expanded,
        onToggleSection,
        disabled,
    }: Props = $props();

    let app = $derived(isOverrideMode ? chatApp : chatAppOriginal);
</script>

<ConfigSection title="Basic Settings" {expanded} onToggle={onToggleSection}>
    <div class="space-y-4">
        <div>
            <div class="flex items-center gap-2">
                <div class="flex flex-col mr-6">
                    <div>
                        <span class="text-sm font-medium">Chat App Status:</span>
                        <span class="font-medium {app.enabled ? 'text-success' : 'text-destructive'}">
                            {app.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                    {#if isOverrideMode}
                        <span class="text-xs text-muted-foreground">
                            (Original: {chatAppOriginal.enabled ? 'Enabled' : 'Disabled'})
                        </span>
                    {/if}
                </div>
                <Button
                    variant={app.enabled ? 'destructive' : 'default'}
                    size="sm"
                    disabled={!isOverrideMode || disabled}
                    onclick={() => isOverrideMode && (app.enabled = !app.enabled)}
                    class={isOverrideMode && app.enabled ? 'border-orange-500' : ''}
                >
                    {app.enabled ? 'Disable Chat App' : 'Enable Chat App'}
                </Button>
                <PopupHelp popoverClasses="w-60">
                    <div class="text-xs text-muted-foreground flex flex-col gap-3">
                        <span>
                            A disabled chat app will not be available to any users and all other access rules will be
                            ignored.
                        </span>
                        <span>
                            Clicking this button will not immediately {app.enabled ? 'disable' : 'enable'} the chat app.
                            It will only be {app.enabled ? 'disabled' : 'enabled'} after you click "Save" above.
                        </span>
                    </div>
                </PopupHelp>
            </div>
        </div>

        <div>
            <Label for="title">Title</Label>
            <Input
                id="title"
                bind:value={app.title}
                placeholder="Chat app title"
                disabled={!isOverrideMode || disabled}
            />
            {#if isOverrideMode}
                <p class="text-xs text-muted-foreground mt-1">
                    Original: {chatAppOriginal.title ?? 'Not set'}
                </p>
            {/if}
        </div>

        <div>
            <Label for="description">Description</Label>
            <textarea
                id="description"
                bind:value={app.description}
                placeholder="Chat app description"
                disabled={!isOverrideMode || disabled}
                class="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                rows="3"
            ></textarea>
            {#if isOverrideMode}
                <p class="text-xs text-muted-foreground mt-1">
                    Original: {chatAppOriginal.description ?? 'Not set'}
                </p>
            {/if}
        </div>

        <div class="flex items-center space-x-2">
            <Checkbox
                id="dontCacheThis"
                bind:checked={() => app.dontCacheThis ?? false, (value) => (app.dontCacheThis = value)}
                disabled={!isOverrideMode || disabled}
                class={isOverrideMode && app.dontCacheThis ? 'border-orange-500' : ''}
            />
            <Label for="dontCacheThis">Don't Cache (for development)</Label>
            {#if isOverrideMode}
                <span class="text-xs text-muted-foreground">
                    (Original: {chatAppOriginal.dontCacheThis ? 'Not Caching' : 'Caching'})
                </span>
            {/if}
        </div>

        <div class="text-sm">
            <span class="text-muted-foreground">Agent ID:</span>
            <span class="ml-2">{chatApp?.agentId}</span>
        </div>
    </div>
</ConfigSection>
