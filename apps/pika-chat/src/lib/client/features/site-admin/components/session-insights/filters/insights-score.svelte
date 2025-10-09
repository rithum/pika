<script lang="ts">
    import X from '$icons/lucide/x';
    import { SCORE_SEARCH_OPERATORS_VALUES, type InsightsSearchParams } from 'pika-shared/types/chatbot/chatbot-types';
    import SimpleDropdown from 'pika-ux/pika/simple-dropdown/simple-dropdown.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import { Input } from 'pika-ux/shadcn/input';
    import { Label } from 'pika-ux/shadcn/label';

    interface Props {
        insights: InsightsSearchParams | undefined;
        field:
            | 'goalAchievementScore'
            | 'userSatisfactionScore'
            | 'aiPerformanceOverallScore'
            | 'aiPerformanceAccuracyScore'
            | 'aiPerformanceEfficiencyScore'
            | 'interactionQualityScore';
    }

    let { insights = $bindable(), field }: Props = $props();
    let open = $state(false);
    let label = $derived.by(() => {
        switch (field) {
            case 'goalAchievementScore':
                return 'Goal Achievement Score';
            case 'userSatisfactionScore':
                return 'User Satisfaction Score';
            case 'aiPerformanceOverallScore':
                return 'AI Performance Overall Score';
            case 'aiPerformanceAccuracyScore':
                return 'AI Performance Accuracy Score';
            case 'aiPerformanceEfficiencyScore':
                return 'AI Performance Efficiency Score';
            case 'interactionQualityScore':
                return 'Interaction Quality Score';
            default:
                return '';
        }
    });
</script>

<div class="flex flex-col gap-1">
    <Label for="score-filter-label" class="text-sm font-medium text-muted-foreground">Filter by {label}</Label>
    <div class="flex items-center gap-2 w-full">
        <SimpleDropdown
            bind:value={
                () => {
                    if (insights && insights[field] !== undefined) {
                        return SCORE_SEARCH_OPERATORS_VALUES.find((v) => v.value === insights?.[field]?.operator);
                    } else {
                        return undefined;
                    }
                },
                (val) => {
                    if (val === undefined) {
                        if (insights && insights[field] !== undefined) {
                            insights[field] = undefined;
                        }
                    } else if (insights && insights[field] !== undefined) {
                        insights[field].operator = val?.value ?? undefined;
                    }
                }
            }
            wrapperClasses="w-full flex-1"
            popupWidthClasses="w-[420px]"
            mapping={{
                value: (item) => (typeof item === 'string' ? item : item.value),
                label: (item) => (typeof item === 'string' ? item : (item.name ?? item.value)),
            }}
            options={SCORE_SEARCH_OPERATORS_VALUES}
            dontShowSearchInput={true}
            inputPlaceholder="Operator"
            disabled={insights?.[field] === undefined}
        />
        <Input
            id="score-filter-label"
            type="number"
            bind:value={
                () => {
                    return insights?.[field]?.score ?? undefined;
                },
                (val) => {
                    if (val === undefined) {
                        if (insights) {
                            insights[field] = undefined;
                        }
                    } else if (!insights) {
                        insights = { hasInsights: true, [field]: { score: val, operator: 'eq' } };
                    } else {
                        if (!insights.hasInsights) {
                            insights.hasInsights = true;
                        }
                        if (!insights[field]) {
                            insights[field] = { score: val, operator: 'eq' };
                        } else {
                            insights[field].score = val;
                        }
                    }
                }
            }
        />

        <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-muted-foreground "
            onclick={() => {
                if (insights) {
                    insights[field] = undefined;
                }
            }}
        >
            <X />
        </Button>
    </div>
</div>
