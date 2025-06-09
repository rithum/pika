<script lang="ts">
    import TooltipPlus from '$comps/ui-pika/tooltip-plus/tooltip-plus.svelte';
    import { Button } from '$lib/components/ui/button';
    import { PanelLeft, SquarePen } from '$lib/icons/lucide';
    import { getContext } from 'svelte';
    import { ChatAppState } from '../chat-app.state.svelte';

    const chat = getContext<ChatAppState>('chatAppState');

    // const appSideBarHotKey: HotKey = createHotKey({
    //     key: 'b',
    //     meta: true,
    //     useCtrlForMetaOnWindows: true,
    //     desc: 'Toggle Sidebar',
    //     fn: () => (appState.appSidebarOpen = !appState.appSidebarOpen),
    // });

    // $effect(() => {
    //     appState.addHotKey(appSideBarHotKey);

    //     return () => {
    //         appState.removeHotKey(appSideBarHotKey);
    //     };
    // });
</script>

<div class="flex items-center p-4 border-b border-gray-100 sticky top-0 bg-background pl-3 pb-3">
    {#if !chat.appSidebarOpen}
        <TooltipPlus tooltip={chat.appSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}>
            <Button
                variant="ghost"
                size="icon"
                class="pl-0 pr-0 w-8"
                onclick={() => (chat.appSidebarOpen = !chat.appSidebarOpen)}
                ><PanelLeft style="width: 1.3rem; height: 1.7rem;" /></Button
            >
        </TooltipPlus>
        <TooltipPlus tooltip="New Chat">
            <Button
                variant="ghost"
                disabled={chat.isInterimSession || chat.isStreamingResponseNow}
                size="icon"
                class="pl-0 pr-0 w-8"
                onclick={() => {
                    chat.startNewChatSession();
                }}><SquarePen style="width: 1.3rem; height: 1.2rem;" /></Button
            >
        </TooltipPlus>
    {/if}
    <div class="flex flex-col text-lg ml-2">
        <span class="font-semibold">Chat Bot</span>
    </div>
    <!-- <TooltipPlus tooltip={appSideBarHotKey.desc} hotKey={appSideBarHotKey}>
    </TooltipPlus> -->
    <div class="font-semibold">{chat.pageTitle ?? ''}</div>
    {#if chat.pageHeaderRight}
        <div class="ml-auto">{@render chat.pageHeaderRight()}</div>
    {/if}
</div>
