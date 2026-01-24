<script lang="ts">
    import Search from '$icons/lucide/search';
    import type { TagDefinition, TagDefinitionWidget } from 'pika-shared/types/chatbot/chatbot-types';
    import { Badge } from 'pika-ux/shadcn/badge';
    import { Input } from 'pika-ux/shadcn/input';
    import { ScrollArea } from 'pika-ux/shadcn/scroll-area';

    interface Props {
        tagDefinitions: TagDefinition<TagDefinitionWidget>[];
        selectedTagDefinition: TagDefinition<TagDefinitionWidget> | undefined;
        onSelect: (tag: TagDefinition<TagDefinitionWidget> | undefined) => void;
        isLoading: boolean;
    }

    let { tagDefinitions, selectedTagDefinition, onSelect, isLoading }: Props = $props();

    let searchTerm = $state('');

    // Filter tag definitions by search term
    const filteredTags = $derived.by(() => {
        if (!searchTerm.trim()) {
            return tagDefinitions;
        }
        const term = searchTerm.toLowerCase();
        return tagDefinitions.filter((tag) => {
            const tagId = `${tag.scope}.${tag.tag}`.toLowerCase();
            const title = (tag.tagTitle || '').toLowerCase();
            const description = (tag.description || '').toLowerCase();
            return tagId.includes(term) || title.includes(term) || description.includes(term);
        });
    });

    // Group tags by scope
    const groupedTags = $derived.by(() => {
        const groups: Record<string, TagDefinition<TagDefinitionWidget>[]> = {};
        for (const tag of filteredTags) {
            if (!groups[tag.scope]) {
                groups[tag.scope] = [];
            }
            groups[tag.scope].push(tag);
        }
        // Sort scopes alphabetically, but put 'pika' first
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === 'pika') return -1;
            if (b === 'pika') return 1;
            return a.localeCompare(b);
        });
        return sortedKeys.map((scope) => ({ scope, tags: groups[scope] }));
    });

    function isSelected(tag: TagDefinition<TagDefinitionWidget>): boolean {
        return selectedTagDefinition?.scope === tag.scope && selectedTagDefinition?.tag === tag.tag;
    }

    function getCommandCount(tag: TagDefinition<TagDefinitionWidget>): number {
        return tag.intentRouterCommands?.length ?? 0;
    }
</script>

<div class="flex flex-col h-full gap-4">
    <!-- Search -->
    <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input type="text" placeholder="Search tags..." class="pl-9" bind:value={searchTerm} />
    </div>

    <!-- Stats -->
    <div class="text-sm text-muted-foreground">
        {filteredTags.length} of {tagDefinitions.length} tag definitions
    </div>

    <!-- Tag list -->
    <ScrollArea class="flex-1 -mx-2">
        {#if isLoading}
            <div class="flex items-center justify-center py-8 text-muted-foreground">Loading tag definitions...</div>
        {:else if filteredTags.length === 0}
            <div class="flex items-center justify-center py-8 text-muted-foreground">
                {#if searchTerm}
                    No tags match your search
                {:else}
                    No tag definitions found
                {/if}
            </div>
        {:else}
            <div class="space-y-4">
                {#each groupedTags as group}
                    <div>
                        <div class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {group.scope}
                            <span class="text-muted-foreground/60">({group.tags.length})</span>
                        </div>
                        <div class="space-y-1">
                            {#each group.tags as tag}
                                {@const commandCount = getCommandCount(tag)}
                                <button
                                    class="w-full px-2 py-2 text-left rounded-md transition-colors hover:bg-muted/50
                                           {isSelected(tag) ? 'bg-muted' : ''}"
                                    onclick={() => onSelect(tag)}
                                >
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="min-w-0 flex-1">
                                            <div class="font-medium text-sm truncate">
                                                {tag.tag}
                                            </div>
                                            <div class="text-xs text-muted-foreground truncate">
                                                {tag.tagTitle || tag.description || 'No description'}
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-1 flex-shrink-0">
                                            {#if commandCount > 0}
                                                <Badge variant="secondary" class="text-xs">
                                                    {commandCount} cmd{commandCount !== 1 ? 's' : ''}
                                                </Badge>
                                            {/if}
                                            {#if tag.usageMode === 'chat-app'}
                                                <Badge variant="outline" class="text-xs">chat-app</Badge>
                                            {/if}
                                        </div>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </ScrollArea>
</div>
