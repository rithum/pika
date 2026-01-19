<script lang="ts">
    import ChevronLeft from '$icons/lucide/chevron-left';
    import ChevronRight from '$icons/lucide/chevron-right';
    import ListFilter from '$icons/lucide/list-filter';
    import ListRestart from '$icons/lucide/list-restart';
    import SlidersVertical from '$icons/lucide/sliders-vertical';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { Badge } from 'pika-ux/shadcn/badge';
    import { Button } from 'pika-ux/shadcn/button';
    import * as DropdownMenu from 'pika-ux/shadcn/dropdown-menu';
    import * as Popover from 'pika-ux/shadcn/popover';
    import { Separator } from 'pika-ux/shadcn/separator';
    import { getContext } from 'svelte';
    import DatePopup from './date-popup.svelte';
    import ChatAppsFilter from './filters/chatapps-filter.svelte';
    import EntityFilter from './filters/entity-filter.svelte';
    import UserTypeFilter from './filters/user-type-filter.svelte';
    import FeedbackInternalCommentStatusFilter from './filters/feedback-internal-comment-status-filter.svelte';
    import FeedbackInternalCommentTypeFilter from './filters/feedback-internal-comment-type-filter.svelte';
    import FeedbackSeverityFilter from './filters/feedback-severity-filter.svelte';
    import FeedbackStatusFilter from './filters/feedback-status-filter.svelte';
    import FeedbackTypeFilter from './filters/feedback-type-filter.svelte';
    import FlaggedFilter from './filters/flagged-filter.svelte';
    import HasInsightsFilter from './filters/has-insights-filter.svelte';
    import InsightsAiConfidenceLevelFilter from './filters/insights-ai-confidence-level.svelte';
    import InsightsComplexityLevelFilter from './filters/insights-complexity-level.svelte';
    import InsightsGoalCompletionStatusFilter from './filters/insights-goal-completion-status.svelte';
    import InsightsSatisfactionLevelFilter from './filters/insights-satisfaction-level.svelte';
    import InsightsScoresFilter from './filters/insights-scores.svelte';
    import InsightsUserEffortFilter from './filters/insights-user-effort.svelte';
    import InsightsUserSentimentFilter from './filters/insights-user-sentiment-filter.svelte';
    import UserFilter from './filters/user-filter.svelte';
    import SaveSavedSearch from './saved-search/save-saved-search.svelte';
    import ViewSavedSearches from './saved-search/view-saved-searches.svelte';
    import { createDefaultSearchQuery } from './utils';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const sessionInsights = siteAdmin.sessionInsights;
    let showSavedSearches = $state(false);
    let showSaveCurrentSearch = $state(false);
    let advancedOpen = $state(false);

    // Count active filters
    let activeFilterCount = $derived.by(() => {
        const query = sessionInsights.searchQuery;
        let count = 0;

        // Check each filter property
        if (query.dateFilter?.startDate) count++;
        if (query.userId) count++;
        if (query.chatAppId) count++;
        // Check if customUserData has any defined (non-undefined) values
        if (query.customUserData && Object.values(query.customUserData).some((val) => val !== undefined)) count++;
        if (query.userType) count++;
        if (query.flagged !== undefined) count++;

        // Insights filters
        if (query.insights?.hasInsights !== undefined) count++;
        // Count all score filters
        if (query.insights?.goalAchievementScore !== undefined) count++;
        if (query.insights?.userSatisfactionScore !== undefined) count++;
        if (query.insights?.aiPerformanceOverallScore !== undefined) count++;
        if (query.insights?.aiPerformanceAccuracyScore !== undefined) count++;
        if (query.insights?.aiPerformanceEfficiencyScore !== undefined) count++;
        if (query.insights?.interactionQualityScore !== undefined) count++;
        if (query.insights?.userSentiment) count++;
        if (query.insights?.satisfactionLevel) count++;
        if (query.insights?.goalCompletionStatus) count++;
        if (query.insights?.aiConfidenceLevel) count++;
        if (query.insights?.userEffortRequired) count++;
        if (query.insights?.complexityLevel) count++;

        // Feedback filters
        if (query.feedbackInStatus && query.feedbackInStatus.length > 0) count++;
        if (query.feedbackSeverity && query.feedbackSeverity.length > 0) count++;
        if (query.feedbackType && query.feedbackType.length > 0) count++;
        if (query.feedbackInternalCommentType && query.feedbackInternalCommentType.length > 0) count++;
        if (query.feedbackInternalCommentStatus && query.feedbackInternalCommentStatus.length > 0) count++;
        if (query.feedbackUserId) count++;
        if (query.feedbackInternalCommentUserId) count++;

        return count;
    });
</script>

