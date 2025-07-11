<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import TooltipPlus from '$comps/ui-pika/tooltip-plus/tooltip-plus.svelte';
    import { Button } from '$lib/components/ui/button';
    import { PanelLeft } from '$lib/icons/lucide';
    import { getContext } from 'svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    const standalone = $derived(siteAdmin.mode === 'standalone');
    // let panelWidthState: 'normal' | 'fullscreen' = $state('normal');
    // let userNeedsToProvideDataOverrides = $derived.by(() => {
    //     const settings = chat.userDataOverrideSettings;
    //     const enabled = settings.enabled;
    //     const userNeedsToProvideDataOverrides = settings.userNeedsToProvideDataOverrides;
    //     return enabled && userNeedsToProvideDataOverrides;
    // });
    // let showLogoutDialog = $state(false);

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

<div class="flex items-center p-4 border-b border-gray-100 sticky top-0 bg-background pl-3 pb-3 h-[63px]">
    {#if !siteAdmin.appSidebarOpen}
        {#if standalone}
            <TooltipPlus tooltip={siteAdmin.appSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}>
                <Button
                    variant="ghost"
                    size="icon"
                    class="pl-0 pr-0 w-8"
                    onclick={() => (siteAdmin.appSidebarOpen = !siteAdmin.appSidebarOpen)}
                    ><PanelLeft style="width: 1.3rem; height: 1.7rem;" /></Button
                >
            </TooltipPlus>
            <!-- {@render newChatButton()} -->
        {/if}
    {/if}
    <!-- <div class="flex items-center text-lg">
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
    </div> -->
    <!-- <TooltipPlus tooltip={appSideBarHotKey.desc} hotKey={appSideBarHotKey}>
    </TooltipPlus> -->
    <div class="font-semibold">{siteAdmin.nav.currentPage?.title ?? ''}</div>
    <div class="ml-auto">
        {#if siteAdmin.pageHeaderRight}{@render siteAdmin.pageHeaderRight()}{/if}
    </div>
</div>

<!-- {#snippet newChatButton()}
    <TooltipPlus tooltip="New Chat">
        <Button
            variant="ghost"
            disabled={chat.isInterimSession || chat.isStreamingResponseNow || chat.isViewingContentForAnotherUser}
            size="icon"
            class="pl-0 pr-0 w-8"
            onclick={() => {
                chat.startNewChatSession();
            }}><SquarePen style="width: 1.3rem; height: 1.2rem;" /></Button
        >
    </TooltipPlus>
{/snippet}

<Dialog.Root
    bind:open={showLogoutDialog}
    onOpenChange={() => {
        if (!showLogoutDialog) {
            showLogoutDialog = false;
        }
    }}
>
    <Dialog.Content>
        <Dialog.Title>{chat.features.logout.dialogTitle}</Dialog.Title>

        {chat.features.logout.dialogDescription}
        <Dialog.Footer>
            <Button
                variant="default"
                onclick={() => {
                    window.location.href = '/logout-now';
                }}>{chat.features.logout.dialogTitle}</Button
            >
            <Button
                variant="outline"
                onclick={() => {
                    showLogoutDialog = false;
                }}>Cancel</Button
            >
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root> -->
