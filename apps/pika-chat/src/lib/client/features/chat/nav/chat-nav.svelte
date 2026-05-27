<script lang="ts">
    import PinOff from '$icons/lucide/pin-off';
    import Share from '$icons/lucide/share-2';
    import { Button } from 'pika-ux/shadcn/button';
    import * as Sidebar from 'pika-ux/shadcn/sidebar';
    import { getContext } from 'svelte';
    import { ChatAppState } from '../chat-app.state.svelte';

    const chat = getContext<ChatAppState>('chatAppState');

    let hoveredSessionId: string | null = null;
    let hoveredShareId: string | null = null;
</script>

<!-- Pinned Sessions Section -->
{#if chat.pinnedSessions.length > 0}
    <Sidebar.Group>
        <Sidebar.GroupLabel>
            <div class="flex items-center justify-between w-full">
                <span>Pinned</span>
                <!-- {#if chat.pinnedSessionsNextToken}
                    <Button
                        variant="ghost"
                        size="sm"
                        class="text-xs px-2 py-1 h-6"
                        onclick={() => chat.loadMorePinnedSessions()}
                    >
                        Load More
                    </Button>
                {/if} -->
            </div>
        </Sidebar.GroupLabel>
        <div class="flex flex-col w-full pl-2">
            {#each chat.pinnedSessions as pinnedItem}
                {@const isCurrentSession = pinnedItem.pinnedSession.sessionId === chat.currentSession?.sessionId}
                <!-- {@const isCurrentShare = pinnedItem.shareId === chat.currentShareId}
                {@const isCurrent = isCurrentSession || isCurrentShare} -->

                {#if isCurrentSession}
                    <div class="flex gap-2 items-center w-full justify-between">
                        <div
                            class="truncate text-ellipsis overflow-hidden text-primary text-sm font-medium flex items-center gap-1 leading-[36px]"
                        >
                            {pinnedItem.pinnedSession.sessionId
                                ? chat.chatSessions.find((s) => s.sessionId === pinnedItem.pinnedSession.sessionId)
                                      ?.title || 'Untitled'
                                : `Shared: ${pinnedItem.pinnedSession.shareId?.slice(-8)}`}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            class="text-xs px-2 py-1 h-6"
                            onclick={() => chat.unpinSession(pinnedItem.chatSession.sessionId)}
                        >
                            <PinOff class="w-3 h-3" />
                        </Button>
                    </div>
                {:else}
                    <Button
                        variant="ghost"
                        class="w-full text-sm font-medium justify-start p-0"
                        disabled={chat.isStreamingResponseNow}
                        onclick={async () => {
                            if (pinnedItem.pinnedSession.sessionId) {
                                // Regular session - set as current
                                chat.setCurrentSessionById(pinnedItem.pinnedSession.sessionId);
                            } else if (pinnedItem.pinnedSession.shareId) {
                                // Shared session - load and set as current
                                await chat.loadSharedSession(pinnedItem.pinnedSession.shareId);
                            }
                        }}
                        onmouseenter={() => {
                            if (pinnedItem.pinnedSession.sessionId)
                                hoveredSessionId = pinnedItem.pinnedSession.sessionId;
                            if (pinnedItem.pinnedSession.shareId) hoveredShareId = pinnedItem.pinnedSession.shareId;
                        }}
                        onmouseleave={() => {
                            hoveredSessionId = null;
                            hoveredShareId = null;
                        }}
                    >
                        <div class="flex items-center w-full justify-between">
                            <div
                                class="truncate text-ellipsis overflow-hidden flex-1 text-left flex items-center gap-1"
                            >
                                {pinnedItem.chatSession.title}
                            </div>
                            {#if hoveredSessionId === pinnedItem.pinnedSession.sessionId || hoveredShareId === pinnedItem.pinnedSession.shareId}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    class="text-xs px-2 py-1 h-6"
                                    onclick={(event) => {
                                        event.stopPropagation();
                                        chat.unpinSession(pinnedItem.chatSession.sessionId);
                                    }}
                                >
                                    <PinOff class="w-3 h-3" />
                                </Button>
                            {/if}
                        </div>
                    </Button>
                {/if}
            {/each}
        </div>
    </Sidebar.Group>
{/if}

<!-- Recent Shared Section -->
{#if chat.recentSharedSessionVisits.length > 0}
    <Sidebar.Group>
        <Sidebar.GroupLabel>Recent Shared</Sidebar.GroupLabel>
        <div class="flex flex-col w-full pl-2">
            {#each chat.recentSharedSessionVisits as sharedVisit}
                {#if sharedVisit.shareId === chat.currentSession?.shareId}
                    <div class="flex gap-2 items-center w-full justify-between">
                        <div
                            class="truncate text-ellipsis overflow-hidden text-primary text-sm font-medium flex items-center gap-1 leading-[36px]"
                        >
                            {sharedVisit.title}
                        </div>
                    </div>
                {:else}
                    <Button
                        variant="ghost"
                        class="w-full text-sm font-medium justify-start p-0"
                        disabled={chat.isStreamingResponseNow}
                        onclick={async () => await chat.loadSharedSession(sharedVisit.shareId)}
                    >
                        <div class="flex items-center w-full justify-between">
                            <div
                                class="truncate text-ellipsis overflow-hidden flex-1 text-left flex items-center gap-1"
                            >
                                {sharedVisit.title}
                            </div>
                        </div>
                    </Button>
                {/if}
            {/each}
        </div>
    </Sidebar.Group>
{/if}

{#each chat.sessionSources as source (source.id)}
    {@const status = chat.sourceStatus(source.id)}
    {#if status === 'loading'}
        <Sidebar.Group>
            {#if source.sidebarSlot?.trigger}
                <svelte:component this={source.sidebarSlot.trigger} />
            {:else}
                <div class="text-xs text-muted-foreground px-2 py-1">Loading...</div>
            {/if}
        </Sidebar.Group>
    {:else if status === 'loaded'}
        <Sidebar.Group>
            <Sidebar.GroupLabel>
                {#if source.sidebarSlot?.header}
                    <svelte:component this={source.sidebarSlot.header} />
                {:else if source.label}
                    {source.label}
                {/if}
            </Sidebar.GroupLabel>
            <div class="flex flex-col w-full pl-2">
                {#if chat.sourceSessions(source.id).length === 0}
                    <div class="text-xs text-muted-foreground px-2 py-1">No sessions found.</div>
                {:else}
                    {#each chat.sourceSessions(source.id) as session (session.sessionId)}
                        <Button
                            variant="ghost"
                            class="w-full text-sm font-medium justify-start p-0"
                            disabled={chat.isStreamingResponseNow}
                            onclick={() => chat.setCurrentSessionById(session.sessionId)}
                        >
                            <div class="truncate text-ellipsis overflow-hidden flex-1 text-left flex items-center gap-1">
                                {session.title || session.sessionId}
                            </div>
                        </Button>
                    {/each}
                {/if}
            </div>
        </Sidebar.Group>
    {:else if status === 'error'}
        <Sidebar.Group>
            <Sidebar.GroupLabel>
                {#if source.sidebarSlot?.header}
                    <svelte:component this={source.sidebarSlot.header} />
                {:else if source.label}
                    {source.label}
                {/if}
            </Sidebar.GroupLabel>
            <div class="flex flex-col w-full pl-2">
                <div class="text-xs text-muted-foreground px-2 py-1">This section could not be loaded.</div>
            </div>
        </Sidebar.Group>
    {/if}
{/each}

<!-- My Chats Section (existing, enhanced) -->
<Sidebar.Group>
    <Sidebar.GroupLabel>My Chats</Sidebar.GroupLabel>
    <div class="flex flex-col w-full pl-2">
        {#each chat.sortedChatSessions as session}
            {#if session.sessionId === chat.currentSession?.sessionId}
                <div class="flex gap-2 items-center w-full justify-between">
                    <div
                        class="truncate text-ellipsis overflow-hidden text-primary text-sm font-medium flex items-center gap-1 leading-[36px]"
                    >
                        {#if chat.getSessionShareStatus(session.sessionId)}
                            <Share class="w-3 h-3 text-primary" />
                        {/if}
                        {session.title}
                    </div>
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
                        <div class="truncate text-ellipsis overflow-hidden flex-1 text-left flex items-center gap-1">
                            {session.title}
                        </div>
                    </div>
                </Button>
            {/if}
        {/each}
    </div>
</Sidebar.Group>