<Popover.Root>
    <Popover.Trigger>
        {#snippet child({ props })}
            <Button {...props} variant="outline" size="sm" class="h-8 relative">
                <ListFilter class="w-4 h-4" />
                {#if activeFilterCount > 0}
                    <Badge
                        variant="default"
                        class="absolute -top-2 -right-2 h-5 min-w-5 px-1 flex items-center justify-center text-xs font-semibold"
                    >
                        {activeFilterCount}
                    </Badge>
                {/if}
            </Button>
        {/snippet}
    </Popover.Trigger>
    <Popover.Content class="p-0 {advancedOpen ? 'w-[1200px]' : 'w-[400px]'}">
        <div class="flex flex-row">
            <!-- Basic Filters-->
            <div class="flex flex-col w-[400px]">
                <div class="pl-4 pr-1 flex items-center justify-between pt-1">
                    <div class="text-sm font-medium">Basic Filters</div>
                    <div>
                        {@render settingsDropdownMenu()}
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-8"
                            onclick={() => {
                                sessionInsights.searchQuery = createDefaultSearchQuery();
                            }}
                        >
                            <ListRestart class="w-3 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 {advancedOpen ? 'bg-gray-50' : ''}"
                            onclick={() => (advancedOpen = !advancedOpen)}
                        >
                            {#if advancedOpen}
                                <ChevronLeft class="w-3 h-4 text-primary" />
                            {:else}
                                <ChevronRight class="w-3 h-4" />
                            {/if}
                        </Button>
                    </div>
                </div>
                <Separator />
                <div class="p-4 pr-2 flex flex-col gap-4">
                    <DatePopup
                        bind:dateFilter={
                            () => sessionInsights.searchQuery.dateFilter,
                            (value) => {
                                sessionInsights.searchQuery.dateFilter = value;
                            }
                        }
                        placeholder="Filter by dates..."
                        bind:timezone={sessionInsights.timezone}
                    />
                    <UserFilter bind:userId={sessionInsights.searchQuery.userId} />
                    <ChatAppsFilter bind:chatAppId={sessionInsights.searchQuery.chatAppId} />
                    {#if siteAdmin.siteFeatures?.entity?.enabled}
                        {#if !siteAdmin.siteFeatures?.entity?.attributeName}
                            <div class="text-sm font-medium text-destructive">
                                <span class="font-mono">entity.entityAttributeName</span>
                                is not set in pika-config.ts. Please correct this or turn off this feature.
                            </div>
                        {:else}
                            <EntityFilter bind:sessionAttributes={sessionInsights.searchQuery.customUserData} />
                        {/if}
                    {/if}
                    <UserTypeFilter bind:userType={sessionInsights.searchQuery.userType} />
                    <FlaggedFilter bind:flagged={sessionInsights.searchQuery.flagged} />
                </div>
            </div>
            {#if advancedOpen}
                <div class="p-0 m-0 h-auto bg-border" style="width: 1px;"></div>
                <div class="flex flex-col w-[400px]">
                    <div class="pl-4 pr-1 flex items-center justify-between pt-1 h-10">
                        <div class="text-sm font-medium">Insights Filters</div>
                    </div>
                    <Separator />
                    <div class="p-4 pr-2 flex flex-col gap-4">
                        <HasInsightsFilter bind:insights={sessionInsights.searchQuery.insights} />
                        <InsightsScoresFilter bind:insights={sessionInsights.searchQuery.insights} />
                        <InsightsUserSentimentFilter bind:insights={sessionInsights.searchQuery.insights} />
                        <InsightsSatisfactionLevelFilter bind:insights={sessionInsights.searchQuery.insights} />
                        <InsightsGoalCompletionStatusFilter bind:insights={sessionInsights.searchQuery.insights} />
                        <InsightsAiConfidenceLevelFilter bind:insights={sessionInsights.searchQuery.insights} />
                        <InsightsUserEffortFilter bind:insights={sessionInsights.searchQuery.insights} />
                        <InsightsComplexityLevelFilter bind:insights={sessionInsights.searchQuery.insights} />
                    </div>
                </div>
                <div class="p-0 m-0 h-auto bg-border" style="width: 1px;"></div>
                <div class="flex flex-col w-[400px]">
                    <div class="pl-4 pr-1 flex items-center justify-between pt-1 h-10">
                        <div class="text-sm font-medium">Feedback Filters</div>
                    </div>
                    <Separator />
                    <div class="p-4 pr-2 flex flex-col gap-4">
                        <FeedbackStatusFilter bind:feedbackInStatus={sessionInsights.searchQuery.feedbackInStatus} />
                        <FeedbackSeverityFilter bind:feedbackSeverity={sessionInsights.searchQuery.feedbackSeverity} />
                        <FeedbackTypeFilter bind:feedbackType={sessionInsights.searchQuery.feedbackType} />
                        <FeedbackInternalCommentTypeFilter
                            bind:feedbackInternalCommentType={sessionInsights.searchQuery.feedbackInternalCommentType}
                        />
                        <FeedbackInternalCommentStatusFilter
                            bind:feedbackInternalCommentStatus={
                                sessionInsights.searchQuery.feedbackInternalCommentStatus
                            }
                        />
                        <UserFilter
                            bind:userId={sessionInsights.searchQuery.feedbackUserId}
                            inputPlaceholder="Filter by feedback user..."
                        />
                        <UserFilter
                            bind:userId={sessionInsights.searchQuery.feedbackInternalCommentUserId}
                            inputPlaceholder="Filter by internal comment user..."
                        />
                    </div>
                </div>
            {/if}
        </div>
    </Popover.Content>
</Popover.Root>

{#snippet settingsDropdownMenu()}
    <DropdownMenu.Root>
        <DropdownMenu.Trigger>
            {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="pl-0 pr-0 w-8"
                    ><SlidersVertical style="width: 1.3rem; height: 1.2rem;" /></Button
                >
            {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
            <DropdownMenu.Item
                onclick={() => {
                    showSavedSearches = true;
                }}
            >
                View Saved Searches
            </DropdownMenu.Item>
            <DropdownMenu.Item
                onclick={() => {
                    showSaveCurrentSearch = true;
                }}
            >
                Save Current Search
            </DropdownMenu.Item>
        </DropdownMenu.Content>
    </DropdownMenu.Root>
{/snippet}

<ViewSavedSearches bind:open={showSavedSearches} />
<SaveSavedSearch bind:open={showSaveCurrentSearch} />
