<script lang="ts">
    import { X } from '$icons/lucide';
    import { Button } from '$ui/shadcn/button';
    import {
        SESSION_INSIGHT_METRICS_USER_EFFORT_REQUIRED_VALUES,
        type InsightsSearchParams,
        type NameValueDescTriple,
        type SessionInsightMetricsUserEffortRequired,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';

    interface Props {
        insights: InsightsSearchParams | undefined;
    }

    let { insights = $bindable() }: Props = $props();

    let valueForList = $derived.by(() => {
        if (!insights?.userEffortRequired || insights.userEffortRequired.length === 0) {
            return undefined;
        } else {
            return insights.userEffortRequired.map((status) => {
                const val = SESSION_INSIGHT_METRICS_USER_EFFORT_REQUIRED_VALUES.find((s) => s.value === status);
                if (val) {
                    return val;
                } else {
                    return {
                        value: status,
                        name: status,
                    } as NameValueDescTriple<SessionInsightMetricsUserEffortRequired>;
                }
            });
        }
    });

    function getValues<T>(items: NameValueDescTriple<T>[]): T[] {
        return items.map((item) => item.value);
    }
</script>

<div class="flex flex-col gap-1">
    <div class="flex items-center gap-2 w-full">
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by user effort required</PopupHelp>
        <SimpleDropdown
            bind:value={
                () => valueForList,
                (val) => {
                    if (val === undefined || val.length === 0) {
                        if (insights) {
                            insights = undefined;
                        }
                    } else if (!insights) {
                        insights = { hasInsights: true, userEffortRequired: getValues(val) };
                    } else {
                        if (!insights.hasInsights) {
                            insights.hasInsights = true;
                        }
                        insights.userEffortRequired = getValues(val);
                    }
                }
            }
            multiSelect={true}
            wrapperClasses="w-full flex-1"
            popupWidthClasses="w-[330px]"
            mapping={{
                value: (item) => (typeof item === 'string' ? item : item.value),
                label: (item) => (typeof item === 'string' ? item : (item.name ?? item.value)),
                secondaryLabel: (item) => (typeof item === 'string' ? item : (item.desc ?? item.value)),
            }}
            options={SESSION_INSIGHT_METRICS_USER_EFFORT_REQUIRED_VALUES}
            dontShowSearchInput={true}
            allowClear={true}
            inputPlaceholder="Filter by user effort required..."
        />
        <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-muted-foreground "
            onclick={() => {
                if (insights) {
                    insights.userEffortRequired = undefined;
                }
            }}
        >
            <X />
        </Button>
    </div>
</div>
