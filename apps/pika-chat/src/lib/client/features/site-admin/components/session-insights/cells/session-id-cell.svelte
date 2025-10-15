<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import CopyButton from 'pika-ux/pika/copy-button/copy-button.svelte';
    import { getContext } from 'svelte';

    interface Props {
        sessionId: string;
    }

    let { sessionId }: Props = $props();
    const appState = getContext<AppState>('appState');
</script>

<CopyButton
    showTextAsLink={true}
    truncateAfter={12}
    embedded={true}
    linkCallbackFn={() => appState.siteAdmin.sessionInsights.openSession(sessionId)}
    value={sessionId}
></CopyButton>
