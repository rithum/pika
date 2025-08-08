<script lang="ts">
    import { X } from '$icons/lucide';
    import { Button } from '$ui/shadcn/button';
    import {
        SESSION_FEEDBACK_STATUS_VALUES,
        type NameValuePair,
        type SessionFeedbackStatus,
    } from '@pika/shared/types/chatbot/chatbot-types';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';

    interface Props {
        feedbackInStatus: SessionFeedbackStatus[] | undefined;
    }

    let { feedbackInStatus = $bindable() }: Props = $props();
    let valueForList = $derived.by(() => {
        if (!feedbackInStatus || feedbackInStatus.length === 0) {
            return undefined;
        } else {
            return feedbackInStatus.map((status) => {
                const val = SESSION_FEEDBACK_STATUS_VALUES.find((s) => s.value === status);
                if (val) {
                    return val;
                } else {
                    return { value: status, name: status } as NameValuePair<SessionFeedbackStatus>;
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
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by feedback status</PopupHelp>
        <SimpleDropdown
            bind:value={
                () => valueForList,
                (val) => {
                    if (val === undefined || val.length === 0) {
                        feedbackInStatus = undefined;
                    } else {
                        feedbackInStatus = getValues(val);
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
            options={SESSION_FEEDBACK_STATUS_VALUES}
            dontShowSearchInput={true}
            allowClear={true}
            inputPlaceholder="Filter by feedback status..."
        />
        <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-muted-foreground "
            onclick={() => (feedbackInStatus = undefined)}
        >
            <X />
        </Button>
    </div>
</div>
