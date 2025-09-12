<script lang="ts">
    import { Carta, MarkdownEditor } from 'carta-md';
    import { code } from '@cartamd/plugin-code';
    import './github.scss';

    interface Props {
        value: string;
        placeholder?: string;
    }

    let initialized = $state(false);

    let { value = $bindable(), placeholder = 'Start writing...' }: Props = $props();
    let carta: Carta | undefined = $state(undefined);

    $effect(() => {
        if (!initialized) {
            carta = new Carta({
                sanitizer: false,
                extensions: [code()],
                rendererDebounce: 100, // Shorter delay to reduce timing issues
            });
            initialized = true;
        }
    });

    // Add cleanup effect
    $effect(() => {
        return () => {
            // Hack to fix a bug in carta where it tries to render once after unmounting
            if (carta) {
                const dummyContainer = document.createElement('div');
                dummyContainer.style.display = 'none';
                // This redirects carta's internal renderer to the dummy container
                // so any pending async operations won't crash on destroyed DOM
                carta.$setRenderer(dummyContainer);
            }
        };
    });
</script>

{#if carta}
    <MarkdownEditor bind:value mode="tabs" theme="github" {carta} {placeholder} />
{/if}
