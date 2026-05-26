<script lang="ts">
    import PinOff from '$icons/lucide/pin-off';
    import Share from '$icons/lucide/share-2';
    import { getLegacyChatsSectionHeader } from '$lib/custom/legacy-chats-section-header';
    import { Button } from 'pika-ux/shadcn/button';
    import * as Sidebar from 'pika-ux/shadcn/sidebar';
    import { getContext } from 'svelte';
    import { ChatAppState } from '../chat-app.state.svelte';

    const chat = getContext<ChatAppState>('chatAppState');

    const LegacyChatsHeader = getLegacyChatsSectionHeader();

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

{#if chat.legacyChatsLoaded}
    <Sidebar.Group>
        <Sidebar.GroupLabel>
            {#if LegacyChatsHeader}
                <svelte:component this={LegacyChatsHeader} />
            {/if}
        </Sidebar.GroupLabel>
        <div class="flex flex-col w-full pl-2">
            {#if chat.loadingLegacyChatSessions}
                <div class="text-xs text-muted-foreground px-2 py-1">Loading...</div>
            {:else if chat.legacyChatSessions.length === 0}
                <div class="text-xs text-muted-foreground px-2 py-1">No legacy sessions found.</div>
            {:else}
                {#each chat.legacyChatSessions as session}
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
{/if}

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
