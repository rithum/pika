<script lang="ts">
    import * as Sidebar from '$comps/ui/sidebar/index.js';
    import { Slideout, SlideoutContent, SlideoutProvider } from '$comps/ui-pika/slideout';
    import { getContext, setContext, type Snippet } from 'svelte';
    import ChatSidebar from '$client/features/chat/layout/chat-sidebar.svelte';
    import ChatTitlebar from '$client/features/chat/layout/chat-titlebar.svelte';
    import type { PageData } from './$types';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { ComponentRegistry } from '$lib/client/features/chat/message-segments/component-registry';

    interface Props {
        children?: Snippet<[]>;
        data: PageData;
    }

    const { children, data }: Props = $props();

    const chatApp = data.chatApp;
    const appState = getContext<AppState>('appState');
    const chatAppState = appState.addChatApp(
        chatApp,
        ComponentRegistry.create(),
        data.userDataOverrideSettings,
        data.userIsContentAdmin,
        data.features,
        data.customDataUiRepresentation,
        data.mode
    );

    setContext('chatAppState', chatAppState);

    // Load the chat sessions for the chat app
    chatAppState.refreshChatSessions();
</script>

<Sidebar.Provider>
    <ChatSidebar />
    <SlideoutProvider side="right" initialWidth={320}>
        <Slideout>
            <SlideoutContent class="overflow-hidden">
                <ChatTitlebar />
                <div class="overflow-auto w-full h-full">
                    {@render children?.()}
                </div>
            </SlideoutContent>
        </Slideout>
    </SlideoutProvider>
</Sidebar.Provider>
