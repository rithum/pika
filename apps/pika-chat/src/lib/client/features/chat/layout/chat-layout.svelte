<script lang="ts">
    import * as Sidebar from '$comps/ui/sidebar/index.js';
    import { Slideout, SlideoutContent, SlideoutProvider } from '$comps/ui-pika/slideout';
    import { type Snippet } from 'svelte';
    import ChatSidebar from './chat-sidebar.svelte';
    import ChatTitlebar from './chat-titlebar.svelte';

    interface Props {
        children?: Snippet<[]>;
    }

    const { children }: Props = $props();
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
