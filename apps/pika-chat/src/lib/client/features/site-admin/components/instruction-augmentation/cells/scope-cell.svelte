<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { SemanticDirective } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import Scope from '../scope.svelte';
    interface Props {
        directive: SemanticDirective;
    }

    let { directive }: Props = $props();
    const appState = getContext<AppState>('appState');
</script>

<Scope
    scope={directive}
    mode="button"
    onclick={() => appState.siteAdmin.instructionAugmentation.setCurrentDirective(directive)}
/>
