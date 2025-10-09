<script lang="ts">
    import { Slideout, SlideoutContent, SlideoutProvider } from 'pika-ux/pika/slideout';
    import * as Sidebar from 'pika-ux/shadcn/sidebar/index.js';
    import { type Snippet } from 'svelte';
    import SiteAdminSidebar from './site-admin-sidebar.svelte';
    import SiteAdminTitlebar from './site-admin-titlebar.svelte';

    interface Props {
        children?: Snippet<[]>;
    }

    const { children }: Props = $props();
</script>

<Sidebar.Provider>
    <SiteAdminSidebar />
    <SlideoutProvider side="right" initialWidth={320}>
        <Slideout>
            <SlideoutContent class="overflow-hidden">
                <SiteAdminTitlebar />
                <div class="overflow-auto w-full h-full">
                    {@render children?.()}
                </div>
            </SlideoutContent>
        </Slideout>
    </SlideoutProvider>
</Sidebar.Provider>
