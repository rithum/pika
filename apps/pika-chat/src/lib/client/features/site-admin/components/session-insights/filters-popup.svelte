<script lang="ts">
    import { ChevronLeft, ChevronRight, ListFilter, ListRestart, SlidersVertical } from '$icons/lucide';
    import { Button } from '$lib/client-ui/shadcn/button';
    import { Separator } from '$lib/client-ui/shadcn/separator';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import * as Popover from '$ui/shadcn/popover';
    import { getContext } from 'svelte';
    import DatePopup from './date-popup.svelte';
    import ChatAppsFilter from './filters/chatapps-filter.svelte';
    import EntityFilter from './filters/entity-filter.svelte';
    import FeedbackSeverityFilter from './filters/feedback-severity-filter.svelte';
    import FeedbackStatusFilter from './filters/feedback-status-filter.svelte';
    import FlaggedFilter from './filters/flagged-filter.svelte';
    import * as DropdownMenu from '$ui/shadcn/dropdown-menu';
    import UserFilter from './filters/user-filter.svelte';
    import { createDefaultSearchQuery } from './utils';
    import ViewSavedSearches from './saved-search/view-saved-searches.svelte';
    import SaveSavedSearch from './saved-search/save-saved-search.svelte';
    import FeedbackInternalCommentTypeFilter from './filters/feedback-internal-comment-type-filter.svelte';
    import FeedbackTypeFilter from './filters/feedback-type-filter.svelte';
    import FeedbackInternalCommentStatusFilter from './filters/feedback-internal-comment-status-filter.svelte';
    import HasInsightsFilter from './filters/has-insights-filter.svelte';
    import InsightsUserSentimentFilter from './filters/insights-user-sentiment-filter.svelte';
    import InsightsSatisfactionLevelFilter from './filters/insights-satisfaction-level.svelte';
    import InsightsGoalCompletionStatusFilter from './filters/insights-goal-completion-status.svelte';
    import InsightsAiConfidenceLevelFilter from './filters/insights-ai-confidence-level.svelte';
    import InsightsUserEffortFilter from './filters/insights-user-effort.svelte';
    import InsightsComplexityLevelFilter from './filters/insights-complexity-level.svelte';
    import InsightsScoresFilter from './filters/insights-scores.svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const sessionInsights = siteAdmin.sessionInsights;
    let showSavedSearches = $state(false);
    let showSaveCurrentSearch = $state(false);
    let advancedOpen = $state(false);
</script>

<Popover.Root>
    <Popover.Trigger>
        {#snippet child({ props })}
            <Button {...props} variant="outline" size="sm" class="h-8">
                <ListFilter class="w-4 h-4" />
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
                                <ChevronLeft class="w-3 h-4 text-blue-500" />
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
                            <div class="text-sm font-medium text-red-500">
                                <span class="font-mono">entity.entityAttributeName</span>
                                is not set in pika-config.ts. Please correct this or turn off this feature.
                            </div>
                        {:else}
                            <EntityFilter bind:sessionAttributes={sessionInsights.searchQuery.customUserData} />
                        {/if}
                    {/if}
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
