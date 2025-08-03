<script lang="ts">
    import { getContext } from 'svelte';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { getSessionSearchDateDisplayValue } from './utils';
    import Chip from '$ui/pika/chip/chip.svelte';
    const appState = getContext<AppState>('appState');
    const sessionInsights = appState.siteAdmin.sessionInsights;

    let haveFiltersApplied = $derived.by(() => {
        return !!searchDateLabelDisplayValue;
    });

    let searchDateLabelDisplayValue = $derived.by(() => {
        const dateFilter = sessionInsights.searchQuery.dateFilter;
        const timezone = sessionInsights.timezone;
        if (dateFilter && dateFilter.startDate) {
            const [label, value] = getSessionSearchDateDisplayValue('select date', timezone, dateFilter, true);
            return `${label}: ${value}`;
        } else {
            return undefined;
        }
    });
</script>

{#if haveFiltersApplied}
    <div class="flex items-center gap-2 flex-wrap min-h-8">
        {#if searchDateLabelDisplayValue}
            <Chip size="sm" ondelete={() => (sessionInsights.searchQuery.dateFilter = undefined)}>
                {@html searchDateLabelDisplayValue}
            </Chip>
        {/if}
    </div>
{/if}
