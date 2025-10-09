<script lang="ts">
    import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';
    import * as Sidebar from 'pika-ux/shadcn/sidebar';
    import ChatNav from '../nav/chat-nav.svelte';

    import { goto } from '$app/navigation';
    import PanelLeft from '$icons/lucide/panel-left';
    import SquarePen from '$icons/lucide/square-pen';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import { useSidebar } from 'pika-ux/shadcn/sidebar';
    import { getContext } from 'svelte';
    import { ChatAppState } from '../chat-app.state.svelte';

    // We have to get the sidebar state from the context because it is not available
    // consistently since the sidebar component is riddled with bugs around the open state
    // depending on whether isMobile is true or false.
    const sidebar = useSidebar();
    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');
    chat.appSidebarState = sidebar;

    // const appConsoleHotKey: HotKey = createHotKey({
    //     key: 'c',
    //     alt: true,
    //     desc: 'Toggle Console',
    //     fn: () => appState.console.toggle(),
    // });

    // const appSearchHotKey: HotKey = createHotKey({
    //     key: 's',
    //     alt: true,
    //     desc: 'Toggle Search',
    //     fn: () => appState.help.toggleSearch(),
    // });

    // const appHelpHotKey: HotKey = createHotKey({
    //     key: 'h',
    //     alt: true,
    //     desc: 'Toggle Help',
    //     fn: () => appState.help.toggleHelp(),
    // });

    // $effect(() => {
    //     appState.addHotKey(appSearchHotKey);
    //     appState.addHotKey(appHelpHotKey);
    //     appState.addHotKey(appConsoleHotKey);
    //     return () => {
    //         appState.removeHotKey(appSearchHotKey);
    //         appState.removeHotKey(appHelpHotKey);
    //         appState.removeHotKey(appConsoleHotKey);
    //     };
    // });
</script>

<Sidebar.Root>
    <Sidebar.Header>
        <div class="flex flex-col gap-2 mt-1">
            <div class="flex items-center justify-between">
                <div class="flex flex-1 items-center ml-1">
                    {#if chat.mode === 'standalone' && chat.appSidebarOpen}
                        <TooltipPlus tooltip={chat.appSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}>
                            <Button
                                variant="ghost"
                                size="icon"
                                class="pl-0 pr-0 w-10"
                                onclick={() => (chat.appSidebarOpen = !chat.appSidebarOpen)}
                                ><PanelLeft style="width: 1.3rem; height: 1.7rem;" /></Button
                            >
                        </TooltipPlus>
                        {#if appState.homePageSiteFeature && appState.homePageSiteFeature.linksToChatApps && appState.allChatApps.length > 0}
                            <Button onclick={() => goto('/')} variant="ghost" size="sm" class="flex-1 text-center"
                                >Home Page</Button
                            >
                        {/if}
                    {/if}
                </div>
                <div class="flex items-center">
                    <div class="flex items-center">
                        <TooltipPlus tooltip="New Chat">
                            <Button
                                variant="ghost"
                                disabled={chat.isInterimSession ||
                                    chat.isStreamingResponseNow ||
                                    chat.isViewingContentForAnotherUser}
                                size="icon"
                                class="pl-0 pr-0 w-8"
                                onclick={() => {
                                    chat.startNewChatSession();
                                }}><SquarePen style="width: 1.3rem; height: 1.5rem;" /></Button
                            >
                        </TooltipPlus>
                    </div>
                </div>
            </div>
        </div></Sidebar.Header
    >
    <Sidebar.Content>
        <ChatNav />
    </Sidebar.Content>
    <!--TODO: make it a feature flag to show this or not -->
    <!-- <Sidebar.Footer>
        <ChatNavUser />
    </Sidebar.Footer> -->
    <Sidebar.Rail />
</Sidebar.Root>
