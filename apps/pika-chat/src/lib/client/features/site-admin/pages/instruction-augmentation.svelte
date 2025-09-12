<script lang="ts">
    import { HelpQuestionmark } from '$icons/ci';
    import { Loader, RefreshCw, X } from '$icons/lucide';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import ConfirmDialog from '$ui/pika/confirm-dialog/confirm-dialog.svelte';
    import { Button } from '$ui/shadcn/button';
    import * as Resizable from '$ui/shadcn/resizable';
    import { ScrollArea } from '$ui/shadcn/scroll-area';
    import { getContext, type Snippet } from 'svelte';
    import DirectiveDialog from '../components/instruction-augmentation/directive-dialog.svelte';
    import SemanticDirectiveDetail from '../components/instruction-augmentation/semantic-directive-detail.svelte';
    import SemanticDirectivesTable from '../components/instruction-augmentation/semantic-directives-table.svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    // Get the semantic directives loading
    const iaState = siteAdmin.instructionAugmentation;

    interface Props {
        pageHeaderRight: Snippet<[]> | undefined;
    }

    let { pageHeaderRight = $bindable() }: Props = $props();

    // Set page title
    siteAdmin.setPageTitle('Instruction Augmentation');

    $effect(() => {
        setTimeout(() => {
            pageHeaderRight = pageHeaderRightSnippet;
        }, 1);
    });

    // async function performSearch(searchCriteria: any) {
    //     isSearching = true;
    //     try {
    //         await siteAdmin.sendSiteAdminCommand({
    //             command: 'searchSemanticDirectives',
    //             request: {
    //                 ...searchCriteria,
    //                 includeInstructions: true,
    //             },
    //         });
    //         searchResults = siteAdmin.semanticDirectives;
    //         lastSearchTimestamp = new Date();
    //     } catch (error) {
    //         console.error('Search failed:', error);
    //     } finally {
    //         isSearching = false;
    //     }
    // }

    async function refreshData() {
        await iaState.performSearch();
    }

    function confirmChangeDirective() {
        iaState.setCurrentDirective(iaState.currentDirectiveWaitingToMakeCurrent, true);
        iaState.showConfirmSaveDirectiveDialog = false;
    }

    function dontChangeDirective() {
        iaState.clearCurrentDirectiveWaitingToMakeCurrent();
        iaState.showConfirmSaveDirectiveDialog = false;
    }

    function showHelp() {
        const externalUrl = 'https://pika.tools/docs/features/instruction-augmentation';
        window.open(externalUrl, '_blank');
    }
</script>

<Resizable.PaneGroup direction="horizontal" class="flex flex-col">
    <Resizable.Pane defaultSize={50}>
        <div class="flex h-full">
            <div class="p-6 flex flex-col flex-1">
                <SemanticDirectivesTable />
            </div>
        </div>
    </Resizable.Pane>

    {#if iaState.currentDirective}
        <Resizable.Handle withHandle />
        <Resizable.Pane defaultSize={40} minSize={30}>
            <div class="h-full flex flex-col">
                <!-- Header -->
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="font-medium">Directive Details</h3>
                    <Button variant="ghost" size="icon" onclick={() => iaState.setCurrentDirective(undefined)}>
                        <X class="w-4 h-4" />
                    </Button>
                </div>

                <!-- Detail content -->
                <div class="flex-1">
                    <ScrollArea class="h-full">
                        <div class="p-4">
                            <SemanticDirectiveDetail
                                directive={iaState.currentDirective}
                                onDirectiveDeleted={() => {
                                    iaState.setCurrentDirective(undefined);
                                    refreshData();
                                }}
                            />
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </Resizable.Pane>
    {/if}
</Resizable.PaneGroup>

<!-- Create directive dialog -->
<DirectiveDialog onDirectiveChanged={() => refreshData()} />

{#snippet pageHeaderRightSnippet()}
    <div class="flex items-center gap-2">
        {#if iaState.loading}
            <div class="flex items-center gap-1">
                <Loader class="mr-2 w-4 h-4 animate-spin text-muted-foreground" />
                <span class="text-muted-foreground">{iaState.loading}</span>
            </div>
        {/if}
        <Button
            variant="outline"
            onclick={() => iaState.refreshData()}
            disabled={iaState.isSearching}
            aria-label="Refresh semantic directives"
        >
            <RefreshCw class="w-4 h-4" />
        </Button>
        <Button variant="outline" onclick={() => showHelp()} aria-label="Show help">
            <HelpQuestionmark class="w-4 h-4" />
        </Button>
        <Button
            variant="default"
            size="sm"
            onclick={() => {
                iaState.directiveDialogMode = 'create';
                iaState.showDirectiveDialog = true;
            }}
            disabled={iaState.isSearching}
            aria-label="Create new semantic directive"
        >
            New Directive
        </Button>
    </div>
{/snippet}

{#if iaState.showConfirmSaveDirectiveDialog}
    <ConfirmDialog
        bind:open={iaState.showConfirmSaveDirectiveDialog}
        title="Unsaved Changes"
        message="Are you sure you want to change the selected directive? You have unsaved changes on the current directive."
        onyes={confirmChangeDirective}
        onno={dontChangeDirective}
    />
{/if}
