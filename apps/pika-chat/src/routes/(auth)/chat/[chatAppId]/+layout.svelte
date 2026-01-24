<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import ChevronsRight from '$icons/lucide/chevrons-right';
    import Sparkles from '$icons/lucide/sparkles';
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

    // Sidebar state - tracks whether sidebar is open
    let sidebarOpen = $state(true);
    let sidebarOpenBeforeCompanion = $state(true);

    // Auto-close sidebar when entering companion mode, restore when exiting
    $effect(() => {
        const unsubEnter = chatAppState.addEventListener('companionModeEnter', () => {
            sidebarOpenBeforeCompanion = sidebarOpen;
            sidebarOpen = false;
        });
        const unsubExit = chatAppState.addEventListener('companionModeExit', () => {
            sidebarOpen = sidebarOpenBeforeCompanion;
        });
        return () => {
            unsubEnter();
            unsubExit();
        };
    });

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

<Sidebar.Provider bind:open={sidebarOpen}>
    <ChatSidebar />
    <SlideoutProvider side="right" initialWidth={320}>
        <Slideout>
            <SlideoutContent class="overflow-hidden">
                <ChatTitlebar />

                <!-- Always use resizable layout to keep ChatHome in stable DOM location -->
                <!-- In companion mode: canvas on left, chat on right (feels like a true companion) -->
                <!-- In normal mode: chat on left, canvas on right -->
                <Resizable.PaneGroup direction="horizontal" class="w-full h-full">
                    {#if chatAppState.isCompanionMode && chatAppState.canvasOpen && chatAppState.canvasWidget}
                        <!-- COMPANION MODE: Canvas first (left), then chat (right) -->
                        <Resizable.Pane
                            defaultSize={chatAppState.isChatPaneMinimized ? 97 : 79}
                            minSize={50}
                            maxSize={chatAppState.isChatPaneMinimized ? 98 : 89}
                        >
                            <div class="w-full h-full overflow-auto">
                                <CanvasWidgetRenderer />
                            </div>
                        </Resizable.Pane>

                        <Resizable.Handle withHandle={!chatAppState.isChatPaneMinimized} />

                        <Resizable.Pane
                            defaultSize={chatAppState.isChatPaneMinimized ? 3 : 21}
                            minSize={chatAppState.isChatPaneMinimized ? 2 : 11}
                            maxSize={chatAppState.isChatPaneMinimized ? 4 : 50}
                        >
                            {#if chatAppState.isChatPaneMinimized}
                                <!-- Minimized chat pane strip - narrow with just icon -->
                                <button
                                    class="w-full h-full flex items-center justify-center bg-gray-25 hover:bg-gray-50 cursor-pointer transition-colors border-l border-gray-100"
                                    onclick={() => chatAppState.setChatPaneMinimized(false)}
                                    aria-label="Expand chat pane"
                                >
                                    <Sparkles class="h-5 w-5 text-primary" />
                                </button>
                            {:else}
                                <!-- Companion chat pane with subtle background and left border -->
                                <div class="relative w-full h-full bg-gray-25 border-l border-gray-100">
                                    <!-- Minimize button - floating at top-left -->
                                    <button
                                        class="absolute top-2 left-2 z-10 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                        onclick={() => chatAppState.setChatPaneMinimized(true)}
                                        aria-label="Minimize chat pane"
                                        title="Minimize"
                                    >
                                        <ChevronsRight class="h-4 w-4" />
                                    </button>
                                    <div class="overflow-auto w-full h-full">
                                        {@render children?.()}
                                    </div>
                                </div>
                            {/if}
                        </Resizable.Pane>
                    {:else}
                        <!-- NORMAL MODE: Chat first (left), then canvas (right) -->
                        <Resizable.Pane
                            defaultSize={chatAppState.isChatPaneMinimized
                                ? 5
                                : chatAppState.canvasOpen && chatAppState.canvasWidget
                                  ? 50
                                  : 100}
                            minSize={chatAppState.isChatPaneMinimized
                                ? 3
                                : chatAppState.canvasOpen && chatAppState.canvasWidget
                                  ? 20
                                  : 100}
                            maxSize={chatAppState.isChatPaneMinimized
                                ? 8
                                : chatAppState.canvasOpen && chatAppState.canvasWidget
                                  ? 70
                                  : 100}
                        >
                            {#if chatAppState.isChatPaneMinimized}
                                <!-- Minimized chat pane strip -->
                                <button
                                    class="w-full h-full flex flex-col items-center justify-center gap-2 bg-muted/50 hover:bg-muted cursor-pointer transition-colors border-r"
                                    onclick={() => chatAppState.setChatPaneMinimized(false)}
                                    aria-label="Expand chat pane"
                                >
                                    <Sparkles class="h-5 w-5 text-primary" />
                                    <div
                                        class="writing-mode-vertical text-xs text-muted-foreground font-medium tracking-wider rotate-180"
                                    >
                                        AI
                                    </div>
                                </button>
                            {:else}
                                <div class="overflow-auto w-full h-full">
                                    {@render children?.()}
                                </div>
                            {/if}
                        </Resizable.Pane>

                        {#if chatAppState.canvasOpen && chatAppState.canvasWidget}
                            <Resizable.Handle withHandle={!chatAppState.isChatPaneMinimized} />

                            <Resizable.Pane
                                defaultSize={chatAppState.isChatPaneMinimized ? 95 : 50}
                                minSize={30}
                                maxSize={chatAppState.isChatPaneMinimized ? 97 : 70}
                            >
                                <div class="w-full h-full overflow-auto">
                                    <CanvasWidgetRenderer />
                                </div>
                            </Resizable.Pane>
                        {/if}
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

<style>
    .writing-mode-vertical {
        writing-mode: vertical-rl;
    }
</style>
