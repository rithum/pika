<script lang="ts">
    import { page } from '$app/state';
    import type { AppState } from '$client/app/app.state.svelte';
    import SiteAdminSidebar from '$client/features/site-admin/layout/site-admin-sidebar.svelte';
    import SiteAdminTitlebar from '$client/features/site-admin/layout/site-admin-titlebar.svelte';
    import { Slideout, SlideoutContent, SlideoutProvider } from '$comps/ui-pika/slideout';
    import * as Sidebar from '$comps/ui/sidebar/index.js';
    import { Toaster } from '$lib/components/ui/sonner';
    import type { ChatApp, SiteFeatures } from '@pika/shared/types/chatbot/chatbot-types';
    import { getContext, type Snippet } from 'svelte';

    interface Props {
        data: {
            chatApps: ChatApp[];
            siteFeatures: SiteFeatures;
        };
        children?: Snippet<[]>;
    }

    const { data, children }: Props = $props();

    const appState = getContext<AppState>('appState');
    const chatApps = data.chatApps;
    const siteFeatures = data.siteFeatures;

    appState.addSiteAdminState(chatApps, siteFeatures, page);
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

<!-- <Toaster position="top-center" richColors closeButton /> -->
