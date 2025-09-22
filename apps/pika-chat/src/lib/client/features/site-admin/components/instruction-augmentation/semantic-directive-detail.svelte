<script lang="ts">
    import { Calendar, Loader } from '$icons/lucide';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import ConfirmDialog from '$ui/pika/confirm-dialog/confirm-dialog.svelte';
    import { Button } from '$ui/shadcn/button';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$ui/shadcn/card';
    import { Label } from '$ui/shadcn/label';
    import { formatDistanceToNow } from 'date-fns';
    import MarkdownIt from 'markdown-it';
    import type { SemanticDirective } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import { toast } from 'svelte-sonner';
    import Scope from './scope.svelte';

    interface Props {
        directive: SemanticDirective;
        onDirectiveDeleted?: () => void;
    }

    let { directive, onDirectiveDeleted }: Props = $props();

    const appState = getContext<AppState>('appState');
    const iaState = appState.siteAdmin.instructionAugmentation;

    let showDeleteDialog = $state(false);

    // Initialize markdown-it with the same config as used elsewhere in the app
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        breaks: true,
    });

    // Convert instructions markdown to HTML for display
    const instructionsHtml = $derived(md.render(directive.instructions));
</script>

<div class="space-y-4">
    <!-- Header -->
    <Card>
        <CardHeader class="pb-3">
            <div class="flex items-start justify-between">
                <div class="space-y-1">
                    <CardTitle class="text-lg font-mono">
                        {directive.id}
                    </CardTitle>
                    <CardDescription class="flex items-center gap-2">
                        <Scope scope={directive} />
                    </CardDescription>
                </div>

                <div class="flex items-center gap-1">
                    {#if iaState.isDeletingSemanticDirective}
                        <Loader class="h-4 w-4 animate-spin" />
                    {/if}
                    <Button
                        disabled={iaState.isDeletingSemanticDirective}
                        size="sm"
                        onclick={() => {
                            iaState.directiveDialogMode = 'edit';
                            iaState.showDirectiveDialog = true;
                        }}
                    >
                        Edit
                    </Button>
                    <Button
                        disabled={iaState.isDeletingSemanticDirective}
                        variant="outline"
                        size="sm"
                        onclick={() => (showDeleteDialog = true)}
                    >
                        Delete
                    </Button>
                </div>
            </div>
        </CardHeader>
    </Card>

    <!-- Content -->
    <Card>
        <CardContent class="pt-6">
            <div class="space-y-6">
                <div class="space-y-4">
                    <div>
                        <Label class="text-sm font-medium">Description</Label>
                        <p class="mt-1 text-sm bg-muted/30 p-3 rounded-md">
                            {directive.description}
                        </p>
                    </div>

                    <div>
                        <Label class="text-sm font-medium">Instructions</Label>
                        <div class="mt-1 prose prose-gray max-w-none markdown-content bg-muted/30 p-3 rounded-md">
                            {@html instructionsHtml}
                        </div>
                    </div>
                </div>
            </div>
        </CardContent>
    </Card>

    <!-- Metadata -->
    <Card>
        <CardHeader class="pb-3">
            <CardTitle class="text-base">Metadata</CardTitle>
        </CardHeader>
        <CardContent>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div class="space-y-2">
                    <div>
                        <Label class="text-xs font-medium">Created</Label>
                        <div class="flex items-center gap-2 mt-1">
                            <Calendar class="w-3 h-3" />
                            <span>{formatDistanceToNow(new Date(directive.createDate), { addSuffix: true })}</span>
                        </div>
                        <p class="text-xs text-muted-foreground mt-1">
                            by {directive.createdBy}
                        </p>
                    </div>
                </div>

                <div class="space-y-2">
                    <div>
                        <Label class="text-xs font-medium">Last Updated</Label>
                        <div class="flex items-center gap-2 mt-1">
                            <Calendar class="w-3 h-3" />
                            <span>{formatDistanceToNow(new Date(directive.lastUpdate), { addSuffix: true })}</span>
                        </div>
                        <p class="text-xs text-muted-foreground mt-1">
                            by {directive.lastUpdatedBy}
                        </p>
                    </div>
                </div>
            </div>
        </CardContent>
    </Card>
</div>

{#if showDeleteDialog}
    <ConfirmDialog
        bind:open={showDeleteDialog}
        title="Delete Semantic Directive?"
        message="Are you sure you want to delete this semantic directive? This action cannot be undone."
        onyes={async () => {
            try {
                await iaState.deleteSemanticDirective(directive);
                toast.success('Semantic directive deleted successfully');
            } catch (error) {
                console.error('Failed to delete semantic directive:', error);
                toast.error('Failed to delete semantic directive');
            } finally {
                showDeleteDialog = false;
                if (onDirectiveDeleted) {
                    onDirectiveDeleted();
                }
            }
        }}
    />
{/if}

<style>
    /* Markdown content styles - copied from text-renderer.svelte */
    :global(.markdown-content) {
        word-break: break-word;
    }

    :global(.markdown-content pre) {
        border-radius: 0.375rem; /* rounded */
        padding: 1rem; /* p-4 */
        overflow-x: auto; /* overflow-x-auto */
        background-color: var(--color-gray-800); /* dark background for code blocks */
        color: var(--color-gray-100); /* light text for code blocks */
    }

    :global(.markdown-content pre code) {
        background-color: transparent; /* bg-transparent */
        padding: 0; /* p-0 */
    }

    :global(.markdown-content code) {
        background-color: var(--color-gray-100); /* bg-gray-100 */
        border-radius: 0.25rem; /* rounded */
        padding: 0.125rem 0.25rem; /* py-0.5 px-1 */
        font-size: 0.875rem; /* text-sm */
        line-height: 1.25rem; /* text-sm line-height */
    }

    :global(.markdown-content blockquote) {
        border-left: 4px solid var(--color-gray-300); /* border-l-4 border-gray-300 */
        padding-left: 1rem; /* pl-4 */
        font-style: italic; /* italic */
    }

    :global(.markdown-content table) {
        width: 100%; /* w-full */
        border-collapse: collapse; /* border-collapse */
    }

    :global(.markdown-content th),
    :global(.markdown-content td) {
        border: 1px solid var(--color-gray-300); /* border border-gray-300 */
        padding: 0.5rem 0.75rem; /* py-2 px-3 */
    }

    :global(.markdown-content th) {
        background-color: var(--color-gray-100); /* bg-gray-100 */
        font-weight: 600; /* font-semibold */
    }
</style>
