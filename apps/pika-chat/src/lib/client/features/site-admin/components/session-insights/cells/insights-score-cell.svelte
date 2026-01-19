<script lang="ts">
    import type { SessionInsights } from 'pika-shared/types/chatbot/chatbot-types';

    interface Props {
        insights?: SessionInsights;
        showLabels?: boolean;
        compact?: boolean;
    }

    let { insights, showLabels = true, compact = false }: Props = $props();

    // Extract scores from insights
    const goalScore = insights?.scoring?.scores?.goalAchievement?.score;
    const satisfactionScore = insights?.scoring?.scores?.userSatisfaction?.score;
    const aiPerformanceScore = insights?.scoring?.scores?.aiPerformance?.overall?.score;

    function getScoreColor(score: number | undefined): string {
        if (score === undefined) return 'bg-muted';
        if (score >= 8) return 'bg-success';
        if (score >= 6) return 'bg-warning';
        if (score >= 4) return 'bg-warning/80';
        return 'bg-destructive';
    }

    function formatScore(score: number | undefined): string {
        return score !== undefined ? score.toFixed(1) : '-';
    }
</script>

{#if !insights}
    <div class="text-muted-foreground text-sm">No insights</div>
{:else}
    <div class="space-y-2 {compact ? 'text-xs' : 'text-sm'}">
        <!-- Goal Achievement Score -->
        <div class="flex items-center gap-2">
            {#if showLabels && !compact}
                <span class="text-muted-foreground w-12 text-xs">Goal:</span>
            {/if}
            <div class="flex-1 min-w-0">
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div
                        class="h-2 rounded-full {getScoreColor(goalScore)}"
                        style="width: {((goalScore || 0) / 10) * 100}%"
                    ></div>
                </div>
            </div>
            <span class="w-8 text-right font-mono {compact ? 'text-xs' : 'text-sm'}">
                {formatScore(goalScore)}
            </span>
        </div>

        <!-- User Satisfaction Score -->
        <div class="flex items-center gap-2">
            {#if showLabels && !compact}
                <span class="text-muted-foreground w-12 text-xs">Sat:</span>
            {/if}
            <div class="flex-1 min-w-0">
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div
                        class="h-2 rounded-full {getScoreColor(satisfactionScore)}"
                        style="width: {((satisfactionScore || 0) / 10) * 100}%"
                    ></div>
                </div>
            </div>
            <span class="w-8 text-right font-mono {compact ? 'text-xs' : 'text-sm'}">
                {formatScore(satisfactionScore)}
            </span>
        </div>

        <!-- AI Performance Score -->
        <div class="flex items-center gap-2">
            {#if showLabels && !compact}
                <span class="text-muted-foreground w-12 text-xs">AI:</span>
            {/if}
            <div class="flex-1 min-w-0">
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div
                        class="h-2 rounded-full {getScoreColor(aiPerformanceScore)}"
                        style="width: {((aiPerformanceScore || 0) / 10) * 100}%"
                    ></div>
                </div>
            </div>
            <span class="w-8 text-right font-mono {compact ? 'text-xs' : 'text-sm'}">
                {formatScore(aiPerformanceScore)}
            </span>
        </div>

        <!-- Status info if available -->
        <div class="text-xs text-muted-foreground">Status: Available</div>
    </div>
{/if}
