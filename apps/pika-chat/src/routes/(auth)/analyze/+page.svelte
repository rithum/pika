<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import ChatHome from '$client/features/chat/chat-app-main/chat-app-main.svelte';
    import ChatLayout from '$client/features/chat/layout/chat-layout.svelte';
    import { getContext, setContext } from 'svelte';
    import type { PageData } from './$types';
    import { ComponentRegistry } from '$lib/client/features/chat/message-segments/component-registry';

    import * as Sidebar from '$comps/ui/sidebar/index.js';
    import { Slideout, SlideoutContent, SlideoutProvider } from '$comps/ui-pika/slideout';
    import { type Snippet } from 'svelte';
    import ChatSidebar from '$client/features/chat/layout/chat-sidebar.svelte';
    import ChatTitlebar from '$client/features/chat/layout/chat-titlebar.svelte';

    import TooltipPlus from '$comps/ui-pika/tooltip-plus/tooltip-plus.svelte';
    import ChatNav from '$client/features/chat/nav/chat-nav.svelte';

    import Button from '$comps/ui/button/button.svelte';
    import { PanelLeft } from '$icons/lucide';
    import { SquarePen } from '$lib/icons/lucide';
    import { Ellipsis } from '$lib/components/ui/breadcrumb';

    import { useSidebar } from '$lib/components/ui/sidebar';

    import { ChatAppState } from '$client/features/chat/chat-app.state.svelte';

    import { formatDateTime } from '$client/../utils';
    import { MessageRenderer, type ProcessedTagSegment } from '$client/features/chat/message-segments';
    import type { ChatSession } from '../../../../../../packages/shared/src/types/chatbot/chatbot-types';
    import TextRenderer from '../../../lib/client/features/chat/message-segments/default-components/text-renderer.svelte';

    const { data }: { data: PageData } = $props();

    const chatApp = data.chatApp;
    chatApp.chatAppId = 'admin-analyze';
    const appState = getContext<AppState>('appState');
    const chatAppState = appState.addChatApp(
        chatApp,
        ComponentRegistry.create(),
        data.userDataOverrideSettings,
        data.userIsContentAdmin,
        data.features,
        data.customDataUiRepresentation
    );

    setContext('chatAppState', chatAppState);

    const chat = getContext<ChatAppState>('chatAppState');
    //const sidebar = useSidebar();
    const fullScreen = $derived(chat.chatApp.mode === 'fullpage');

    //chat.appSidebarState = sidebar;

    // Load the chat sessions for the chat app
    //chatAppState.refreshChatSessions();
    //let sessions = $state([]);
    chatAppState.getAllChatSessions();

    let hoveredSessionId: string | null = $state(null);

    let sessionData: any = $state(null);
    let report = $derived(sessionData?.reports?.[0]);
    async function getSession(session: ChatSession) {
        let resp = await appState.fetchz(`/api/session/${session.userId}/${session.sessionId}`);
        if (resp.ok) {
            const sessionResponse = await resp.json();
            if (sessionResponse.success) {
                sessionData = sessionResponse.session;
            } else {
                console.error('Error refreshing chat sessions from server', sessionResponse.error);
            }
        }
    }
</script>

<!-- <ChatLayout>
    <ChatHome />
</ChatLayout> -->

