<script lang="ts">
    import * as Sidebar from '$comps/ui/sidebar';
    import TooltipPlus from '$comps/ui-pika/tooltip-plus/tooltip-plus.svelte';
    import ChatNav from '../nav/chat-nav.svelte';

    import Button from '$comps/ui/button/button.svelte';
    import { PanelLeft } from '$icons/lucide';
    import { useSidebar } from '$lib/components/ui/sidebar';
    import { SquarePen } from '$lib/icons/lucide';
    import { getContext } from 'svelte';
    import { ChatAppState } from '../chat-app.state.svelte';
    import ChatNavUser from '../nav/chat-nav-user.svelte';

    // We have to get the sidebar state from the context because it is not available
    // consistently since the sidebar component is riddled with bugs around the open state
    // depending on whether isMobile is true or false.
    const sidebar = useSidebar();

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
                <div class="flex items-center gap-2 ml-1">
                    {#if chat.appSidebarOpen}
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
                <div class="flex items-center">
                    <div class="flex items-center">
                        <TooltipPlus tooltip="New Chat">
                            <Button
                                variant="ghost"
                                disabled={chat.isInterimSession || chat.isStreamingResponseNow}
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
    <Sidebar.Footer>
        <ChatNavUser />
    </Sidebar.Footer>
    <Sidebar.Rail />
</Sidebar.Root>
