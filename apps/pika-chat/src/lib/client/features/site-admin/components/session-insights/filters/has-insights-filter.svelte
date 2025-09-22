<script lang="ts">
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';
    import type { InsightsSearchParams, NameValuePair } from 'pika-shared/types/chatbot/chatbot-types';

    interface Props {
        insights: InsightsSearchParams | undefined;
    }

    let { insights = $bindable() }: Props = $props();

    const values: NameValuePair<boolean>[] = [
        { value: true, name: 'Has Insights' },
        { value: false, name: "Doesn't Have Insights" },
    ];
</script>

<div class="flex flex-col gap-1 mr-4 pr-2">
    <div class="flex items-center gap-2 w-full">
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by has insights</PopupHelp>
        <SimpleDropdown
            bind:value={
                () => {
                    return values.find((v) => v.value === insights?.hasInsights);
                },
                (val) => {
                    if (val === undefined) {
                        if (insights) {
                            insights = undefined;
                        }
                    } else if (!insights) {
                        insights = { hasInsights: val.value };
                    } else {
                        if (insights.hasInsights !== val.value) {
                            insights.hasInsights = val.value;
                        }
                    }
                }
            }
            wrapperClasses="w-full flex-1"
            popupWidthClasses="w-[330px]"
            mapping={{
                value: (item) => (item.value === undefined ? '' : item.value.toString()),
                label: (item) => item.name,
            }}
            options={values}
            dontShowSearchInput={true}
            allowClear={true}
            inputPlaceholder="Filter by has insights..."
        />
    </div>
</div>
