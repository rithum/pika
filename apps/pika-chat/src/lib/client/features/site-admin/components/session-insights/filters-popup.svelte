<script lang="ts">
    import { ChevronLeft, ChevronRight, ListFilter, ListRestart } from '$icons/lucide';
    import { Button } from '$lib/client-ui/shadcn/button';
    import { Separator } from '$lib/client-ui/shadcn/separator';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import * as Popover from '$ui/shadcn/popover';
    import { getContext } from 'svelte';
    import DatePopup from './date-popup.svelte';
    import type { SessionSearchDateFilter } from '@pika/shared/types/chatbot/chatbot-types';
    import { createDefaultDateFilter } from './utils';
    const appState = getContext<AppState>('appState');
    const sessionInsights = appState.siteAdmin.sessionInsights;

    let advancedOpen = $state(false);
</script>

<Popover.Root>
    <Popover.Trigger>
        {#snippet child({ props })}
            <Button {...props} variant="outline" size="sm" class="h-8 border-dashed">
                <ListFilter class="w-4 h-4" />
            </Button>
        {/snippet}
    </Popover.Trigger>
    <Popover.Content class="p-0 {advancedOpen ? 'w-[800px]' : 'w-[400px]'}">
        <div class="flex flex-row">
            <!-- Basic Filters-->
            <div class="flex flex-col w-[400px]">
                <div class="pl-4 pr-1 flex items-center justify-between pt-1">
                    <div class="text-sm font-medium">Basic Filters</div>
                    <div>
                        <Button variant="ghost" size="sm" class="h-8 border-dashed">
                            <ListRestart class="w-3 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 {advancedOpen ? 'bg-gray-50' : ''}"
                            onclick={() => (advancedOpen = !advancedOpen)}
                        >
                            {#if advancedOpen}
                                <ChevronLeft class="w-3 h-4 text-blue-500" />
                            {:else}
                                <ChevronRight class="w-3 h-4" />
                            {/if}
                        </Button>
                    </div>
                </div>
                <Separator />
                <div class="p-4 flex flex-col gap-4">
                    <DatePopup
                        bind:dateFilter={
                            () => sessionInsights.searchQuery.dateFilter,
                            (value) => {
                                sessionInsights.searchQuery.dateFilter = value;
                            }
                        }
                        placeholder="Select Date"
                        bind:timezone={sessionInsights.timezone}
                    />
                </div>
            </div>
            {#if advancedOpen}
                <!-- Advanced Filters-->
                <div class="p-0 m-0 h-auto bg-border" style="width: 1px;"></div>
                <div class="flex flex-col w-[400px]">
                    <div class="pl-4 pr-1 flex items-center justify-between pt-1 h-9">
                        <div class="text-sm font-medium">Advanced Filters</div>
                    </div>
                    <Separator />
                    <div>my stuff here</div>
                </div>
            {/if}
        </div>
    </Popover.Content>
</Popover.Root>
