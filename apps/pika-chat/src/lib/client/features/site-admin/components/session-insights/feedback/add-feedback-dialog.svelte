<script lang="ts">
    import { File, Loader, X } from '$icons/lucide';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';
    import { Button } from '$ui/shadcn/button';
    import * as Dialog from '$ui/shadcn/dialog';
    import { Textarea } from '$ui/shadcn/textarea';
    import type {
        Attachment,
        ChatSessionFeedbackForCreate,
        SessionFeedbackSeverity,
        SessionFeedbackStatus,
        SessionFeedbackType,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import {
        SESSION_FEEDBACK_SEVERITY_VALUES,
        SESSION_FEEDBACK_STATUS_VALUES,
        SESSION_FEEDBACK_TYPE_VALUES,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import { toast } from 'svelte-sonner';
    import { v7 as uuidv7 } from 'uuid';

    interface Props {
        open: boolean;
    }
    let { open = $bindable() }: Props = $props();

    const appState = getContext<AppState>('appState');
    const sessionInsights = appState.siteAdmin.sessionInsights;
    const currentSession = $derived(sessionInsights.currentSession);

    const nameValueMapping = {
        value: (item: any) => (typeof item === 'string' ? item : item.value),
        label: (item: any) => (typeof item === 'string' ? item : (item.name ?? item.value)),
    };
    const nameValueDescMapping = {
        value: (item: any) => (typeof item === 'string' ? item : item.value),
        label: (item: any) => (typeof item === 'string' ? item : (item.name ?? item.value)),
        secondaryLabel: (item: any) => (typeof item === 'string' ? item : (item.desc ?? item.value)),
    };

    let status: SessionFeedbackStatus = $state('open');
    let severity: SessionFeedbackSeverity = $state('low');
    let type: SessionFeedbackType = $state('other');
    let userComment: string = $state('');
    let messageId: string | undefined = $state(undefined);
    let reportedByHuman = $state(true);
    let createdByCustomer = $state(false);
    let attachments: Attachment[] = $state([]);
    let newUploadsS3Keys: string[] = $state([]);
    let removedNewS3Keys: string[] = $state([]);
    let savedOnClose = $state(false);
    let fileInput: HTMLInputElement | undefined = $state();

    const selectedStatusItem = $derived.by(() => SESSION_FEEDBACK_STATUS_VALUES.find((s) => s.value === status));
    const selectedSeverityItem = $derived.by(() => SESSION_FEEDBACK_SEVERITY_VALUES.find((s) => s.value === severity));
    const selectedTypeItem = $derived.by(() => SESSION_FEEDBACK_TYPE_VALUES.find((s) => s.value === type));

    $effect(() => {
        if (open) {
            status = 'open';
            severity = 'medium';
            type = 'other';
            userComment = '';
            messageId = undefined;
            reportedByHuman = true;
            createdByCustomer = false;
            attachments = [];
            newUploadsS3Keys = [];
            removedNewS3Keys = [];
            savedOnClose = false;
        }
    });

    async function submit() {
        if (!currentSession) return;
        const payload: ChatSessionFeedbackForCreate = {
            sessionId: currentSession.sessionId,
            feedbackId: uuidv7(),
            userId: currentSession.userId,
            messageId: messageId,
            reportedByHuman: reportedByHuman,
            createdByCustomer: createdByCustomer,
            status: status,
            severity: severity,
            type: type,
            userComment: userComment,
            attachments: attachments,
        };
        const created = await sessionInsights.addChatSessionFeedback(payload);
        if (created) {
            // Delete any newly uploaded files the user removed before saving
            for (const key of removedNewS3Keys) {
                try {
                    await sessionInsights.deleteFeedbackAttachmentByS3Key(key);
                } catch (e) {
                    // ignore
                }
            }
        }
        savedOnClose = true;
        open = false;
    }

    function openFileDialog() {
        fileInput?.click();
    }

    async function handleFileSelect() {
        if (!fileInput || !fileInput.files?.length) return;
        const files = Array.from(fileInput.files);
        await addFiles(files);
        fileInput.value = '';
    }

    async function addFiles(files: File[]) {
        for (const f of files) {
            try {
                const att = await sessionInsights.uploadFeedbackAttachment(f);
                attachments.push(att);
                const s3Key = sessionInsights.getS3KeyFromUrl(att.s3Url);
                newUploadsS3Keys.push(s3Key);
            } catch (e) {
                toast.error('Failed to upload attachment');
            }
        }
    }

    async function removeAttachment(att: Attachment) {
        const s3Key = sessionInsights.getS3KeyFromUrl(att.s3Url);
        attachments = attachments.filter((a) => a.s3Url !== att.s3Url);
        if (newUploadsS3Keys.includes(s3Key)) {
            removedNewS3Keys.push(s3Key);
            newUploadsS3Keys = newUploadsS3Keys.filter((k) => k !== s3Key);
        }
    }

    function openAttachment(att: { s3Url: string; name: string; mimeType: string }) {
        if (att.mimeType?.startsWith('image/')) {
            sessionInsights.loadLightboxImageAndShowLightbox(att.s3Url, att.name, URL);
        } else {
            sessionInsights.downloadAttachment(att.s3Url);
        }
    }

    function onCloseCleanupEphemeral() {
        // best-effort cleanup
        const keys = [...newUploadsS3Keys];
        newUploadsS3Keys = [];
        Promise.all(keys.map((k) => sessionInsights.deleteFeedbackAttachmentByS3Key(k).catch(() => undefined)));
    }

    function handlePaste(e: ClipboardEvent) {
        const dt = e.clipboardData;
        if (!dt) return;
        const files: File[] = [];
        for (const item of Array.from(dt.items)) {
            if (item.kind === 'file') {
                const f = item.getAsFile();
                if (f && f.type.startsWith('image/')) files.push(f);
            }
        }
        if (files.length > 0) {
            e.preventDefault();
            addFiles(files);
        }
    }
</script>

<Dialog.Root
    bind:open
    onOpenChange={(v: boolean) => {
        if (!v) {
            if (!savedOnClose) onCloseCleanupEphemeral();
            savedOnClose = false;
        }
    }}
>
    <Dialog.Content onpaste={handlePaste}>
        <Dialog.Header>
            <Dialog.Title>Add Feedback</Dialog.Title>
        </Dialog.Header>
        <div class="space-y-3">
            <div class="grid grid-cols-3 gap-3 items-start">
                <div class="text-sm mt-2">Attachments</div>
                <div class="col-span-2">
                    <div class="flex flex-col gap-2">
                        <div class="flex flex-wrap gap-2">
                            {#each attachments as att}
                                <div class="flex items-center gap-2">
                                    <div class="relative group w-20 h-20 border rounded overflow-hidden bg-muted">
                                        {#if att.mimeType?.startsWith('image/')}
                                            <button
                                                type="button"
                                                class="w-full h-full"
                                                onclick={() => openAttachment(att)}
                                                aria-label={`Open ${att.name}`}
                                            >
                                                <img
                                                    src={`/api/download/${encodeURIComponent(sessionInsights.getS3KeyFromUrl(att.s3Url))}`}
                                                    alt={att.name}
                                                    class="w-full h-full object-cover"
                                                />
                                            </button>
                                        {:else}
                                            <button
                                                type="button"
                                                class="w-full h-full flex items-center justify-center text-xs text-muted-foreground"
                                                onclick={() => sessionInsights.downloadAttachment(att.s3Url)}
                                                title={att.name}
                                            >
                                                <File class="w-5 h-5" />
                                            </button>
                                        {/if}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        class="relative right-[30px] top-[-30px] rounded-full p-0.5"
                                        aria-label="Remove attachment"
                                        disabled={sessionInsights.attachmentOperationInProgress}
                                        onclick={() => removeAttachment(att)}
                                    >
                                        <span class="inline-flex items-center justify-center w-5 h-5 rounded-full">
                                            <X class="w-3 h-3" />
                                        </span>
                                    </Button>
                                </div>
                            {/each}
                        </div>
                        <div class="flex items-center gap-2">
                            <Button
                                variant="outline"
                                disabled={sessionInsights.attachmentOperationInProgress}
                                onclick={openFileDialog}>Add file</Button
                            >
                            {#if sessionInsights.attachmentOperationInProgress}
                                <Loader class="w-4 h-4 animate-spin text-muted-foreground" />
                            {/if}
                        </div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-3 items-center">
                <div class="text-sm">Status</div>
                <div class="col-span-2">
                    <SimpleDropdown
                        bind:value={
                            () => selectedStatusItem,
                            (val: any) => {
                                if (val) status = nameValueMapping.value(val) as SessionFeedbackStatus;
                            }
                        }
                        mapping={nameValueMapping}
                        options={SESSION_FEEDBACK_STATUS_VALUES}
                        dontShowSearchInput={true}
                        wrapperClasses="w-full"
                    />
                </div>
            </div>

            <div class="grid grid-cols-3 gap-3 items-center">
                <div class="text-sm">Severity</div>
                <div class="col-span-2">
                    <SimpleDropdown
                        bind:value={
                            () => selectedSeverityItem,
                            (val: any) => {
                                if (val) severity = nameValueMapping.value(val) as SessionFeedbackSeverity;
                            }
                        }
                        mapping={nameValueMapping}
                        options={SESSION_FEEDBACK_SEVERITY_VALUES}
                        dontShowSearchInput={true}
                        wrapperClasses="w-full"
                    />
                </div>
            </div>

            <div class="grid grid-cols-3 gap-3 items-center">
                <div class="text-sm">Type</div>
                <div class="col-span-2">
                    <SimpleDropdown
                        bind:value={
                            () => selectedTypeItem,
                            (val: any) => {
                                if (val) type = nameValueMapping.value(val) as SessionFeedbackType;
                            }
                        }
                        mapping={nameValueDescMapping}
                        options={SESSION_FEEDBACK_TYPE_VALUES}
                        dontShowSearchInput={true}
                        wrapperClasses="w-full"
                    />
                </div>
            </div>

            <div class="grid grid-cols-3 gap-3 items-start">
                <div class="text-sm mt-2">User Comment</div>
                <div class="col-span-2">
                    <Textarea
                        rows={4}
                        bind:value={userComment}
                        maxlength={1000}
                        class="max-h-[200px]"
                        placeholder="Optional user-facing comment (<= 1000 chars)"
                    />
                </div>
            </div>
        </div>

        <Dialog.Footer class="items-center">
            {#if sessionInsights.savingFeedback || sessionInsights.attachmentOperationInProgress}
                <Loader class="mr-2 w-4 h-4 animate-spin text-muted-foreground" />
            {/if}
            <Button
                variant="outline"
                disabled={sessionInsights.savingFeedback || sessionInsights.attachmentOperationInProgress}
                onclick={() => (open = false)}>Cancel</Button
            >
            <Button
                onclick={submit}
                disabled={sessionInsights.savingFeedback || sessionInsights.attachmentOperationInProgress}>Save</Button
            >
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<!-- Hidden file input -->
<input type="file" bind:this={fileInput} multiple style="display:none" onchange={handleFileSelect} />
