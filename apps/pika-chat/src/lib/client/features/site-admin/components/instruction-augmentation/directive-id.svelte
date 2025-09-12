<script lang="ts">
    import { X } from '$icons/lucide';
    import { Button } from '$ui/shadcn/button';

    interface Props {
        directiveId: string;
        onclick?: () => void;
        disabled?: boolean;
        mode?: 'default' | 'button' | 'chip';
    }

    let { directiveId, onclick, disabled, mode = 'default' }: Props = $props();

    let containerRef: HTMLElement;
    let isWrapped = $state(false);

    // Check if content is wrapped
    function checkWrapping() {
        if (containerRef) {
            const isCurrentlyWrapped = containerRef.scrollHeight > containerRef.clientHeight;
            if (isCurrentlyWrapped !== isWrapped) {
                isWrapped = isCurrentlyWrapped;
            }
        }
    }

    // Action to observe element resizing and check for wrapping
    function wrapObserver(node: HTMLElement) {
        containerRef = node;

        const resizeObserver = new ResizeObserver(() => {
            checkWrapping();
        });

        resizeObserver.observe(node);

        // Initial check
        setTimeout(checkWrapping, 0);

        return {
            destroy() {
                resizeObserver.disconnect();
            },
        };
    }

    const wrapPadding = $derived(isWrapped ? 'py-0.5' : '');
    const containerAlignment = $derived(isWrapped ? 'items-start' : 'items-center');
    const scopeTypeClasses = $derived(
        isWrapped
            ? 'flex-shrink-0 bg-slate-300/50 text-slate-800 font-semibold text-xxs px-2 rounded-full mr-1 whitespace-nowrap h-full flex items-center py-0.5'
            : 'flex-shrink-0 bg-slate-300/50 text-slate-800 font-semibold text-xxs px-2 py-0.5 rounded-full mr-1 whitespace-nowrap'
    );
    const scopeTypeButtonClasses = $derived(
        isWrapped
            ? 'flex-shrink-0 bg-slate-300/50 text-slate-800 font-semibold text-xxs px-2 rounded-full mr-1 whitespace-nowrap transition-all duration-200 group-hover:bg-slate-400/60 group-active:bg-slate-500/70 h-full flex items-center py-0.5'
            : 'flex-shrink-0 bg-slate-300/50 text-slate-800 font-semibold text-xxs px-2 py-0.5 rounded-full mr-1 whitespace-nowrap transition-all duration-200 group-hover:bg-slate-400/60 group-active:bg-slate-500/70'
    );
    const buttonContainerClasses = $derived(
        isWrapped
            ? `min-h-7 group inline-flex ${containerAlignment} rounded-full bg-slate-100 text-slate-800 p-0.5 pr-2 ${wrapPadding} transition-all duration-200 hover:bg-slate-200 hover:scale-103 active:bg-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300 focus:ring-offset-1`
            : `h-7 group inline-flex ${containerAlignment} rounded-full bg-slate-100 text-slate-800 px-0.5 pr-2 transition-all duration-200 hover:bg-slate-200 hover:scale-103 active:bg-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300 focus:ring-offset-1`
    );
</script>

{#if mode === 'button'}
    <div use:wrapObserver class="inline-block">
        <Button onclick={onclick || (() => {})} {disabled} class={buttonContainerClasses}>
            <span class={scopeTypeButtonClasses}>ID</span>
            <span class="text-xs font-medium break-words min-w-0">{directiveId}</span>
        </Button>
    </div>
{:else if mode === 'chip'}
    <div class="relative inline-block">
        <div
            use:wrapObserver
            class="min-h-7 inline-flex {containerAlignment} rounded-full bg-slate-100 text-slate-800 p-0.5 pr-2 {wrapPadding} transition-all duration-200"
        >
            <span class={scopeTypeClasses}>ID</span>
            <span class="text-xs font-medium break-words min-w-0">{directiveId}</span>
        </div>
        <Button
            variant="ghost"
            size="icon"
            class="absolute -top-3 -right-2 h-6 w-6 hover:border hover:border-gray-200"
            {disabled}
            onclick={onclick || (() => {})}
        >
            <X class="h-2.5 w-2.5" />
        </Button>
    </div>
{:else}
    <div
        use:wrapObserver
        class="min-h-7 inline-flex {containerAlignment} rounded-full bg-slate-100 text-slate-800 p-0.5 pr-2 {wrapPadding} transition-all duration-200"
    >
        <span class={scopeTypeClasses}>ID</span>
        <span class="text-xs font-medium break-words min-w-0">{directiveId}</span>
    </div>
{/if}
