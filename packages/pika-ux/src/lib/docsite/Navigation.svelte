<script lang="ts">
    import * as Sidebar from '../../shadcn/sidebar/index.js';

    // Props interface
    interface NavigationProps {
        currentPage: string;
        onNavigate: (page: string) => void;
    }

    // Props
    let { currentPage, onNavigate }: NavigationProps = $props();

    const navigationItems = [
        { id: 'getting-started', label: 'Getting Started', icon: '📚' },
        { id: 'icons', label: 'Icons', icon: '✨' },
        { id: 'colors', label: 'Colors', icon: '🎨' },
        {
            id: 'components',
            label: 'Components',
            icon: '🧩',
            children: [{ id: 'components/button', label: 'Button', icon: '🔘' }]
        }
    ];

    function handleNavigate(pageId: string) {
        onNavigate(pageId);
    }
</script>

<Sidebar.Provider>
    <Sidebar.Sidebar variant="inset" class="border-r">
        <Sidebar.SidebarHeader class="border-b px-6 py-4">
            <h2 class="text-lg font-semibold text-foreground">pika-ux</h2>
            <p class="text-sm text-muted-foreground">Component Documentation</p>
        </Sidebar.SidebarHeader>

        <Sidebar.SidebarContent class="px-3 py-4">
            <Sidebar.SidebarGroup>
                <Sidebar.SidebarMenu>
                    {#each navigationItems as item}
                        <Sidebar.SidebarMenuItem>
                            <Sidebar.SidebarMenuButton
                                onclick={() => handleNavigate(item.id)}
                                class="w-full justify-start {currentPage === item.id || (item.children && item.children.some((child) => currentPage === child.id))
                                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                    : ''}"
                            >
                                <span class="mr-2">{item.icon}</span>
                                {item.label}
                            </Sidebar.SidebarMenuButton>

                            {#if item.children}
                                <Sidebar.SidebarMenuSub class="ml-4 mt-1">
                                    {#each item.children as child}
                                        <Sidebar.SidebarMenuSubItem>
                                            <Sidebar.SidebarMenuSubButton
                                                onclick={() => handleNavigate(child.id)}
                                                class="w-full justify-start {currentPage === child.id ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}"
                                            >
                                                <span class="mr-2">{child.icon}</span>
                                                {child.label}
                                            </Sidebar.SidebarMenuSubButton>
                                        </Sidebar.SidebarMenuSubItem>
                                    {/each}
                                </Sidebar.SidebarMenuSub>
                            {/if}
                        </Sidebar.SidebarMenuItem>
                    {/each}
                </Sidebar.SidebarMenu>
            </Sidebar.SidebarGroup>
        </Sidebar.SidebarContent>

        <!-- <Sidebar.SidebarFooter class="border-t px-6 py-4">
            <p class="text-xs text-muted-foreground">Built with Svelte 5</p>
        </Sidebar.SidebarFooter> -->
    </Sidebar.Sidebar>
</Sidebar.Provider>
