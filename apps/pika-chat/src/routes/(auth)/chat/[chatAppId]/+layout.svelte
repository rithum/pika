<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import CanvasWidgetRenderer from '$client/features/chat/canvas/canvas-widget-renderer.svelte';
    import ChatSidebar from '$client/features/chat/layout/chat-sidebar.svelte';
    import ChatTitlebar from '$client/features/chat/layout/chat-titlebar.svelte';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { ComponentRegistry } from '$lib/client/features/chat/message-segments/component-registry';
    import WebComponentRenderer from '$lib/client/features/chat/message-segments/default-components/web-component-renderer.svelte';
    import { Slideout, SlideoutContent, SlideoutProvider } from 'pika-ux/pika/slideout';
    import { Button } from 'pika-ux/shadcn/button';
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import * as Resizable from 'pika-ux/shadcn/resizable';
    import * as Sidebar from 'pika-ux/shadcn/sidebar/index.js';
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
        data.tagDefinitions,
        WebComponentRenderer,
        data.webComponentUrls,
        data.customDataForChatApp
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
        user_needs_to_provide_data_overrides: {
            title: 'User Needs to Provide Data Overrides',
            description:
                'You need to provide data overrides to access this shared session.  Please select an entity to view content for.',
        },
        viewing_content_for_another_user: {
            title: 'Viewing Content for Another User',
            description: 'You may not visit a shard session while viewing content for another user.',
        },
    };

    setContext('chatAppState', chatAppState);

    // Load the chat sessions for the chat app
    chatAppState.initializeData();

    // Handle error query parameter
    let showShareErrorDialog = $state(false);

    $effect(() => {
        // Check if there's an error=share_not_found parameter
        const errorParam = data.error;
        if (errorParam) {
            const errObj: { title: string; description: string } | undefined = errors[errorParam];
            if (errObj) {
                // Remove the error parameter from the URL without causing a server redirect
                const currentUrl = new URL(page.url);
                currentUrl.searchParams.delete('error');

                goto(currentUrl.toString(), {
                    replaceState: true,
                    noScroll: true,
                    keepFocus: true,
                });

                // Show the error dialog
                showShareErrorDialogTitle = errObj.title;
                showShareErrorDialogDescription = errObj.description;
                showShareErrorDialog = true;
            }

            delete data.error;
        }
    });

    $effect(() => {
        const shareId = data.shareId;
        if (shareId) {
            chatAppState.loadSharedSession(shareId, true);
            const currentUrl = new URL(page.url);
            currentUrl.searchParams.delete('share');

            goto(currentUrl.toString(), {
                replaceState: true,
                noScroll: true,
                keepFocus: true,
            });
        }
    });
</script>

<Sidebar.Provider>
    <ChatSidebar />
    <SlideoutProvider side="right" initialWidth={320}>
        <Slideout>
            <SlideoutContent class="overflow-hidden">
                <ChatTitlebar />

                <!-- Always use resizable layout to keep ChatHome in stable DOM location -->
                <Resizable.PaneGroup direction="horizontal" class="w-full h-full">
                    <Resizable.Pane
                        defaultSize={chatAppState.canvasOpen && chatAppState.canvasWidget ? 50 : 100}
                        minSize={chatAppState.canvasOpen && chatAppState.canvasWidget ? 30 : 100}
                        maxSize={chatAppState.canvasOpen && chatAppState.canvasWidget ? 70 : 100}
                    >
                        <div class="overflow-auto w-full h-full">
                            {@render children?.()}
                        </div>
                    </Resizable.Pane>

                    {#if chatAppState.canvasOpen && chatAppState.canvasWidget}
                        <Resizable.Handle withHandle />

                        <Resizable.Pane defaultSize={50} minSize={30} maxSize={70}>
                            <div class="w-full h-full overflow-auto">
                                <CanvasWidgetRenderer />
                            </div>
                        </Resizable.Pane>
                    {/if}
                </Resizable.PaneGroup>
            </SlideoutContent>
        </Slideout>
    </SlideoutProvider>
</Sidebar.Provider>

<Dialog.Root bind:open={showShareErrorDialog}>
    <Dialog.Content class="max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
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
