<script lang="ts">
    import Loader from '$icons/lucide/loader';
    import ThumbsDown from '$icons/lucide/thumbs-down';
    import ThumbsUp from '$icons/lucide/thumbs-up';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import {
        SESSION_FEEDBACK_TYPE_VALUES,
        type ChatMessage,
        type ChatSessionFeedbackForCreate,
        type SessionFeedbackType,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import SimpleDropdown from 'pika-ux/pika/simple-dropdown/simple-dropdown.svelte';
    import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import { Textarea } from 'pika-ux/shadcn/textarea';
    import { getContext } from 'svelte';
    import { toast } from 'svelte-sonner';
    import { v7 as uuidv7 } from 'uuid';
    import { ChatAppState } from '../chat-app.state.svelte';

    interface Props {
        open: boolean;
        chatMessageForFeedback: ChatMessage;
    }

    let { open = $bindable(), chatMessageForFeedback }: Props = $props();
    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');
    let type = $state<SessionFeedbackType | undefined>();
    let userComment = $state<string | undefined>();
    let isValid = $derived(!!type);

    function reset() {
        type = undefined;
        userComment = undefined;
    }

    const nameValueMapping = {
        value: (item: any) => (typeof item === 'string' ? item : item.value),
        label: (item: any) => (typeof item === 'string' ? item : (item.name ?? item.value)),
    };

    const nameValueDescMapping = {
        value: (item: any) => (typeof item === 'string' ? item : item.value),
        label: (item: any) => (typeof item === 'string' ? item : (item.name ?? item.value)),
        secondaryLabel: (item: any) => (typeof item === 'string' ? item : (item.desc ?? item.value)),
    };

    const maxChars = 1000;
    let charsUsed = $derived(userComment?.length ?? 0);

    async function addFeedback() {
        if (!type) {
            toast.error('Please select a feedback type');
            return;
        }

        const sessionFeedback: ChatSessionFeedbackForCreate = {
            feedbackId: uuidv7(),
            sessionId: chat.currentSession.sessionId,
            type,
            userComment: userComment,
            reportedByHuman: true,
            createdByCustomer: chatMessageForFeedback.userId === appState.identity.user.userId,
            status: 'open',
            severity: 'medium',
            userId: appState.identity.user.userId,
            messageId: chatMessageForFeedback.messageId,
        };

        await chat.addFeedback(sessionFeedback);

        toast.success('Feedback added. Thanks!', {
            duration: 1000,
            position: 'top-right',
        });
    }
</script>

<Dialog.Root
    bind:open
    onOpenChange={(open) => {
        if (!open) {
            reset();
        }
    }}
>
    <Dialog.Content class="max-w-[500px] max-h-[80vh] overflow-hidden flex flex-col">
        <Dialog.Header>
            <Dialog.Title>Feedback</Dialog.Title>
            <Dialog.Description>Please provide feedback on the response you received.</Dialog.Description>
        </Dialog.Header>
        <div class="pt-3 max-w-[500px]">
            <!-- This is your custom UI component that will be rendered here -->
            {#if appState.identity.isInternalUser || appState.identity.isContentAdmin || appState.identity.isSiteAdmin}
                <SimpleDropdown
                    bind:value={
                        () => type,
                        (val: any) => {
                            if (val) type = nameValueMapping.value(val) as SessionFeedbackType;
                        }
                    }
                    mapping={nameValueDescMapping}
                    options={SESSION_FEEDBACK_TYPE_VALUES}
                    dontShowSearchInput={true}
                    wrapperClasses="w-full"
                    inputPlaceholder="Select feedback type"
                />
            {:else}
                <div class="flex gap-2">
                    <TooltipPlus tooltip="Good response">
                        <Button
                            variant="outline"
                            class={type === 'user_thumbs_up'
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                                : ''}
                            onclick={() => {
                                if (type === 'user_thumbs_up') {
                                    type = undefined;
                                } else {
                                    type = 'user_thumbs_up';
                                }
                            }}><ThumbsUp class="h-8 w-8" /></Button
                        >
                    </TooltipPlus>
                    <TooltipPlus tooltip="Bad response">
                        <Button
                            variant="outline"
                            class={type === 'user_thumbs_down'
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                                : ''}
                            onclick={() => {
                                if (type === 'user_thumbs_down') {
                                    type = undefined;
                                } else {
                                    type = 'user_thumbs_down';
                                }
                            }}><ThumbsDown class="h-8 w-8" /></Button
                        >
                    </TooltipPlus>
                </div>
            {/if}
            <Textarea bind:value={userComment} placeholder="Enter your feedback" class="mt-4 w-full h-50"></Textarea>
            <div class="text-sm mt-1 flex flex-col gap-1">
                <span class="text-muted-foreground {charsUsed >= maxChars ? 'text-destructive' : ''}"
                    >Chars used: {charsUsed} / {maxChars}</span
                >
                {#if charsUsed >= maxChars}
                    <span class="text-destructive">Max allowed is {maxChars} characters</span>
                {/if}
            </div>
        </div>
        <div class="flex justify-end gap-2 flex-1 items-center">
            {#if chat.addingFeedback}
                <Loader class="h-4 w-4 animate-spin" />
            {/if}
            <Button
                disabled={chat.addingFeedback || !isValid}
                onclick={async () => {
                    try {
                        await addFeedback();
                        chat.feedbackDialogOpen = false;
                    } catch (error) {
                        toast.error('Error adding feedback');
                    }
                }}>Add Feedback</Button
            >
            <Button
                disabled={chat.addingFeedback}
                variant="outline"
                onclick={() => {
                    chat.feedbackDialogOpen = false;
                }}
            >
                Cancel
            </Button>
        </div>
    </Dialog.Content>
</Dialog.Root>
