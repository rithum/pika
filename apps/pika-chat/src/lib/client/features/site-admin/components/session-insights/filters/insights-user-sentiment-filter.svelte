<script lang="ts">
    import { ChevronsUpDown, X } from '$icons/lucide';
    import List from '$ui/pika/list/list.svelte';
    import { Button } from '$ui/shadcn/button';
    import { Label } from '$ui/shadcn/label';
    import * as Popover from '$ui/shadcn/popover';
    import {
        SESSION_INSIGHT_USER_SENTIMENT_VALUES,
        type NameValueDescTriple,
        type InsightsSearchParams,
        type SessionInsightUserSentiment,
    } from '@pika/shared/types/chatbot/chatbot-types';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';

    interface Props {
        insights: InsightsSearchParams | undefined;
    }

    let { insights = $bindable() }: Props = $props();
    let open = $state(false);
    let displayValue = $derived.by(() => {
        if (!insights?.userSentiment || insights.userSentiment.length === 0) {
            return '';
        } else {
            return insights.userSentiment.reduce((acc, status) => {
                const val = SESSION_INSIGHT_USER_SENTIMENT_VALUES.find((s) => s.value === status);
                if (acc.length > 0) {
                    acc += ', ';
                }
                if (val) {
                    acc += val.name;
                } else {
                    acc += status;
                }
                return acc;
            }, '');
        }
    });
    let valueForList = $derived.by(() => {
        if (!insights?.userSentiment || insights.userSentiment.length === 0) {
            return undefined;
        } else {
            return insights.userSentiment.map((status) => {
                const val = SESSION_INSIGHT_USER_SENTIMENT_VALUES.find((s) => s.value === status);
                if (val) {
                    return val;
                } else {
                    return { value: status, name: status } as NameValueDescTriple<SessionInsightUserSentiment>;
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
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by user sentiment</PopupHelp>
        <SimpleDropdown
            bind:value={
                () => valueForList,
                (val) => {
                    if (val === undefined || val.length === 0) {
                        if (insights) {
                            insights = undefined;
                        }
                    } else if (!insights) {
                        insights = { hasInsights: true, userSentiment: getValues(val) };
                    } else {
                        if (!insights.hasInsights) {
                            insights.hasInsights = true;
                        }
                        insights.userSentiment = getValues(val);
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
            options={SESSION_INSIGHT_USER_SENTIMENT_VALUES}
            dontShowSearchInput={true}
            allowClear={true}
            inputPlaceholder="Filter by user sentiment..."
        />
        <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-muted-foreground "
            onclick={() => {
                if (insights) {
                    insights.userSentiment = undefined;
                }
            }}
        >
            <X />
        </Button>
    </div>
</div>