<Sidebar.Provider>
    <!-- <ChatSidebar /> -->
    <Sidebar.Root>
        <Sidebar.Header>
            <div class="flex flex-col gap-2 mt-1">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 ml-1">
                        {#if true || (chat.chatApp.mode === 'fullpage' && chat.appSidebarOpen)}
                            <TooltipPlus tooltip={chat.appSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="pl-0 pr-0 w-10"
                                    onclick={() => (chat.appSidebarOpen = !chat.appSidebarOpen)}
                                    ><PanelLeft style="width: 1.3rem; height: 1.7rem;" /></Button
                                >
                            </TooltipPlus>
                        {/if}
                    </div>
                </div>
            </div></Sidebar.Header
        >
        <Sidebar.Content>
            <Sidebar.Group>
                {#if chat.sortedChatSessions.length > 0}
                    <Sidebar.GroupLabel>Recents</Sidebar.GroupLabel>
                    <div class="flex flex-col w-full pl-2">
                        {#each chat.sortedChatSessions as session}
                            {#if session.sessionId === chat.currentSession?.sessionId}
                                <div
                                    class="flex gap-2 items-center w-full justify-between {session.flagged
                                        ? 'flagged'
                                        : ''}"
                                >
                                    <div
                                        class="truncate text-ellipsis overflow-hidden text-primary text-sm font-medium"
                                    >
                                        {session.chatAppId} - {session.title}
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
                                    onclick={() => getSession(session)}
                                    onmouseenter={() => (hoveredSessionId = session.sessionId)}
                                    onmouseleave={() => (hoveredSessionId = null)}
                                >
                                    <div
                                        class="flex items-center w-full justify-between {session.flagged
                                            ? 'flagged'
                                            : ''}  {session.lastAnalyzedMessageId ? 'analyzed' : ''}"
                                    >
                                        <div class="truncate text-ellipsis overflow-hidden flex-1 text-left">
                                            {session.chatAppId} - {session.title}
                                        </div>
                                        {#if hoveredSessionId === session.sessionId}
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onclick={(event) => event.stopPropagation()}><Ellipsis /></Button
                                            >
                                        {/if}
                                    </div>
                                </Button>
                            {/if}
                        {/each}
                    </div>
                {/if}
            </Sidebar.Group>
        </Sidebar.Content>
        <Sidebar.Rail />
    </Sidebar.Root>
    <SlideoutProvider side="right" initialWidth={320}>
        <Slideout>
            <SlideoutContent class="overflow-hidden">
                <ChatTitlebar />
                <div class="overflow-auto w-full h-full">
                    <!-- {@render children?.()} -->
                    <div class="score w-full h-full flex flex-col relative" role="region">
                        <div class="inset-0 pb-[150px] scroll-pb-[150px] overflow-y-auto">
                            <div class="w-full max-w-[768px] mx-auto">
                                <div class="pb-4 px-4 pt-10">
                                    <div class="flex flex-col gap-8 mb-10">
                                        {#each Object.entries(report?.scoring?.scores ?? {}) as [metric, value]}
                                            {@render progressBar(metric, value)}
                                        {/each}
                                        <TextRenderer
                                            segment={{
                                                rawContent:
                                                    sessionData?.reports?.[0]?.content.replace(
                                                        /^(?:.|\n|\r)*?(#?) /,
                                                        '$1'
                                                    ) ?? '',
                                            }}
                                        ></TextRenderer>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="w-full h-full flex flex-col relative" role="region">
                        {#if chat.retrievingMessages || (chat.currentSessionMessages && chat.currentSessionMessages.length > 0)}
                            <!-- Scrollable area that spans full width with right-aligned scrollbar -->
                            <div class="inset-0 pb-[150px] scroll-pb-[150px] overflow-y-auto">
                                <!-- Centered content container -->
                                <div class="w-full max-w-[768px] mx-auto">
                                    <div class="pb-4 px-4 pt-10">
                                        {#each chat.currentSessionMessages as message}
                                            <div class="flex flex-col gap-8 mb-10">
                                                {#if message.source === 'user'}
                                                    <div class="flex flex-col items-end gap-2">
                                                        <div class="p-4 rounded-lg bg-gray-50 max-w-[66%]">
                                                            {message.message}
                                                        </div>
                                                        <div class="user timestamp">
                                                            {formatDateTime(message.timestamp)}
                                                        </div>
                                                    </div>
                                                {:else}
                                                    <div class="flex flex-col gap-2">
                                                        {#if chat.waitingForFirstStreamedResponse && message.message === ''}
                                                            <div class="flex items-center h-6">
                                                                <div
                                                                    class="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-gray-100 w-fit"
                                                                >
                                                                    <div
                                                                        class="h-2 w-2 bg-gray-600 rounded-full dot-1"
                                                                    ></div>
                                                                    <div
                                                                        class="h-2 w-2 bg-gray-600 rounded-full dot-2"
                                                                    ></div>
                                                                    <div
                                                                        class="h-2 w-2 bg-gray-600 rounded-full dot-3"
                                                                    ></div>
                                                                </div>
                                                            </div>
                                                        {:else}
                                                            <MessageRenderer
                                                                {message}
                                                                files={message.files ?? []}
                                                                chatAppState={chat}
                                                                isStreaming={chat.isStreamingResponseNow &&
                                                                    !chat.waitingForFirstStreamedResponse}
                                                            />
                                                        {/if}

                                                        {#if !chat.isStreamingResponseNow}
                                                            <div class="assistant timestamp">
                                                                {formatDateTime(message.timestamp)}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                {/if}
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                                {@render loader(chat.retrievingMessages)}
                            </div>
                        {/if}
                    </div>
                </div>
            </SlideoutContent>
        </Slideout>
    </SlideoutProvider>
</Sidebar.Provider>

{#snippet loader(showing: boolean)}
    {#if showing}
        <div class="flex items-center justify-center">
            <svg class="w-6 h-6 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
            </svg>
        </div>
    {/if}
{/snippet}

{#snippet progressBar(
    metric: string,
    value: { score: number; description: string } | Record<string, { score: number; description: string }>,
    depth = 0
)}
    {#if typeof value.score == 'number'}
        <div class="depth-{depth} pb-value">
            <div>{metric}:</div>
            <div class="progress-bar pbv-{value.score}" style="width: {(value.score ?? 0) * 10}%"></div>
            <div>
                {value.description ?? ''}
            </div>
        </div>
    {:else}
        <div class="depth-{depth} pb-container gap-8 flex flex-col">
            <div>{metric}</div>
            {#each Object.entries(value) as [m, v]}
                {@render progressBar(m, v, depth + 1)}
            {/each}
        </div>
    {/if}
{/snippet}

<style>
    .progress-bar {
        height: 30px;
        background-color: hsl(102, 27%, 60%);
        border: 1px solid #333;
    }

    .progress-bar.pbv-0,
    .progress-bar.pbv-1,
    .progress-bar.pbv-2 {
        background-color: hsl(0, 67%, 49%);
    }
    .progress-bar.pbv-3,
    .progress-bar.pbv-4,
    .progress-bar.pbv-5,
    .progress-bar.pbv-6 {
        background-color: hsl(63, 76%, 52%);
    }
    .progress-bar.pbv-7,
    .progress-bar.pbv-8,
    .progress-bar.pbv-9,
    .progress-bar.pbv-10 {
        background-color: hsl(102, 27%, 60%);
    }

    .flagged {
        background-color: red;
    }
</style>
