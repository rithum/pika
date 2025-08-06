<script lang="ts">
    import { Badge } from '$ui/shadcn/badge';
    import { TriangleAlert, CircleCheck, Clock, User, Brain, Zap, TrendingUp } from '$icons/lucide';
    import type {
        SessionInsightUserSentiment,
        SessionInsightGoalCompletionStatus,
        SessionInsightSatisfactionLevel,
        SessionInsightMetricsSessionDurationEstimate,
        SessionInsightMetricsComplexityLevel,
        SessionInsightMetricsUserEffortRequired,
        SessionInsightMetricsAiConfidenceLevel,
    } from '@pika/shared/types/chatbot/chatbot-types';

    interface Props {
        assessments: {
            userSentiment: SessionInsightUserSentiment;
            goalCompletionStatus: SessionInsightGoalCompletionStatus;
            satisfactionLevel: SessionInsightSatisfactionLevel;
            requiresFollowup: boolean;
            criticalIssuesPresent: boolean;
            escalationNeeded: boolean;
        };
        metrics: {
            sessionDurationEstimate: SessionInsightMetricsSessionDurationEstimate;
            complexityLevel: SessionInsightMetricsComplexityLevel;
            userEffortRequired: SessionInsightMetricsUserEffortRequired;
            aiConfidenceLevel: SessionInsightMetricsAiConfidenceLevel;
        };
    }

    let { assessments, metrics }: Props = $props();

    // Helper functions for badge variants
    function getSentimentVariant(sentiment: SessionInsightUserSentiment) {
        switch (sentiment) {
            case 'positive':
                return 'default';
            case 'neutral':
                return 'secondary';
            case 'negative':
                return 'destructive';
        }
    }

    function getCompletionVariant(status: SessionInsightGoalCompletionStatus) {
        switch (status) {
            case 'completed':
                return 'default';
            case 'partially_completed':
                return 'secondary';
            case 'not_completed':
                return 'destructive';
        }
    }

    function getSatisfactionVariant(level: SessionInsightSatisfactionLevel) {
        switch (level) {
            case 'satisfied':
                return 'default';
            case 'neutral':
                return 'secondary';
            case 'dissatisfied':
                return 'destructive';
        }
    }

    function getMetricVariant(level: string) {
        switch (level) {
            case 'low':
                return 'secondary';
            case 'medium':
                return 'outline';
            case 'high':
                return 'default';
            case 'short':
                return 'secondary';
            case 'long':
                return 'default';
            default:
                return 'outline';
        }
    }
</script>

<div class="space-y-4">
    <!-- Primary Assessments -->
    <div class="grid grid-cols-2 gap-3">
        <div class="space-y-2">
            <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sentiment</h4>
            <Badge variant={getSentimentVariant(assessments.userSentiment)} class="justify-start">
                <User class="w-3 h-3 mr-1" />
                {assessments.userSentiment}
            </Badge>
        </div>

        <div class="space-y-2">
            <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Goal Status</h4>
            <Badge variant={getCompletionVariant(assessments.goalCompletionStatus)} class="justify-start">
                <CircleCheck class="w-3 h-3 mr-1" />
                {assessments.goalCompletionStatus.replace('_', ' ')}
            </Badge>
        </div>

        <div class="space-y-2">
            <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Satisfaction</h4>
            <Badge variant={getSatisfactionVariant(assessments.satisfactionLevel)} class="justify-start">
                <TrendingUp class="w-3 h-3 mr-1" />
                {assessments.satisfactionLevel}
            </Badge>
        </div>

        <div class="space-y-2">
            <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Confidence</h4>
            <Badge variant={getMetricVariant(metrics.aiConfidenceLevel)} class="justify-start">
                <Brain class="w-3 h-3 mr-1" />
                {metrics.aiConfidenceLevel}
            </Badge>
        </div>
    </div>

    <!-- Alert Flags -->
    {#if assessments.requiresFollowup || assessments.criticalIssuesPresent || assessments.escalationNeeded}
        <div class="space-y-2">
            <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Flags</h4>
            <div class="flex flex-wrap gap-2">
                {#if assessments.requiresFollowup}
                    <Badge variant="outline" class="text-yellow-600 border-yellow-200">
                        <Clock class="w-3 h-3 mr-1" />
                        Requires Follow-up
                    </Badge>
                {/if}
                {#if assessments.criticalIssuesPresent}
                    <Badge variant="destructive">
                        <TriangleAlert class="w-3 h-3 mr-1" />
                        Critical Issues
                    </Badge>
                {/if}
                {#if assessments.escalationNeeded}
                    <Badge variant="destructive">
                        <TriangleAlert class="w-3 h-3 mr-1" />
                        Escalation Needed
                    </Badge>
                {/if}
            </div>
        </div>
    {/if}

    <!-- Session Characteristics -->
    <div class="space-y-2">
        <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Session Characteristics</h4>
        <div class="flex flex-wrap gap-2">
            <Badge variant={getMetricVariant(metrics.sessionDurationEstimate)}>
                <Clock class="w-3 h-3 mr-1" />
                {metrics.sessionDurationEstimate} duration
            </Badge>
            <Badge variant={getMetricVariant(metrics.complexityLevel)}>
                <Brain class="w-3 h-3 mr-1" />
                {metrics.complexityLevel} complexity
            </Badge>
            <Badge variant={getMetricVariant(metrics.userEffortRequired)}>
                <Zap class="w-3 h-3 mr-1" />
                {metrics.userEffortRequired} effort
            </Badge>
        </div>
    </div>
</div>
