<script lang="ts">
    import CircleDot from '$icons/lucide/circle-dot';
    import Expand from '$icons/lucide/expand';
    import File from '$icons/lucide/file';
    import Loader from '$icons/lucide/loader';
    import MessageCircle from '$icons/lucide/message-circle';
    import MessageSquareText from '$icons/lucide/message-square-text';
    import Pencil from '$icons/lucide/pencil';
    import Plus from '$icons/lucide/plus';
    import Tag from '$icons/lucide/tag';
    import TriangleAlert from '$icons/lucide/triangle-alert';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { ChatSessionFeedback, ChatSessionFeedbackForUpdate } from 'pika-shared/types/chatbot/chatbot-types';
    import {
        FEEDBACK_INTERNAL_COMMENT_STATUS_VALUES,
        FEEDBACK_INTERNAL_COMMENT_TYPE_VALUES,
        SESSION_FEEDBACK_SEVERITY_VALUES,
        SESSION_FEEDBACK_STATUS_VALUES,
        SESSION_FEEDBACK_TYPE_VALUES,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import ConfirmDialog from 'pika-ux/pika/confirm-dialog/confirm-dialog.svelte';
    import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';
    import { Badge } from 'pika-ux/shadcn/badge';
    import { Button } from 'pika-ux/shadcn/button';
    import { Card } from 'pika-ux/shadcn/card';
    import * as DropdownMenu from 'pika-ux/shadcn/dropdown-menu';
    import { ScrollArea } from 'pika-ux/shadcn/scroll-area';
    import { Separator } from 'pika-ux/shadcn/separator';
    import { getContext } from 'svelte';
    import AddFeedbackDialog from './add-feedback-dialog.svelte';
    import AddInternalCommentDialog from './add-internal-comment-dialog.svelte';
    import EditFeedbackDialog from './edit-feedback-dialog.svelte';
    import EditInternalCommentDialog from './edit-internal-comment-dialog.svelte';
    import LightboxDialog from './lightbox-dialog.svelte';

    const appState = getContext<AppState>('appState');
    const sessionInsights = appState.siteAdmin.sessionInsights;
    const currentSession = $derived(sessionInsights.currentSession);
    const feedback = $derived(
        currentSession && sessionInsights.curSessionFeedback ? sessionInsights.curSessionFeedback : []
    );
    const feedbackSortedDesc = $derived.by(() => {
        const arr = Array.isArray(feedback) ? [...feedback] : [];
        arr.sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime());
        return arr;
    });

    // Dialog state and forms
    let showAddFeedbackDialog = $state(false);
    let showEditFeedbackDialog = $state(false);
    let showAddCommentDialog = $state(false);
    let showEditCommentDialog = $state(false);
    let feedbackBeingEdited: ChatSessionFeedback | undefined = $state(undefined);
    let showConfirmDeleteDialog = $state(false);
    let feedbackPendingDelete: ChatSessionFeedback | undefined = $state(undefined);
    let commentIdPendingDelete: string | undefined = $state(undefined);
    let deletingCommentId: string | undefined = $state(undefined);

    function openAddFeedbackDialog() {
        showAddFeedbackDialog = true;
    }

    function openEditFeedbackDialog(item: ChatSessionFeedback) {
        feedbackBeingEdited = item;
        showEditFeedbackDialog = true;
    }

    function openAddCommentDialog(item: ChatSessionFeedback) {
        feedbackBeingEdited = item;
        showAddCommentDialog = true;
    }

    function openEditCommentDialog(item: ChatSessionFeedback, commentId: string) {
        feedbackBeingEdited = item;
        showEditCommentDialog = true;
        commentIdBeingEdited = commentId;
    }

    let commentIdBeingEdited: string | undefined = $state(undefined);

    async function deleteInternalComment(item: ChatSessionFeedback, commentId: string) {
        const updated = { ...(item as any) } as ChatSessionFeedback;
        const remaining = (updated.internalComments ?? []).filter((c) => c.commentId !== commentId);
        const payload: ChatSessionFeedbackForUpdate = {
            feedbackId: updated.feedbackId,
            sessionId: updated.sessionId,
            status: updated.status,
            severity: updated.severity,
            type: updated.type,
            internalComments: remaining,
        } as ChatSessionFeedbackForUpdate;
        await sessionInsights.updateChatSessionFeedback(payload);
    }

    function requestDeleteInternalComment(item: ChatSessionFeedback, commentId: string) {
        feedbackPendingDelete = item;
        commentIdPendingDelete = commentId;
        showConfirmDeleteDialog = true;
    }

    async function confirmDeleteYes() {
        if (!feedbackPendingDelete || !commentIdPendingDelete) {
            showConfirmDeleteDialog = false;
            return;
        }
        deletingCommentId = commentIdPendingDelete;
        showConfirmDeleteDialog = false;
        try {
            await deleteInternalComment(feedbackPendingDelete, commentIdPendingDelete);
        } finally {
            deletingCommentId = undefined;
            feedbackPendingDelete = undefined;
            commentIdPendingDelete = undefined;
        }
    }

    function getName<T extends { name: string; value: string }>(arr: T[], value: string | undefined): string {
        if (!value) return '';
        const found = arr.find((x) => x.value === value);
        return found?.name ?? value;
    }

    function getDesc<T extends { desc?: string; value: string }>(
        arr: T[],
        value: string | undefined
    ): string | undefined {
        if (!value) return undefined;
        return arr.find((x) => x.value === value)?.desc;
    }

    function openAttachment(att: { s3Url: string; name: string; mimeType: string }) {
        if (att.mimeType?.startsWith('image/')) {
            sessionInsights.loadLightboxImageAndShowLightbox(att.s3Url, att.name, URL);
        } else {
            sessionInsights.downloadAttachment(att.s3Url);
        }
    }
