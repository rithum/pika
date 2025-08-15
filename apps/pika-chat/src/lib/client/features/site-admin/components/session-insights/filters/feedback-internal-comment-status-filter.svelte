<script lang="ts">
    import { X } from '$icons/lucide';
    import { Button } from '$ui/shadcn/button';
    import {
        FEEDBACK_INTERNAL_COMMENT_STATUS_VALUES,
        type NameValueDescTriple,
        type FeedbackInternalCommentStatus,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';

    interface Props {
        feedbackInternalCommentStatus: FeedbackInternalCommentStatus[] | undefined;
    }

    let { feedbackInternalCommentStatus = $bindable() }: Props = $props();
    let valueForList = $derived.by(() => {
        if (!feedbackInternalCommentStatus || feedbackInternalCommentStatus.length === 0) {
            return undefined;
        } else {
            return feedbackInternalCommentStatus.map((status) => {
                const val = FEEDBACK_INTERNAL_COMMENT_STATUS_VALUES.find((s) => s.value === status);
                if (val) {
                    return val;
                } else {
                    return { value: status, name: status } as NameValueDescTriple<FeedbackInternalCommentStatus>;
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
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by internal comment status</PopupHelp>
        <SimpleDropdown
            bind:value={
                () => valueForList,
                (val) => {
                    if (val === undefined || val.length === 0) {
                        feedbackInternalCommentStatus = undefined;
                    } else {
                        feedbackInternalCommentStatus = getValues(val);
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
            options={FEEDBACK_INTERNAL_COMMENT_STATUS_VALUES}
            dontShowSearchInput={true}
            allowClear={true}
            inputPlaceholder="Filter by internal comment status..."
        />
        <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-muted-foreground "
            onclick={() => (feedbackInternalCommentStatus = undefined)}
        >
            <X />
        </Button>
    </div>
</div>
