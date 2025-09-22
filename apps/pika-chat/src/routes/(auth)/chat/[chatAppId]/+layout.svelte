<script lang="ts">
    import { page } from '$app/state';
    import ChatSidebar from '$client/features/chat/layout/chat-sidebar.svelte';
    import ChatTitlebar from '$client/features/chat/layout/chat-titlebar.svelte';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { ComponentRegistry } from '$lib/client/features/chat/message-segments/component-registry';
    import { Slideout, SlideoutContent, SlideoutProvider } from '$ui/pika/slideout';
    import { Button } from '$ui/shadcn/button';
    import * as Dialog from '$ui/shadcn/dialog';
    import * as Sidebar from '$ui/shadcn/sidebar/index.js';
    import { getContext, setContext, type Snippet } from 'svelte';
    import type { LayoutData } from './$types';

    interface Props {
        children?: Snippet<[]>;
        data: LayoutData;
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
        data.mode,
        data.tagDefinitions
    );

    let showShareErrorDialogTitle = $state('');
    let showShareErrorDialogDescription = $state('');

    const errors: Record<string, { title: string; description: string }> = {
        share_not_found: {
            title: 'Shared Session Not Found',
            description:
                'The shared session link you tried to access is no longer valid or has been removed. This could happen if the shared session was deleted or if the sharing permissions have changed.',
        },
        share_access_denied: {
            title: 'Share Access Denied',
            description:
                'You do not have permission to access this shared session.  If you feel this is an error, please contact support.',
        },
    };

    setContext('chatAppState', chatAppState);

    // Load the chat sessions for the chat app
    chatAppState.initializeData();

    // Handle error query parameter
    let showShareErrorDialog = $state(false);

    $effect(() => {
        // Check if there's an error=share_not_found parameter
        const errorParam = (data as any).error;
        if (errorParam) {
            const errObj: { title: string; description: string } | undefined = errors[errorParam];
            if (errObj) {
                // Remove the error parameter from the URL without causing a server redirect
                const currentUrl = new URL(page.url);
                currentUrl.searchParams.delete('error');

                // Update the URL without navigation
                window.history.replaceState({}, '', currentUrl.toString());

                // Show the error dialog
                showShareErrorDialogTitle = errObj.title;
                showShareErrorDialogDescription = errObj.description;
                showShareErrorDialog = true;
            }

            delete (data as any).error;
        }
    });
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

<Dialog.Root bind:open={showShareErrorDialog}>
    <Dialog.Content>
        <Dialog.Header>
            <Dialog.Title>{showShareErrorDialogTitle}</Dialog.Title>
        </Dialog.Header>
        <Dialog.Description>
            {showShareErrorDialogDescription}
        </Dialog.Description>
        <Dialog.Footer>
            <Button onclick={() => (showShareErrorDialog = false)}>OK</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
