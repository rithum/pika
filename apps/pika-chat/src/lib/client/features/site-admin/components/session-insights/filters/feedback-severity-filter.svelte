<script lang="ts">
    import X from '$icons/lucide/x';
    import {
        SESSION_FEEDBACK_SEVERITY_VALUES,
        type NameValuePair,
        type SessionFeedbackSeverity,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from 'pika-ux/pika/simple-dropdown/simple-dropdown.svelte';
    import { Button } from 'pika-ux/shadcn/button';

    interface Props {
        feedbackSeverity: SessionFeedbackSeverity[] | undefined;
    }

    let { feedbackSeverity = $bindable() }: Props = $props();
    let valueForList = $derived.by(() => {
        if (!feedbackSeverity || feedbackSeverity.length === 0) {
            return undefined;
        } else {
            return feedbackSeverity.map((status) => {
                const val = SESSION_FEEDBACK_SEVERITY_VALUES.find((s) => s.value === status);
                if (val) {
                    return val;
                } else {
                    return { value: status, name: status } as NameValuePair<SessionFeedbackSeverity>;
                }
            });
        }
    });

    function getValues<T>(items: NameValuePair<T>[]): T[] {
        return items.map((item) => item.value);
    }
</script>

<div class="flex flex-col gap-1">
    <div class="flex items-center gap-2 w-full">
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by feedback severity</PopupHelp>
        <SimpleDropdown
            bind:value={
                () => valueForList,
                (val) => {
                    if (val === undefined || val.length === 0) {
                        feedbackSeverity = undefined;
                    } else {
                        feedbackSeverity = getValues(val);
                    }
                }
            }
            multiSelect={true}
            wrapperClasses="flex-1 w-full"
            popupWidthClasses="w-[330px]"
            mapping={{
                value: (item) => (typeof item === 'string' ? item : item.value),
                label: (item) => (typeof item === 'string' ? item : (item.name ?? item.value)),
            }}
            options={SESSION_FEEDBACK_SEVERITY_VALUES}
            dontShowSearchInput={true}
            allowClear={true}
            inputPlaceholder="Filter by feedback severity..."
        />
        <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-muted-foreground "
            onclick={() => (feedbackSeverity = undefined)}
        >
            <X />
        </Button>
    </div>
</div>
