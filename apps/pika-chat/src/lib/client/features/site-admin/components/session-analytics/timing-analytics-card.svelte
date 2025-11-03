<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'pika-ux/shadcn/card';
    import { Separator } from 'pika-ux/shadcn/separator';
    import { Skeleton } from 'pika-ux/shadcn/skeleton';
    import { getContext } from 'svelte';

    const appState = getContext<AppState>('appState');
    const sessionAnalytics = appState.siteAdmin.sessionAnalytics;

    const analyticsData = $derived(sessionAnalytics.analyticsData);
    const loading = $derived(sessionAnalytics.isFetching);
    const timingAnalytics = $derived(analyticsData?.summary?.timingAnalytics);

    // Helper to format duration
    function formatDuration(ms: number): string {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
        if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
        return `${(ms / 86400000).toFixed(1)}d`;
    }
</script>

<Card>
    <CardHeader>
        <CardTitle>Timing Analytics</CardTitle>
        <CardDescription>Response times and conversation patterns</CardDescription>
    </CardHeader>
    <CardContent>
        {#if loading}
            <div class="space-y-3">
                <Skeleton class="h-12 w-full" />
                <Skeleton class="h-12 w-full" />
                <Skeleton class="h-12 w-full" />
                <Separator />
                <Skeleton class="h-20 w-full" />
            </div>
        {:else if !timingAnalytics}
            <div class="flex items-center justify-center h-[200px] text-muted-foreground">No timing data available</div>
        {:else}
            <div class="space-y-4">
                <!-- Main Timing Metrics -->
                <div class="space-y-3">
                    <div class="flex justify-between items-center">
                        <div>
                            <div class="text-sm font-medium">Avg Response Time</div>
                            <div class="text-xs text-muted-foreground">Time from user question to AI response</div>
                        </div>
                        <div class="text-lg font-bold">{formatDuration(timingAnalytics.avgResponseTimeMs)}</div>
                    </div>

                    <div class="flex justify-between items-center">
                        <div>
                            <div class="text-sm font-medium">Avg User Think Time</div>
                            <div class="text-xs text-muted-foreground">Time from AI response to next user message</div>
                        </div>
                        <div class="text-lg font-bold">{formatDuration(timingAnalytics.avgUserThinkTimeMs)}</div>
                    </div>

                    <div class="flex justify-between items-center">
                        <div>
                            <div class="text-sm font-medium">Avg Session Duration</div>
                            <div class="text-xs text-muted-foreground">Time from first to last message</div>
                        </div>
                        <div class="text-lg font-bold">{formatDuration(timingAnalytics.avgSessionDurationMs)}</div>
                    </div>

                    <div class="flex justify-between items-center">
                        <div>
                            <div class="text-sm font-medium">Avg Time Between Turns</div>
                            <div class="text-xs text-muted-foreground">Average gap between any messages</div>
                        </div>
                        <div class="text-lg font-bold">{formatDuration(timingAnalytics.avgTimeBetweenTurnsMs)}</div>
                    </div>
                </div>

                <Separator />

                <!-- Long Gaps Section -->
                <div>
                    <div class="text-sm font-medium mb-3">Sessions with Long Gaps</div>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between items-center">
                            <span class="text-muted-foreground">Over 1 hour</span>
                            <span class="font-medium"
                                >{timingAnalytics.sessionsWithLongGaps.over1Hour.toLocaleString()}</span
                            >
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-muted-foreground">Over 1 day</span>
                            <span class="font-medium"
                                >{timingAnalytics.sessionsWithLongGaps.over1Day.toLocaleString()}</span
                            >
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-muted-foreground">Over 1 week</span>
                            <span class="font-medium"
                                >{timingAnalytics.sessionsWithLongGaps.over1Week.toLocaleString()}</span
                            >
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    </CardContent>
</Card>
