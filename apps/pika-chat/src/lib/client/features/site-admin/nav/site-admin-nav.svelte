<script lang="ts">
    import * as Sidebar from '$comps/ui/sidebar';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { Button } from '$lib/components/ui/button';
    import { getContext } from 'svelte';
    import { goto } from '$app/navigation';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
</script>

<Sidebar.Group>
    <div class="flex flex-col w-full pl-2">
        {#each siteAdmin.nav.items as item}
            {#if item.isActive}
                <div class="flex gap-2 items-center w-full justify-between p-2">
                    <div class="flex items-center gap-2">
                        {#if item.icon}
                            <item.icon class="w-4 h-4" />
                        {/if}
                        <div class="truncate text-ellipsis overflow-hidden text-primary text-sm font-medium">
                            {item.title}
                        </div>
                    </div>
                </div>
            {:else}
                <Button
                    variant="ghost"
                    class="w-full text-sm font-medium justify-start p-2"
                    onclick={() => goto(item.url)}
                >
                    <div class="flex items-center gap-2 w-full">
                        {#if item.icon}
                            <item.icon class="w-4 h-4" />
                        {/if}
                        <div class="truncate text-ellipsis overflow-hidden flex-1 text-left">{item.title}</div>
                    </div>
                </Button>
            {/if}

            {#if item.items && item.items.length > 0}
                <div class="ml-6 flex flex-col gap-1">
                    {#each item.items as subItem}
                        {#if subItem.isActive}
                            <div class="py-1">
                                <div class="text-primary text-xs font-medium">
                                    {subItem.title}
                                </div>
                            </div>
                        {:else}
                            <Button
                                variant="ghost"
                                class="w-full text-xs justify-start p-1 h-auto"
                                onclick={() => goto(subItem.url)}
                            >
                                <div class="truncate text-ellipsis overflow-hidden text-left">{subItem.title}</div>
                            </Button>
                        {/if}
                    {/each}
                </div>
            {/if}
        {/each}
    </div>
</Sidebar.Group>
