<script lang="ts">
    import ChevronLeft from '$icons/lucide/chevron-left';
    import ChevronRight from '$icons/lucide/chevron-right';
    import ListFilter from '$icons/lucide/list-filter';
    import ListRestart from '$icons/lucide/list-restart';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import * as Popover from 'pika-ux/shadcn/popover';
    import { Separator } from 'pika-ux/shadcn/separator';
    import { getContext } from 'svelte';
    import AgentEntityFilter from './filters/agent-entity-filter.svelte';
    import AgentsFilter from './filters/agents-filter.svelte';
    import ChatAppsFilter from './filters/chatapps-filter.svelte';
    import DirectiveIdFilter from './filters/directive-id-filter.svelte';
    import EntityFilter from './filters/entity-filter.svelte';
    import ToolsFilter from './filters/tools-filter.svelte';
    import { createDefaultSearchQuery } from './utils';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const iaState = siteAdmin.instructionAugmentation;
    let advancedOpen = $state(false);
</script>

<Popover.Root>
    <Popover.Trigger>
        {#snippet child({ props })}
            <Button {...props} variant="outline" size="sm" class="h-8">
                <ListFilter class="w-4 h-4" />
            </Button>
        {/snippet}
    </Popover.Trigger>
    <Popover.Content class="p-0 {advancedOpen ? 'w-[800px]' : 'w-[400px]'}">
        <div class="flex flex-row">
            <div class="flex flex-col w-[400px]">
                <div class="pl-4 pr-1 flex items-center justify-between pt-1">
                    <div class="text-sm font-medium">Scope Filters</div>
                    <div>
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-8"
                            onclick={() => {
                                iaState.searchQuery = createDefaultSearchQuery();
                            }}
                        >
                            <ListRestart class="w-3 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 {advancedOpen ? 'bg-gray-50' : ''}"
                            onclick={() => (advancedOpen = !advancedOpen)}
                        >
                            {#if advancedOpen}
                                <ChevronLeft class="w-3 h-4 text-primary" />
                            {:else}
                                <ChevronRight class="w-3 h-4" />
                            {/if}
                        </Button>
                    </div>
                </div>
                <Separator />
                <div class="p-4 pr-2 flex flex-col gap-4">
                    <ChatAppsFilter />
                    <AgentsFilter />
                    <ToolsFilter />
                    <EntityFilter />
                    <AgentEntityFilter />
                </div>
            </div>
            {#if advancedOpen}
                <div class="p-0 m-0 h-auto bg-border" style="width: 1px;"></div>
                <div class="flex flex-col w-[400px]">
                    <div class="pl-4 pr-1 flex items-center justify-between pt-1 h-9">
                        <div class="text-sm font-medium">Other Filters</div>
                    </div>
                    <Separator />
                    <div class="p-4 pr-2 flex flex-col gap-4">
                        <DirectiveIdFilter />
                    </div>
                </div>
            {/if}
        </div>
    </Popover.Content>
</Popover.Root>
