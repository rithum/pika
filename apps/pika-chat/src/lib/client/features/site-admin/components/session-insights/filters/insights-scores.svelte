<script lang="ts">
    import ChevronsUpDown from '$icons/lucide/chevrons-up-down';
    import X from '$icons/lucide/x';
    import { type InsightsSearchParams } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import * as Popover from 'pika-ux/shadcn/popover';
    import InsightsScoreFilter from './insights-score.svelte';

    interface Props {
        insights: InsightsSearchParams | undefined;
    }

    let { insights = $bindable() }: Props = $props();
    let countScoresAdded = $derived.by(() => {
        let count = 0;
        if (insights?.goalAchievementScore !== undefined) {
            count++;
        }
        if (insights?.userSatisfactionScore !== undefined) {
            count++;
        }
        if (insights?.aiPerformanceOverallScore !== undefined) {
            count++;
        }
        if (insights?.aiPerformanceAccuracyScore !== undefined) {
            count++;
        }
        if (insights?.aiPerformanceEfficiencyScore !== undefined) {
            count++;
        }
        if (insights?.interactionQualityScore !== undefined) {
            count++;
        }
        return count;
    });
    let open = $state(false);
</script>

<div class="flex flex-col gap-1">
    <div class="flex items-center gap-2 w-full">
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by scores</PopupHelp>
        <Popover.Root bind:open>
            <Popover.Trigger id="feedback-type-filter-label">
                {#snippet child({ props })}
                    <Button
                        {...props}
                        variant="outline"
                        size="sm"
                        class="flex flex-1 truncate items-center justify-between h-9"
                    >
                        <span
                            class="flex-1 min-w-0 truncate flex items-center {countScoresAdded > 0
                                ? ''
                                : 'text-muted-foreground'}"
                        >
                            {#if countScoresAdded === 0}
                                Filter by Scores...
                            {:else}
                                Filtering by {countScoresAdded} scores...
                            {/if}
                        </span>
                        <ChevronsUpDown class="shrink-0 opacity-50" />
                    </Button>
                {/snippet}
            </Popover.Trigger>
            <Popover.Content class="p-0 w-[420px]">
                <div class="flex flex-col gap-4 w-full mr-4 p-4">
                    <InsightsScoreFilter {insights} field="goalAchievementScore" />
                    <InsightsScoreFilter {insights} field="userSatisfactionScore" />
                    <InsightsScoreFilter {insights} field="aiPerformanceOverallScore" />
                    <InsightsScoreFilter {insights} field="aiPerformanceAccuracyScore" />
                    <InsightsScoreFilter {insights} field="aiPerformanceEfficiencyScore" />
                    <InsightsScoreFilter {insights} field="interactionQualityScore" />
                </div>
            </Popover.Content>
        </Popover.Root>
        <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-muted-foreground "
            onclick={() => {
                if (insights) {
                    insights.goalAchievementScore = undefined;
                    insights.userSatisfactionScore = undefined;
                    insights.aiPerformanceOverallScore = undefined;
                    insights.aiPerformanceAccuracyScore = undefined;
                    insights.aiPerformanceEfficiencyScore = undefined;
                    insights.interactionQualityScore = undefined;
                }
            }}
        >
            <X />
        </Button>
    </div>
</div>
