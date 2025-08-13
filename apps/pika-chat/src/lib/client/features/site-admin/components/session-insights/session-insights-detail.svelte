<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { getContext } from 'svelte';
    import {
        ChartBar,
        TrendingUp,
        MessageCircle,
        Users,
        Clock,
        Target,
        Brain,
        DollarSign,
        FileText,
    } from '$icons/lucide';
    import { Badge } from '$ui/shadcn/badge';
    import { Card } from '$ui/shadcn/card';
    import { Separator } from '$ui/shadcn/separator';
    import { ScrollArea } from '$ui/shadcn/scroll-area';
    import ExpandableContainer from '$ui/pika/expandable-container/expandable-container.svelte';
    import InsightsScoreCard from './insights-score-card.svelte';
    import InsightsAssessmentBadges from './insights-assessment-badges.svelte';

    const appState = getContext<AppState>('appState');
    const sessionInsights = appState.siteAdmin.sessionInsights;
    const insights = $derived(!!sessionInsights.currentSession ? sessionInsights.curSessionInsights : undefined);
</script>

<ScrollArea class="h-full">
    <div class="p-6">
        {#if sessionInsights.isRetrievingCompleteSession}
            {@render loader()}
        {:else if !insights}
            <!-- Empty State -->
            <div class="flex flex-col items-center justify-center h-full text-center p-8">
                <ChartBar class="w-12 h-12 text-muted-foreground mb-4" />
                <h3 class="text-lg font-medium mb-2">No insights available</h3>
                <p class="text-sm text-muted-foreground max-w-sm">
                    Insights will appear here once the session analysis is complete.
                </p>
                {#if sessionInsights.currentSession?.insightStatus === 'NEEDS_INSIGHTS_ANALYSIS'}
                    <Badge variant="outline" class="mt-3">
                        <Clock class="w-3 h-3 mr-1" />
                        Analysis Pending
                    </Badge>
                {/if}
            </div>
        {:else}
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex items-center gap-2">
                    <ChartBar class="w-5 h-5" />
                    <h2 class="text-lg font-semibold">Session Insights</h2>
                    <Badge variant="outline" class="ml-auto">
                        Model: {insights.model}
                    </Badge>
                </div>

                <!-- Key Metrics - Always Visible -->
                <Card class="p-4">
                    <h3 class="text-sm font-medium mb-4 flex items-center gap-2">
                        <Target class="w-4 h-4" />
                        Key Performance Metrics
                    </h3>

                    <div class="grid grid-cols-1 gap-4">
                        <InsightsScoreCard
                            title="Goal Achievement"
                            score={insights.scoring.scores.goalAchievement.score}
                            description={insights.scoring.scores.goalAchievement.description}
                            icon={Target}
                        />

                        <InsightsScoreCard
                            title="User Satisfaction"
                            score={insights.scoring.scores.userSatisfaction.score}
                            description={insights.scoring.scores.userSatisfaction.description}
                            icon={Users}
                        />

                        <InsightsScoreCard
                            title="AI Performance"
                            score={insights.scoring.scores.aiPerformance.overall.score}
                            description={insights.scoring.scores.aiPerformance.overall.description}
                            icon={Brain}
                        />

                        <InsightsScoreCard
                            title="Interaction Quality"
                            score={insights.scoring.scores.interactionQuality.score}
                            description={insights.scoring.scores.interactionQuality.description}
                            icon={MessageCircle}
                        />
                    </div>
                </Card>

                <!-- Assessment Badges -->
                <Card class="p-4">
                    <h3 class="text-sm font-medium mb-4">Session Assessment</h3>
                    <InsightsAssessmentBadges
                        assessments={insights.scoring.assessments}
                        metrics={insights.scoring.metrics}
                    />
                </Card>

                <!-- Collapsible Sections -->
                <div class="space-y-4">
                    <!-- AI Performance Details -->
                    <ExpandableContainer title="AI Performance Details" useCase="default">
                        <div class="grid grid-cols-1 gap-4">
                            <InsightsScoreCard
                                title="Accuracy"
                                score={insights.scoring.scores.aiPerformance.accuracy.score}
                                description={insights.scoring.scores.aiPerformance.accuracy.description}
                                compact={true}
                            />
                            <InsightsScoreCard
                                title="Helpfulness"
                                score={insights.scoring.scores.aiPerformance.helpfulness.score}
                                description={insights.scoring.scores.aiPerformance.helpfulness.description}
                                compact={true}
                            />
                            <InsightsScoreCard
                                title="Communication"
                                score={insights.scoring.scores.aiPerformance.communication.score}
                                description={insights.scoring.scores.aiPerformance.communication.description}
                                compact={true}
                            />
                            <InsightsScoreCard
                                title="Efficiency"
                                score={insights.scoring.scores.aiPerformance.efficiency.score}
                                description={insights.scoring.scores.aiPerformance.efficiency.description}
                                compact={true}
                            />
                        </div>
                    </ExpandableContainer>

                    <!-- Session Metrics -->
                    <ExpandableContainer title="Session Metrics" useCase="default">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div class="space-y-2">
                                <div class="flex justify-between">
                                    <span class="text-muted-foreground">Duration:</span>
                                    <Badge variant="outline">{insights.scoring.metrics.sessionDurationEstimate}</Badge>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-muted-foreground">Complexity:</span>
                                    <Badge variant="outline">{insights.scoring.metrics.complexityLevel}</Badge>
                                </div>
                            </div>
                            <div class="space-y-2">
                                <div class="flex justify-between">
                                    <span class="text-muted-foreground">User Effort:</span>
                                    <Badge variant="outline">{insights.scoring.metrics.userEffortRequired}</Badge>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-muted-foreground">AI Confidence:</span>
                                    <Badge variant="outline">{insights.scoring.metrics.aiConfidenceLevel}</Badge>
                                </div>
                            </div>
                        </div>
                    </ExpandableContainer>

                    <!-- Cost & Usage -->
                    {#if sessionInsights.currentSession}
                        <ExpandableContainer title="Cost & Usage" useCase="default">
                            <div class="grid grid-cols-2 gap-4 text-sm">
                                <div class="space-y-2">
                                    <div class="flex justify-between">
                                        <span class="text-muted-foreground">Input Tokens:</span>
                                        <span class="font-mono"
                                            >{sessionInsights.currentSession.inputTokens?.toLocaleString() ||
                                                'N/A'}</span
                                        >
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-muted-foreground">Output Tokens:</span>
                                        <span class="font-mono"
                                            >{sessionInsights.currentSession.outputTokens?.toLocaleString() ||
                                                'N/A'}</span
                                        >
                                    </div>
                                </div>
                                <div class="space-y-2">
                                    <div class="flex justify-between">
                                        <span class="text-muted-foreground">Input Cost:</span>
                                        <span class="font-mono"
                                            >${sessionInsights.currentSession.inputCost?.toFixed(4) || 'N/A'}</span
                                        >
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-muted-foreground">Output Cost:</span>
                                        <span class="font-mono"
                                            >${sessionInsights.currentSession.outputCost?.toFixed(4) || 'N/A'}</span
                                        >
                                    </div>
                                    <Separator />
                                    <div class="flex justify-between font-medium">
                                        <span>Total Cost:</span>
                                        <span class="font-mono"
                                            >${sessionInsights.currentSession.totalCost?.toFixed(4) || 'N/A'}</span
                                        >
                                    </div>
                                </div>
                            </div>
                        </ExpandableContainer>
                    {/if}

                    <!-- Detailed Analysis -->
                    <ExpandableContainer title="Detailed Analysis" useCase="default">
                        <div class="prose prose-sm max-w-none">
                            <div class="whitespace-pre-wrap text-sm leading-relaxed">
                                {insights.detailMarkdown}
                            </div>
                        </div>
                    </ExpandableContainer>
                </div>
            </div>
        {/if}
    </div>
</ScrollArea>

{#snippet loader()}
    <div class="flex items-center justify-center">
        <svg class="w-6 h-6 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
        </svg>
    </div>
{/snippet}
