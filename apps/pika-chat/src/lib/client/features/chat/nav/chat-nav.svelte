<script lang="ts">
    import * as Sidebar from '$comps/ui/sidebar';
    import { Ellipsis } from '$lib/components/ui/breadcrumb';
    import { Button } from '$lib/components/ui/button';
    import { getContext } from 'svelte';
    import { ChatAppState } from '../chat-app.state.svelte';

    const chat = getContext<ChatAppState>('chatAppState');

    let hoveredSessionId: string | null = null;
</script>

<Sidebar.Group>
    {#if chat.sortedChatSessions.length > 0}
        <Sidebar.GroupLabel>Recents</Sidebar.GroupLabel>
        <div class="flex flex-col w-full pl-2">
            {#each chat.sortedChatSessions as session}
                {#if session.sessionId === chat.currentSession?.sessionId}
                    <div class="flex gap-2 items-center w-full justify-between">
                        <div class="truncate text-ellipsis overflow-hidden text-primary text-sm font-medium">
                            {session.title}
                        </div>
                        <Button variant="ghost" size="icon" onclick={(event) => event.stopPropagation()}
                            ><Ellipsis /></Button
                        >
                    </div>
                {:else}
                    <Button
                        variant="ghost"
                        class="w-full text-sm font-medium justify-start p-0"
                        disabled={chat.isStreamingResponseNow}
                        onclick={() => chat.setCurrentSessionById(session.sessionId)}
                        onmouseenter={() => (hoveredSessionId = session.sessionId)}
                        onmouseleave={() => (hoveredSessionId = null)}
                    >
                        <div class="flex items-center w-full justify-between">
                            <div class="truncate text-ellipsis overflow-hidden flex-1 text-left">{session.title}</div>
                            {#if hoveredSessionId === session.sessionId}
                                <Button variant="outline" size="icon" onclick={(event) => event.stopPropagation()}
                                    ><Ellipsis /></Button
                                >
                            {/if}
                        </div>
                    </Button>
                {/if}
            {/each}
        </div>
    {/if}
</Sidebar.Group>
