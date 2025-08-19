<script lang="ts">
    import { onMount } from 'svelte';

    type Props = {
        url: string; // remote JS file (S3/static)
        tagName: string; // e.g., 'prompt-button-wc'
        props?: Record<string, unknown>; // { segment, appState, chatAppState, disabled }
        class?: string; // optional wrapper class
    };

    const { url, tagName, props = {}, class: klass = '' }: Props = $props();

    let container = $state<HTMLSpanElement | null>(null);
    let el = $state<HTMLElement | null>(null);
    let loaded = $state(false);

    async function ensureDefined(tag: string, src: string) {
        if (typeof window === 'undefined') return;
        if (customElements.get(tag)) return;
        await import(/* @vite-ignore */ src);
        if (!customElements.get(tag)) {
            throw new Error(`Custom element ${tag} not defined by ${src}`);
        }
    }

    function mountElement() {
        if (!container || !loaded || el) return;
        const node = document.createElement(tagName);
        container.replaceChildren(node);
        el = node;
        applyProps(); // initial props
    }

    function applyProps() {
        if (!el) return;
        for (const [k, v] of Object.entries(props)) {
            // @ts-expect-error dynamic property
            el[k] = v;
        }
        // optional hint for WCs to re-render
        el.dispatchEvent(new CustomEvent('__propsUpdated__', { bubbles: false }));
    }

    // Load the WC script once on the client
    onMount(async () => {
        if (loaded || typeof window === 'undefined') return;
        await ensureDefined(tagName, url);
        loaded = true;
    });

    // When loaded or container becomes available, create the element once
    $effect(() => {
        if (loaded && container && !el) mountElement();
    });

    // Keep properties in sync whenever `props` object identity or its contents change
    $effect(() => {
        if (el) applyProps();
    });

    // cleanup
    $effect(() => {
        return () => {
            if (container) container.replaceChildren();
            el = null;
        };
    });
</script>

<span bind:this={container} class={klass}></span>
