<script lang="ts">
    import { Card } from '$ui/shadcn/card';
    import type { SessionInsightsState } from './session-insights.state.svelte';

    interface Props {
        sessionInsights: SessionInsightsState;
    }

    let { sessionInsights }: Props = $props();
</script>

<Card class="p-4">
    <div class="text-center py-8">
        <h3 class="text-lg font-medium text-muted-foreground">Advanced Search</h3>
        <p class="text-sm text-muted-foreground mt-2">
            Advanced filtering options will be implemented in a future update.
        </p>
        <p class="text-xs text-muted-foreground mt-1">Use the simple search mode above for basic filtering.</p>
    </div>
</Card>
