<script lang="ts">
    import { Slideout, SlideoutContent, SlideoutProvider } from 'pika-ux/pika/slideout';
    import * as Sidebar from 'pika-ux/shadcn/sidebar/index.js';
    import { type Snippet, getContext } from 'svelte';
    import CanvasWidgetRenderer from '../canvas/canvas-widget-renderer.svelte';
    import type { ChatAppState } from '../chat-app.state.svelte';
    import ChatSidebar from './chat-sidebar.svelte';
    import ChatTitlebar from './chat-titlebar.svelte';

    interface Props {
        children?: Snippet<[]>;
    }

    const { children }: Props = $props();
    const chat = getContext<ChatAppState>('chatAppState');
</script>

<Sidebar.Provider>
    <ChatSidebar />
    <SlideoutProvider side="right" initialWidth={320}>
        <Slideout>
            <SlideoutContent class="overflow-hidden">
                <ChatTitlebar />

                <!-- Nested Sidebar.Provider for Canvas mode -->
                <Sidebar.Provider>
                    <div class="overflow-auto w-full h-full">
                        {@render children?.()}
                    </div>

                    <!-- Canvas sidebar (right side) -->
                    {#if chat.canvasOpen && chat.canvasWidget}
                        <Sidebar.Root side="right" variant="inset">
                            <Sidebar.Content>
                                <CanvasWidgetRenderer />
                            </Sidebar.Content>
                        </Sidebar.Root>
                    {/if}
                </Sidebar.Provider>
            </SlideoutContent>
        </Slideout>
    </SlideoutProvider>
</Sidebar.Provider>
