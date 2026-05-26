<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import { getDemoModeMenuItem } from '$lib/custom/demo-mode-menu-item';
    import PanelLeft from '$icons/lucide/panel-left';
    import Settings2 from '$icons/lucide/settings-2';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';
    import CopyButton from 'pika-ux/pika/copy-button/copy-button.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import * as DropdownMenu from 'pika-ux/shadcn/dropdown-menu';
    import { getContext } from 'svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const DemoModeMenuComponent = getDemoModeMenuItem();

    const standalone = $derived(siteAdmin.mode === 'standalone');

    const userInfo = $derived.by(() => {
        const internalUser = appState.identity.user.userType === 'internal-user';
        const customDataUiRepresentation = appState.customDataUiRepresentation;
        const userId = appState.identity.user.userId;
        const firstName = appState.identity.user.firstName;
        const lastName = appState.identity.user.lastName;
        const result: { title: string; value: string }[] = [];

        if (internalUser && customDataUiRepresentation) {
            result.push({ title: customDataUiRepresentation.title, value: customDataUiRepresentation.value });
        }
        if (internalUser) {
            result.push({ title: 'User ID', value: userId });
        }
        if (firstName || lastName) {
            result.push({ title: 'User', value: `${firstName} ${lastName}`.trim() });
        }

        return result.length > 0 ? result : undefined;
    });
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
    <div class="flex items-center gap-2">
        <div class="font-semibold">{siteAdmin.nav.currentPage?.title ?? ''}</div>
        {#if siteAdmin.pageTitlePopupHelp}
            <PopupHelp useInfoIcon>{siteAdmin.pageTitlePopupHelp}</PopupHelp>
        {/if}
    </div>
    <div class="ml-auto flex items-center gap-2">
        {#if siteAdmin.pageHeaderRight}{@render siteAdmin.pageHeaderRight()}{/if}
        <DropdownMenu.Root>
            <DropdownMenu.Trigger>
                <Button variant="ghost" size="icon" class="pl-0 pr-0 w-8"
                    ><Settings2 style="width: 1.3rem; height: 1.2rem;" /></Button
                >
            </DropdownMenu.Trigger>
            <DropdownMenu.Content class="min-w-48">
                {#if userInfo}
                    {#each userInfo as info}
                        <DropdownMenu.Label class="font-normal py-1">
                            <div class="text-xs text-muted-foreground">{info.title}</div>
                            <div class="font-medium">
                                <CopyButton embedded={true}>{info.value}</CopyButton>
                            </div>
                        </DropdownMenu.Label>
                    {/each}
                    <DropdownMenu.Separator />
                {/if}
                <DropdownMenu.Item
                    onclick={() => {
                        appState.settings.dialogOpen = true;
                    }}>Chatbot Settings</DropdownMenu.Item
                >
                {#if DemoModeMenuComponent}
                    <DropdownMenu.Separator />
                    <svelte:component this={DemoModeMenuComponent} {appState} />
                {/if}
                {#if appState.logoutSiteFeature?.enabled}
                    <DropdownMenu.Item
                        onclick={() => {
                            appState.showLogoutDialog = true;
                        }}>{appState.logoutSiteFeature?.menuItemTitle ?? 'Logout'}</DropdownMenu.Item
                    >
                {/if}
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    </div>
</div>
