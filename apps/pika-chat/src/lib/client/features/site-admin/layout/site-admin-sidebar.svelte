<script lang="ts">
    import * as Sidebar from '$comps/ui/sidebar';

    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { useSidebar } from '$lib/components/ui/sidebar';
    import { getContext } from 'svelte';
    import SiteAdminNav from '../nav/site-admin-nav.svelte';
    // import ChatNavUser from '../nav/chat-nav-user.svelte';

    // We have to get the sidebar state from the context because it is not available
    // consistently since the sidebar component is riddled with bugs around the open state
    // depending on whether isMobile is true or false.
    const sidebar = useSidebar();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    siteAdmin.appSidebarState = sidebar;

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
    <Sidebar.Header class="border-b border-gray-200">
        <div class="flex items-center text-lg">
            <svg class="w-11 h-11 text-gray-500" version="1.1" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path
                    stroke="currentColor"
                    fill="currentColor"
                    d="m32.7072 19.0664 0.89264-1.63188c0.0142188-0.0235938 0.0331248-0.0425 0.05672-0.05672l1.63188-0.89264c0.229064-0.125152 0.229064-0.45248 0-0.577632l-1.63188-0.89264c-0.0235938-0.0142188-0.0425-0.0331248-0.05672-0.05672l-0.89264-1.63188c-0.125152-0.229064-0.45248-0.229064-0.577632 0l-0.89264 1.63188c-0.0142188 0.0235938-0.0331248 0.0425-0.05672 0.05672l-1.63188 0.89264c-0.229064 0.125152-0.229064 0.45248 0 0.577632l1.63188 0.89264c0.0235938 0.0142188 0.0425 0.0331248 0.05672 0.05672l0.89264 1.63188c0.125152 0.229064 0.45248 0.229064 0.577632 0z"
                />
                <path
                    stroke="currentColor"
                    fill="currentColor"
                    d="m32.7072 34.7336 0.89264-1.63188c0.0142188-0.0235938 0.0331248-0.0425 0.05672-0.05672l1.63188-0.89264c0.229064-0.125152 0.229064-0.45248 0-0.577632l-1.63188-0.89264c-0.0235938-0.0142188-0.0425-0.0331248-0.05672-0.05672l-0.89264-1.63188c-0.125152-0.229064-0.45248-0.229064-0.577632 0l-0.89264 1.63188c-0.0142188 0.0235938-0.0331248 0.0425-0.05672 0.05672l-1.63188 0.89264c-0.229064 0.125152-0.229064 0.45248 0 0.577632l1.63188 0.89264c0.0235938 0.0078752 0.0425 0.0331248 0.05672 0.05672l0.89264 1.63188c0.125152 0.229064 0.45248 0.229064 0.577632 0z"
                />
                <path
                    stroke="currentColor"
                    fill="currentColor"
                    d="m20.944 19.0808-0.0259376 0.063752c-0.86908 2.20092-2.62844 3.96264-4.82936 4.83172l-0.063752 0.0259376 0.063752 0.0259376c2.20092 0.86908 3.96264 2.62844 4.83172 4.82936l0.0259376 0.063752 0.0259376-0.063752c0.86908-2.20092 2.62844-3.96264 4.82936-4.83172l0.063752-0.0259376-0.063752-0.0259376c-2.20092-0.86908-3.96264-2.62844-4.83172-4.82936l-0.0259376-0.063752m0-5.5852c0.188908 0 0.377816 0.103908 0.45812 0.31172l1.76172 4.468c0.63048 1.60124 1.89876 2.86952 3.5 3.5l4.468 1.76172c0.41564 0.165312 0.41564 0.75328 0 0.918592l-4.468 1.76172c-1.60124 0.63048-2.86952 1.89876-3.5 3.5l-1.76172 4.468c-0.082656 0.207812-0.269212 0.31172-0.45812 0.31172-0.188908 0-0.377816-0.103908-0.45812-0.31172l-1.76172-4.468c-0.63048-1.60124-1.89876-2.86952-3.5-3.5l-4.468-1.76172c-0.41564-0.165312-0.41564-0.75328 0-0.918592l4.468-1.76172c1.60124-0.63048 2.86952-1.89876 3.5-3.5l1.76172-4.468c0.082656-0.207812 0.269212-0.31172 0.45812-0.31172z"
                />
            </svg>

            <span class="font-semibold relative left-[-4px]">Site Admin</span>
        </div>
        <!-- <div class="flex flex-col gap-2 mt-1">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 ml-1">
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
        </div> -->
    </Sidebar.Header>
    <Sidebar.Content>
        <SiteAdminNav />
    </Sidebar.Content>
    <!--TODO: make it a feature flag to show this or not -->
    <!-- <Sidebar.Footer>
        <ChatNavUser />
    </Sidebar.Footer> -->
    <Sidebar.Rail />
</Sidebar.Root>
