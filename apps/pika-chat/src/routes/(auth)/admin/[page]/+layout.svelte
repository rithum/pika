<script lang="ts">
    import { page } from '$app/state';
    import type { AppState } from '$client/app/app.state.svelte';
    import SiteAdminSidebar from '$client/features/site-admin/layout/site-admin-sidebar.svelte';
    import SiteAdminTitlebar from '$client/features/site-admin/layout/site-admin-titlebar.svelte';
    import { Slideout, SlideoutContent, SlideoutProvider } from '$ui/pika/slideout';
    import * as Sidebar from '$ui/shadcn/sidebar/index.js';
    import type { ChatApp, SiteFeatures } from '@pika/shared/types/chatbot/chatbot-types';
    import { getContext, type Snippet } from 'svelte';
    import { ComponentRegistry } from '$lib/client/features/chat/message-segments/component-registry';

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
    const componentRegistry = ComponentRegistry.create();

    appState.addSiteAdminState(chatApps, siteFeatures, page, componentRegistry);
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
