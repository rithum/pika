<script lang="ts">
    import * as Avatar from '$comps/ui/avatar';
    import * as DropdownMenu from '$comps/ui/dropdown-menu';
    import * as Sidebar from '$comps/ui/sidebar';
    import { useSidebar } from '$comps/ui/sidebar';
    import { ChevronsUpDown } from '$icons/lucide';
    import { getContext } from 'svelte';
    import type { AppState } from '$client/app/app.state.svelte';

    const sidebar = useSidebar();

    const appState = getContext<AppState>('appState');
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
                            <span class="truncate text-xs">{appState.identity.user.email}</span>
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
                            <span class="truncate text-xs">{appState.identity.user.email}</span>
                        </div>
                    </div>
                </DropdownMenu.Label>
                <DropdownMenu.Separator />
                <DropdownMenu.Group>
                    <DropdownMenu.Item onclick={() => appState.settings.showDialog()}>Settings</DropdownMenu.Item>
                    <DropdownMenu.Item onclick={() => appState.identity.logout()}>Logout</DropdownMenu.Item>
                </DropdownMenu.Group>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    </Sidebar.MenuItem>
</Sidebar.Menu>