</script>

<ScrollArea class="h-full">
    <div class="p-6">
        {#if !currentSession}
            <div class="flex flex-col items-center justify-center h-full text-center p-8">
                <MessageCircle class="w-12 h-12 text-muted-foreground mb-4" />
                <h3 class="text-lg font-medium mb-2">No session selected</h3>
                <p class="text-sm text-muted-foreground max-w-sm">Select a session to view feedback.</p>
            </div>
        {:else}
            <div class="space-y-4">
                <div class="flex items-center gap-2">
                    <MessageCircle class="w-5 h-5" />
                    <h2 class="text-lg font-semibold">Session Feedback</h2>
                    <div class="ml-auto">
                        <Button size="sm" onclick={openAddFeedbackDialog}>
                            <Plus class="w-4 h-4 mr-1" /> Add Feedback
                        </Button>
                    </div>
                </div>

                {#if sessionInsights.isRetrievingCompleteSession}
                    {@render loader()}
                {:else if feedback.length === 0}
                    <Card class="p-6 text-center">
                        <div class="flex flex-col items-center gap-2">
                            <MessageCircle class="w-6 h-6 text-muted-foreground" />
                            <div class="text-sm text-muted-foreground">No feedback for this session yet.</div>
                            <Button size="sm" variant="outline" onclick={openAddFeedbackDialog}>
                                <Plus class="w-4 h-4 mr-1" /> Add Feedback
                            </Button>
                        </div>
                    </Card>
                {:else}
                    <div class="space-y-3">
                        {#each feedbackSortedDesc as item (item.feedbackId)}
                            <Card class="p-4">
                                <div class="flex items-start gap-3">
                                    <div class="flex flex-col gap-1 flex-1">
                                        <div class="flex justify-between gap-2">
                                            <div class="flex flex-col">
                                                <div class="flex items-center gap-2">
                                                    <TooltipPlus tooltip="Status">
                                                        <Badge variant="outline">
                                                            <CircleDot class="w-3 h-3 mr-1" />
                                                            {getName(SESSION_FEEDBACK_STATUS_VALUES, item.status)}
                                                        </Badge>
                                                    </TooltipPlus>

                                                    <TooltipPlus tooltip="Severity">
                                                        <Badge variant="outline">
                                                            <TriangleAlert class="w-3 h-3 mr-1" />
                                                            {getName(SESSION_FEEDBACK_SEVERITY_VALUES, item.severity)}
                                                        </Badge>
                                                    </TooltipPlus>

                                                    <TooltipPlus
                                                        tooltip={getDesc(SESSION_FEEDBACK_TYPE_VALUES, item.type) ??
                                                            'Type'}
                                                    >
                                                        <Badge variant="outline">
                                                            <Tag class="w-3 h-3 mr-1" />
                                                            {getName(SESSION_FEEDBACK_TYPE_VALUES, item.type)}
                                                        </Badge>
                                                    </TooltipPlus>
                                                </div>
                                                <div class="text-[11px] text-muted-foreground">
                                                    User: {item.userId}
                                                    <span class="mx-1">•</span>
                                                    Source: {item.createdByCustomer ? 'Customer' : 'Internal'}
                                                    <span class="mx-1">•</span>
                                                    Reporter: {item.reportedByHuman ? 'Human' : 'AI'}
                                                    <span class="mx-1">•</span>

                                                    {new Date(item.createdOn).toLocaleString()}
                                                </div>
                                            </div>
                                            <div class="flex self-start">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onclick={() => openAddCommentDialog(item)}
                                                >
                                                    <Plus class="w-3 h-3" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onclick={() => openEditFeedbackDialog(item)}
                                                >
                                                    <Pencil class="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </div>
                                        {#if item.userComment}
                                            <div class="text-sm whitespace-pre-wrap mt-2">{item.userComment}</div>
                                        {/if}
                                        {#if item.messageId}
                                            <div class="text-xs text-muted-foreground">Message: {item.messageId}</div>
                                        {/if}

                                        {#if item.attachments && item.attachments.length > 0}
                                            <div class="mt-2 flex flex-wrap gap-2">
                                                {#each item.attachments as att}
                                                    <button
                                                        type="button"
                                                        class="group relative w-20 h-20 border rounded overflow-hidden bg-muted cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                                                        onclick={() => openAttachment(att)}
                                                        aria-label={`Open ${att.name}`}
                                                    >
                                                        {#if att.mimeType?.startsWith('image/')}
                                                            <img
                                                                src={`/api/download/${encodeURIComponent(sessionInsights.getS3KeyFromUrl(att.s3Url))}`}
                                                                alt={att.name}
                                                                class="w-full h-full object-cover transition-opacity group-hover:opacity-80"
                                                            />
                                                        {:else}
                                                            <div class="w-full h-full flex items-center justify-center">
                                                                <File class="w-5 h-5 text-muted-foreground" />
                                                            </div>
                                                        {/if}
                                                        <div
                                                            class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 flex items-center justify-center"
                                                        >
                                                            <Expand class="w-4 h-4 text-white" />
                                                        </div>
                                                    </button>
                                                {/each}
                                            </div>
                                        {/if}

                                        {#if item.internalComments && item.internalComments.length > 0}
                                            <Separator class="my-3" />
                                            <div class="space-y-2">
                                                <div class="text-xs font-medium">Internal Comments</div>
                                                {#each item.internalComments ? [...item.internalComments].sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime()) : [] as c (c.commentId)}
                                                    <div class="flex items-start gap-1">
                                                        <DropdownMenu.Root>
                                                            <DropdownMenu.Trigger>
                                                                {#snippet child({ props })}
                                                                    <Button
                                                                        {...props}
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        class="mt-[2px]"
                                                                    >
                                                                        <MessageSquareText
                                                                            class="w-4 h-4 text-muted-foreground"
                                                                        />
                                                                    </Button>
                                                                {/snippet}
                                                            </DropdownMenu.Trigger>
                                                            <DropdownMenu.Content>
                                                                <DropdownMenu.Item
                                                                    onclick={() =>
                                                                        openEditCommentDialog(item, c.commentId)}
                                                                    disabled={sessionInsights.updatingFeedback ||
                                                                        deletingCommentId === c.commentId}
                                                                >
                                                                    Edit
                                                                </DropdownMenu.Item>
                                                                <DropdownMenu.Item
                                                                    onclick={() =>
                                                                        requestDeleteInternalComment(item, c.commentId)}
                                                                    disabled={sessionInsights.updatingFeedback ||
                                                                        deletingCommentId === c.commentId}
                                                                >
                                                                    Delete
                                                                </DropdownMenu.Item>
                                                            </DropdownMenu.Content>
                                                        </DropdownMenu.Root>
                                                        <div class="flex-1 rounded-md border p-2 text-xs">
                                                            <div class="flex items-start gap-2">
                                                                <div class="flex items-center gap-2">
                                                                    <Badge variant="outline">
                                                                        {getName(
                                                                            FEEDBACK_INTERNAL_COMMENT_TYPE_VALUES,
                                                                            c.type
                                                                        )}
                                                                    </Badge>
                                                                    <Badge variant="outline">
                                                                        {getName(
                                                                            FEEDBACK_INTERNAL_COMMENT_STATUS_VALUES,
                                                                            c.status
                                                                        )}
                                                                    </Badge>
                                                                    <div class="mt-1 text-[11px] text-muted-foreground">
                                                                        {c.userId} • {new Date(
                                                                            c.createdOn
                                                                        ).toLocaleString()}
                                                                    </div>
                                                                </div>
                                                                <div class="ml-auto flex items-center">
                                                                    {#if deletingCommentId === c.commentId}
                                                                        <Loader
                                                                            class="w-5 h-5 mr-1 animate-spin text-muted-foreground"
                                                                        />
                                                                    {/if}
                                                                </div>
                                                            </div>
                                                            <div class="mt-1 whitespace-pre-wrap">{c.comment}</div>
                                                            {#if c.attachments && c.attachments.length > 0}
                                                                <div class="mt-2 flex flex-wrap gap-2">
                                                                    {#each c.attachments as catt}
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            class="group relative w-16 h-16 border rounded overflow-hidden bg-muted"
                                                                            onclick={() => openAttachment(catt)}
                                                                            aria-label={`Open ${catt.name}`}
                                                                        >
                                                                            {#if catt.mimeType?.startsWith('image/')}
                                                                                <img
                                                                                    src={`/api/download/${encodeURIComponent(sessionInsights.getS3KeyFromUrl(catt.s3Url))}`}
                                                                                    alt={catt.name}
                                                                                    class="w-full h-full object-cover transition-opacity group-hover:opacity-80"
                                                                                />
                                                                            {:else}
                                                                                <div
                                                                                    class="w-full h-full flex items-center justify-center"
                                                                                >
                                                                                    <File
                                                                                        class="w-4 h-4 text-muted-foreground"
                                                                                    />
                                                                                </div>
                                                                            {/if}
                                                                            <div
                                                                                class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 flex items-center justify-center"
                                                                            >
                                                                                <Expand
                                                                                    class="w-3.5 h-3.5 text-white"
                                                                                />
                                                                            </div>
                                                                        </Button>
                                                                    {/each}
                                                                </div>
                                                            {/if}
                                                        </div>
                                                    </div>
                                                {/each}
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            </Card>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</ScrollArea>

<!-- Add Feedback Dialog -->
{#if showAddFeedbackDialog}
    <AddFeedbackDialog bind:open={showAddFeedbackDialog} />
{/if}

<!-- Edit Feedback Dialog -->
{#if showEditFeedbackDialog && feedbackBeingEdited}
    <EditFeedbackDialog bind:open={showEditFeedbackDialog} feedback={feedbackBeingEdited} />
{/if}

<!-- Add Internal Comment Dialog -->
{#if showAddCommentDialog && feedbackBeingEdited}
    <AddInternalCommentDialog bind:open={showAddCommentDialog} feedback={feedbackBeingEdited} />
{/if}

{#if showEditCommentDialog && feedbackBeingEdited && commentIdBeingEdited}
    <EditInternalCommentDialog
        bind:open={showEditCommentDialog}
        feedback={feedbackBeingEdited}
        commentId={commentIdBeingEdited}
    />
{/if}

<!-- Confirm Delete Dialog -->
{#if showConfirmDeleteDialog}
    <ConfirmDialog
        bind:open={showConfirmDeleteDialog}
        title="Delete internal comment?"
        message="Are you sure you want to delete this internal comment? This action cannot be undone."
        onyes={confirmDeleteYes}
    />
{/if}

<LightboxDialog bind:open={sessionInsights.showImageLightbox} />

{#snippet loader()}
    <div class="flex items-center justify-center">
        <svg class="w-6 h-6 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
        </svg>
    </div>
{/snippet}
