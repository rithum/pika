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

                <!-- 
                    CRITICAL: Children (chat-app-main) must be in ONE stable DOM location.
                    Previously, children were in different {#if} branches which caused remounting
                    when switching between companion mode and normal mode, destroying all widget state.
                    
                    Now we use CSS flex-direction to control layout order without remounting.
                    - Companion mode: flex-row-reverse (canvas left, chat right)
                    - Normal mode: flex-row (chat left, canvas right)
                -->
                <div
                    class="w-full flex-1 min-h-0 flex"
                    class:flex-row={!chatAppState.isCompanionMode || !chatAppState.canvasOpen}
                    class:flex-row-reverse={chatAppState.isCompanionMode && chatAppState.canvasOpen}
                >
                    <!-- Chat Pane - ALWAYS rendered in same DOM location -->
                    <!-- 
                        CRITICAL: Children must ALWAYS be rendered to preserve widget state.
                        We use CSS to hide/show the minimized strip overlay, NOT {#if} branches.
                        Previously, children were only in the :else branch which caused them
                        to be destroyed when chat pane was minimized.
                    -->
                    <div
                        class="h-full overflow-hidden flex-shrink-0 transition-all duration-200 relative"
                        class:flex-1={!chatAppState.canvasOpen || !chatAppState.canvasWidget}
                        style={chatAppState.canvasOpen && chatAppState.canvasWidget
                            ? chatAppState.isChatPaneMinimized
                                ? 'width: 48px;'
                                : chatAppState.isCompanionMode
                                  ? 'width: 25%;'
                                  : 'width: 50%;'
                            : ''}
                    >
                        <!-- Minimized chat pane strip - overlays children when minimized -->
                        {#if chatAppState.isChatPaneMinimized && chatAppState.canvasOpen}
                            <button
                                class="absolute inset-0 z-20 w-full h-full flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors {chatAppState.isCompanionMode
                                    ? 'bg-gray-25 hover:bg-gray-50 border-l border-gray-100'
                                    : 'bg-muted/50 hover:bg-muted border-r'}"
                                onclick={() => chatAppState.setChatPaneMinimized(false)}
                                aria-label="Expand chat pane"
                            >
                                <Sparkles class="h-5 w-5 text-primary" />
                                {#if !chatAppState.isCompanionMode}
                                    <div
                                        class="writing-mode-vertical text-xs text-muted-foreground font-medium tracking-wider rotate-180"
                                    >
                                        AI
                                    </div>
                                {/if}
                            </button>
                        {/if}

                        <!-- Chat pane content - ALWAYS rendered, hidden when minimized -->
                        <div
                            class="relative w-full h-full overflow-auto"
                            class:invisible={chatAppState.isChatPaneMinimized && chatAppState.canvasOpen}
                            class:bg-gray-25={chatAppState.isCompanionMode && chatAppState.canvasOpen}
                            class:border-l={chatAppState.isCompanionMode && chatAppState.canvasOpen}
                            class:border-gray-100={chatAppState.isCompanionMode && chatAppState.canvasOpen}
                        >
                            {#if chatAppState.isCompanionMode && chatAppState.canvasOpen && !chatAppState.isChatPaneMinimized}
                                <!-- Minimize button for companion mode -->
                                <button
                                    class="absolute top-0.5 left-0.5 z-10 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                    onclick={() => chatAppState.setChatPaneMinimized(true)}
                                    aria-label="Minimize chat pane"
                                    title="Minimize"
                                >
                                    <ChevronsRight class="h-4 w-4" />
                                </button>
                            {/if}
                            {@render children?.()}
                        </div>
                    </div>

                    <!-- Canvas Pane - only shown when canvas is open -->
                    {#if chatAppState.canvasOpen && chatAppState.canvasWidget}
                        <div
                            class="h-full overflow-auto flex-1"
                            class:border-l={!chatAppState.isCompanionMode}
                            class:border-r={chatAppState.isCompanionMode}
                            class:border-gray-200={true}
                        >
                            <CanvasWidgetRenderer />
                        </div>
                    {/if}
                </div>
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
