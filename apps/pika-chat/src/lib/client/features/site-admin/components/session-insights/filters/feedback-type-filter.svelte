<script lang="ts">
    import { X } from '$icons/lucide';
    import { Button } from '$ui/shadcn/button';
    import {
        SESSION_FEEDBACK_TYPE_VALUES,
        type NameValueDescTriple,
        type SessionFeedbackType,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';

    interface Props {
        feedbackType: SessionFeedbackType[] | undefined;
    }

    let { feedbackType = $bindable() }: Props = $props();
    let valueForList = $derived.by(() => {
        if (!feedbackType || feedbackType.length === 0) {
            return undefined;
        } else {
            return feedbackType.map((status) => {
                const val = SESSION_FEEDBACK_TYPE_VALUES.find((s) => s.value === status);
                if (val) {
                    return val;
                } else {
                    return { value: status, name: status } as NameValueDescTriple<SessionFeedbackType>;
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
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by feedback type</PopupHelp>
        <SimpleDropdown
            bind:value={
                () => valueForList,
                (val) => {
                    if (val === undefined || val.length === 0) {
                        feedbackType = undefined;
                    } else {
                        feedbackType = getValues(val);
                    }
                }
            }
            multiSelect={true}
            wrapperClasses="flex-1 w-full"
            popupWidthClasses="w-[330px]"
            mapping={{
                value: (item) => (typeof item === 'string' ? item : item.value),
                label: (item) => (typeof item === 'string' ? item : (item.name ?? item.value)),
                secondaryLabel: (item) => (typeof item === 'string' ? item : (item.desc ?? item.value)),
            }}
            options={SESSION_FEEDBACK_TYPE_VALUES}
            dontShowSearchInput={true}
            allowClear={true}
            inputPlaceholder="Filter by feedback type..."
        />
        <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-muted-foreground "
            onclick={() => (feedbackType = undefined)}
        >
            <X />
        </Button>
    </div>
</div>
