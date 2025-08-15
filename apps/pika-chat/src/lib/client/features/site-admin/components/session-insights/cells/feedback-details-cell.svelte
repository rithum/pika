<script lang="ts">
    import { Badge } from '$ui/shadcn/badge';
    import type { ChatSessionFeedback } from 'pika-shared/types/chatbot/chatbot-types';

    interface Props {
        feedback: ChatSessionFeedback[];
        maxDisplay?: number;
        showSeverityColors?: boolean;
    }

    let { feedback, maxDisplay = 3, showSeverityColors = true }: Props = $props();

    function getSeverityVariant(severity: string) {
        if (!showSeverityColors) return 'outline';

        switch (severity?.toLowerCase()) {
            case 'high':
                return 'destructive';
            case 'medium':
                return 'default';
            case 'low':
                return 'secondary';
            default:
                return 'outline';
        }
    }

    function getSeverityColor(severity: string): string {
        switch (severity?.toLowerCase()) {
            case 'high':
                return 'text-red-600 bg-red-50 border-red-200';
            case 'medium':
                return 'text-yellow-600 bg-yellow-50 border-yellow-200';
            case 'low':
                return 'text-green-600 bg-green-50 border-green-200';
            default:
                return 'text-gray-600 bg-gray-50 border-gray-200';
        }
    }

    // Group feedback by severity for summary
    const feedbackSummary = feedback.reduce(
        (acc, item) => {
            const severity = item.severity || 'unknown';
            acc[severity] = (acc[severity] || 0) + 1;
            return acc;
        },
        {} as Record<string, number>
    );

    const sortedFeedback = feedback
        .sort((a, b) => {
            // Sort by severity (high > medium > low) then by date
            const severityOrder = { high: 3, medium: 2, low: 1 };
            const aOrder = severityOrder[a.severity?.toLowerCase() as keyof typeof severityOrder] || 0;
            const bOrder = severityOrder[b.severity?.toLowerCase() as keyof typeof severityOrder] || 0;

            if (aOrder !== bOrder) return bOrder - aOrder;

            return new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime();
        })
        .slice(0, maxDisplay);

    const hasMoreFeedback = feedback.length > maxDisplay;
</script>

{#if feedback.length === 0}
    <div class="text-muted-foreground text-sm">No feedback</div>
{:else}
    <div class="space-y-2">
        <!-- Feedback Summary -->
        <div class="flex gap-1 flex-wrap">
            {#each Object.entries(feedbackSummary) as [severity, count]}
                <Badge
                    variant={getSeverityVariant(severity)}
                    class="text-xs px-1.5 py-0.5 {getSeverityColor(severity)}"
                >
                    {severity}: {count}
                </Badge>
            {/each}
        </div>

        <!-- Individual Feedback Items -->
        <div class="space-y-1">
            {#each sortedFeedback as item}
                <div class="text-xs border rounded px-2 py-1 {getSeverityColor(item.severity || 'unknown')}">
                    <div class="flex items-center justify-between">
                        <span class="font-medium">{item.severity || 'Unknown'}</span>
                        <span class="text-muted-foreground">
                            {new Date(item.createdOn).toLocaleDateString()}
                        </span>
                    </div>
                    <!-- {#if item.description}
                        <div class="truncate" title={item.description}>
                            {item.description}
                        </div>
                    {/if} -->
                    {#if item.type}
                        <div class="text-muted-foreground">
                            Type: {item.type}
                        </div>
                    {/if}
                </div>
            {/each}

            {#if hasMoreFeedback}
                <div class="text-xs text-muted-foreground text-center">
                    +{feedback.length - maxDisplay} more
                </div>
            {/if}
        </div>

        <!-- Additional Info -->
        {#if feedback.some((f) => f.reportedByHuman)}
            <div class="text-xs text-blue-600">Contains human reports</div>
        {/if}

        {#if feedback.some((f) => f.createdByCustomer)}
            <div class="text-xs text-purple-600">Contains customer feedback</div>
        {/if}
    </div>
{/if}
