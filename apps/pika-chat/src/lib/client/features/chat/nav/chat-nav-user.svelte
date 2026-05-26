<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import { getDemoModeMenuItem } from '$lib/custom/demo-mode-menu-item';
    import { shouldShowLogout } from '$lib/custom/show-logout';
    import ChevronsUpDown from '$icons/lucide/chevrons-up-down';
    import * as Avatar from 'pika-ux/shadcn/avatar';
    import * as DropdownMenu from 'pika-ux/shadcn/dropdown-menu';
    import * as Sidebar from 'pika-ux/shadcn/sidebar';
    import { useSidebar } from 'pika-ux/shadcn/sidebar';
    import { getContext } from 'svelte';

    const sidebar = useSidebar();

    const appState = getContext<AppState>('appState');
    const DemoModeMenuComponent = getDemoModeMenuItem();
</script>

<Sidebar.Menu>
    <Sidebar.MenuItem>
        <DropdownMenu.Root>
            <DropdownMenu.Trigger>
                {#snippet child({ props })}
                    <Sidebar.MenuButton
                        size="lg"
                        class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        {...props}
                    >
                        <Avatar.Root class="h-8 w-8 rounded-lg">
                            <Avatar.Fallback class="rounded-lg">{appState.identity.initials}</Avatar.Fallback>
                        </Avatar.Root>
                        <div class="grid flex-1 text-left text-sm leading-tight">
                            <span class="truncate font-semibold">{appState.identity.fullName}</span>
                            <!-- <span class="truncate text-xs">{appState.identity.user.email}</span> -->
                        </div>
                        <ChevronsUpDown class="ml-auto size-4" />
                    </Sidebar.MenuButton>
                {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
                class="w-[var(--bits-dropdown-menu-anchor-width)] min-w-56 rounded-lg"
                side={sidebar.isMobile ? 'bottom' : 'right'}
                align="end"
                sideOffset={4}
            >
                <DropdownMenu.Label class="p-0 font-normal">
                    <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                        <Avatar.Root class="h-8 w-8 rounded-lg">
                            <Avatar.Fallback class="rounded-lg">{appState.identity.initials}</Avatar.Fallback>
                        </Avatar.Root>
                        <div class="grid flex-1 text-left text-sm leading-tight">
                            <span class="truncate font-semibold">{appState.identity.fullName}</span>
                            <!-- <span class="truncate text-xs">{appState.identity.user.email}</span> -->
                        </div>
                    </div>
                </DropdownMenu.Label>
                <DropdownMenu.Separator />
                <DropdownMenu.Group>
                    <DropdownMenu.Item onclick={() => appState.settings.showDialog()}>Settings</DropdownMenu.Item>
                    {#if DemoModeMenuComponent}
                        <svelte:component this={DemoModeMenuComponent} {appState} />
                    {/if}
                    {#if shouldShowLogout(appState.identity.user)}
                        <DropdownMenu.Item onclick={() => appState.identity.logout()}>Logout</DropdownMenu.Item>
                    {/if}
                </DropdownMenu.Group>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    </Sidebar.MenuItem>
</Sidebar.Menu>
