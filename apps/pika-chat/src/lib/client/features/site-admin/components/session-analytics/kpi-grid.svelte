<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { getContext } from 'svelte';
    import KpiCard from './kpi-card.svelte';

    const appState = getContext<AppState>('appState');
    const sessionAnalytics = appState.siteAdmin.sessionAnalytics;

    const analyticsData = $derived(sessionAnalytics.analyticsData);
    const loading = $derived(sessionAnalytics.isFetching);
    const entityFeatureEnabled = $derived(sessionAnalytics.entityFeatureEnabled);
    const entityDisplayName = $derived(sessionAnalytics.entityDisplayName);

    // Derived metrics
    const avgCostPerSession = $derived.by(() => {
        if (!analyticsData?.summary) return 0;
        const { totalSessions, totalCost } = analyticsData.summary;
        return totalSessions > 0 ? totalCost / totalSessions : 0;
    });

    const avgTokensPerSession = $derived.by(() => {
        if (!analyticsData?.summary) return 0;
        const { totalSessions, totalInputTokens, totalOutputTokens } = analyticsData.summary;
        return totalSessions > 0 ? (totalInputTokens + totalOutputTokens) / totalSessions : 0;
    });

    const costPer1MTokens = $derived.by(() => {
        if (!analyticsData?.summary) return 0;
        const { totalInputTokens, totalOutputTokens, totalCost } = analyticsData.summary;
        const totalTokens = totalInputTokens + totalOutputTokens;
        return totalTokens > 0 ? (totalCost / totalTokens) * 1000000 : 0;
    });
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    <!-- Usage KPIs -->
    <KpiCard
        title="Total Sessions"
        value={analyticsData?.summary?.totalSessions ?? 0}
        format="number"
        {loading}
        helpText="Total number of chat sessions in the selected date range and filters"
    />

    <KpiCard
        title="Unique Users"
        value={analyticsData?.summary?.uniqueUsers ?? 0}
        format="number"
        {loading}
        helpText="Number of distinct users who started sessions"
    />

    {#if entityFeatureEnabled}
        <KpiCard
            title="Unique {entityDisplayName}s"
            value={analyticsData?.summary?.uniqueEntities ?? 0}
            format="number"
            {loading}
            helpText="Number of distinct {entityDisplayName.toLowerCase()}s represented in the sessions"
        />
    {/if}

    <KpiCard
        title="Total Messages"
        value={analyticsData?.summary?.totalMessages ?? 0}
        subtitle="(Not yet tracked)"
        format="number"
        {loading}
        helpText="Total number of messages exchanged (user + AI) across all sessions. Note: Message counts are not currently being tracked in sessions."
    />

    <!-- Cost KPIs -->
    <KpiCard
        title="Total Cost"
        value={analyticsData?.summary?.totalCost ?? 0}
        format="currency"
        {loading}
        helpText="Total cost for all sessions including input and output token costs"
    />

    <KpiCard
        title="Avg Cost/Session"
        value={avgCostPerSession}
        format="currency"
        {loading}
        helpText="Average cost per session (Total Cost ÷ Total Sessions)"
    />

    <KpiCard
        title="Total Input Tokens"
        value={analyticsData?.summary?.totalInputTokens ?? 0}
        format="number"
        {loading}
        helpText="Total number of input tokens (user messages + system prompts)"
    />

    <KpiCard
        title="Total Output Tokens"
        value={analyticsData?.summary?.totalOutputTokens ?? 0}
        format="number"
        {loading}
        helpText="Total number of output tokens (AI responses)"
    />

    <!-- Efficiency KPIs -->
    <KpiCard
        title="Avg Tokens/Session"
        value={avgTokensPerSession}
        format="number"
        {loading}
        helpText="Average tokens per session (Total Tokens ÷ Total Sessions)"
    />

    <KpiCard
        title="Cost per 1M Tokens"
        value={costPer1MTokens}
        format="currency"
        {loading}
        helpText="Average cost per 1,000,000 tokens (standard pricing metric for comparing efficiency)"
    />
</div>
