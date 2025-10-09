<script lang="ts">
    import X from '$icons/lucide/x';
    import {
        FEEDBACK_INTERNAL_COMMENT_TYPE_VALUES,
        type FeedbackInternalCommentType,
        type NameValueDescTriple,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from 'pika-ux/pika/simple-dropdown/simple-dropdown.svelte';
    import { Button } from 'pika-ux/shadcn/button';

    interface Props {
        feedbackInternalCommentType: FeedbackInternalCommentType[] | undefined;
    }

    let { feedbackInternalCommentType = $bindable() }: Props = $props();
    let valueForList = $derived.by(() => {
        if (!feedbackInternalCommentType || feedbackInternalCommentType.length === 0) {
            return undefined;
        } else {
            return feedbackInternalCommentType.map((status) => {
                const val = FEEDBACK_INTERNAL_COMMENT_TYPE_VALUES.find((s) => s.value === status);
                if (val) {
                    return val;
                } else {
                    return { value: status, name: status } as NameValueDescTriple<FeedbackInternalCommentType>;
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
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by internal comment type</PopupHelp>
        <SimpleDropdown
            bind:value={
                () => valueForList,
                (val) => {
                    if (val === undefined || val.length === 0) {
                        feedbackInternalCommentType = undefined;
                    } else {
                        feedbackInternalCommentType = getValues(val);
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
            options={FEEDBACK_INTERNAL_COMMENT_TYPE_VALUES}
            dontShowSearchInput={true}
            allowClear={true}
            inputPlaceholder="Filter by internal comment type..."
        />
        <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-muted-foreground "
            onclick={() => (feedbackInternalCommentType = undefined)}
        >
            <X />
        </Button>
    </div>
</div>
