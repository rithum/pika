<script lang="ts">
    import ConfigSection from '../config-section.svelte';
    import { Button } from '$lib/components/ui/button';
    import { Checkbox } from '$lib/components/ui/checkbox';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import type { ChatApp } from '@pika/shared/types/chatbot/chatbot-types';

    interface Props {
        selectedChatApp: ChatApp | null;
        title: string;
        description: string;
        enabled: boolean;
        dontCacheThis: boolean;
        isOverrideMode: boolean;
        expanded: boolean;
        isOverridden: (field: string) => boolean;
        getOriginalValue: (field: string) => any;
        onToggleSection: () => void;
        onEnabledChange: (newEnabled: boolean) => void;
    }

    let {
        selectedChatApp,
        title = $bindable(),
        description = $bindable(),
        enabled = $bindable(),
        dontCacheThis = $bindable(),
        isOverrideMode,
        expanded,
        isOverridden,
        getOriginalValue,
        onToggleSection,
        onEnabledChange,
    }: Props = $props();
</script>

<ConfigSection title="Basic Settings" {expanded} onToggle={onToggleSection}>
    <div class="space-y-4">
        <div>
            <div class="flex items-center gap-2">
                <div class="flex flex-col mr-6">
                    <div>
                        <span class="text-sm font-medium">Chat App Status:</span>
                        <span class="font-medium {enabled ? 'text-blue-600' : 'text-red-600'}">
                            {enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                    {#if isOverridden('enabled')}
                        <span class="text-xs text-muted-foreground">
                            (Original: {getOriginalValue('enabled') ? 'Enabled' : 'Disabled'})
                        </span>
                    {/if}
                </div>
                <Button
                    variant={enabled ? 'destructive' : 'default'}
                    size="sm"
                    disabled={!isOverrideMode}
                    onclick={() => isOverrideMode && onEnabledChange(!enabled)}
                    class={isOverridden('enabled') ? 'border-orange-500' : ''}
                >
                    {enabled ? 'Disable Chat App' : 'Enable Chat App'}
                </Button>
            </div>
        </div>

        <div>
            <Label for="title">Title</Label>
            <Input id="title" bind:value={title} placeholder="Chat app title" disabled={!isOverrideMode} />
            {#if isOverridden('title')}
                <p class="text-xs text-muted-foreground mt-1">
                    Original: {getOriginalValue('title')}
                </p>
            {/if}
        </div>

        <div>
            <Label for="description">Description</Label>
            <textarea
                id="description"
                bind:value={description}
                placeholder="Chat app description"
                disabled={!isOverrideMode}
                class="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                rows="3"
            ></textarea>
            {#if isOverridden('description')}
                <p class="text-xs text-muted-foreground mt-1">
                    Original: {getOriginalValue('description')}
                </p>
            {/if}
        </div>

        <div class="flex items-center space-x-2">
            <Checkbox
                id="dontCacheThis"
                bind:checked={dontCacheThis}
                disabled={!isOverrideMode}
                class={isOverridden('dontCacheThis') ? 'border-orange-500' : ''}
            />
            <Label for="dontCacheThis">Don't Cache (for development)</Label>
            {#if isOverridden('dontCacheThis')}
                <span class="text-xs text-muted-foreground">
                    (Original: {getOriginalValue('dontCacheThis') ? 'Not caching' : 'Caching'})
                </span>
            {/if}
        </div>

        <div class="text-sm">
            <span class="text-muted-foreground">Agent ID:</span>
            <span class="ml-2">{selectedChatApp?.agentId}</span>
        </div>
    </div>
</ConfigSection>
