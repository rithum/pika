<script lang="ts">
    import Calendar from '$icons/lucide/calendar';
    import Loader from '$icons/lucide/loader';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { formatDistanceToNow } from 'date-fns';
    import type { TagDefinition, TagDefinitionWidget } from 'pika-shared/types/chatbot/chatbot-types';
    import type { IntentRouterCommand } from 'pika-shared/types/chatbot/intent-router-types';
    import { PikaBadge } from 'pika-ux/pika/pika-badge';
    import { Button } from 'pika-ux/shadcn/button';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'pika-ux/shadcn/card';
    import { Label } from 'pika-ux/shadcn/label';
    import { Separator } from 'pika-ux/shadcn/separator';
    import { getContext } from 'svelte';
    import { toast } from 'svelte-sonner';
    import IntentRouterCommandsEditor from './intent-router-commands-editor.svelte';

    interface Props {
        tagDefinition: TagDefinition<TagDefinitionWidget>;
        onUpdated: () => void;
        hasUnsavedChanges: boolean;
    }

    let { tagDefinition, onUpdated, hasUnsavedChanges = $bindable() }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    let isSaving = $state(false);
    let editedCommands = $state<IntentRouterCommand[]>([]);

    // Initialize edited commands from tag definition
    $effect(() => {
        editedCommands = structuredClone(tagDefinition.intentRouterCommands ?? []);
        hasUnsavedChanges = false;
    });

    function handleCommandsChanged(commands: IntentRouterCommand[]) {
        editedCommands = commands;
        hasUnsavedChanges = true;
    }

    async function saveChanges() {
        isSaving = true;
        try {
            // Create updated tag definition with new commands
            const updatedTagDef: TagDefinition<TagDefinitionWidget> = {
                ...tagDefinition,
                intentRouterCommands: editedCommands.length > 0 ? editedCommands : undefined
            };

            await siteAdmin.sendSiteAdminCommand({
                command: 'createOrUpdateTagDefinition',
                request: {
                    tagDefinition: updatedTagDef,
                    userId: appState.identity.user?.userId ?? 'admin-ui'
                }
            });

            toast.success('Tag definition saved successfully');
            hasUnsavedChanges = false;
            onUpdated();
        } catch (error) {
            console.error('Failed to save tag definition:', error);
            toast.error('Failed to save tag definition');
        } finally {
            isSaving = false;
        }
    }

    function discardChanges() {
        editedCommands = structuredClone(tagDefinition.intentRouterCommands ?? []);
        hasUnsavedChanges = false;
    }
</script>

<div class="space-y-6">
    <!-- Header Card -->
    <Card>
        <CardHeader class="pb-3">
            <div class="flex items-start justify-between">
                <div class="space-y-1">
                    <CardTitle class="text-lg font-mono">
                        {tagDefinition.scope}.{tagDefinition.tag}
                    </CardTitle>
                    <CardDescription>
                        {tagDefinition.tagTitle || 'No title'}
                    </CardDescription>
                </div>
                <div class="flex items-center gap-2">
                    <PikaBadge variant={tagDefinition.status === 'enabled' ? 'default' : 'secondary'}>
                        {tagDefinition.status}
                    </PikaBadge>
                    <PikaBadge variant="outline">
                        {tagDefinition.usageMode}
                    </PikaBadge>
                </div>
            </div>
        </CardHeader>
        <CardContent>
            <p class="text-sm text-muted-foreground">
                {tagDefinition.description || 'No description'}
            </p>
        </CardContent>
    </Card>

    <!-- Intent Router Commands -->
    <Card>
        <CardHeader>
            <div class="flex items-center justify-between">
                <div>
                    <CardTitle class="text-base">Intent Router Commands</CardTitle>
                    <CardDescription>
                        Commands that can be matched by the Intent Router for fast responses
                    </CardDescription>
                </div>
                {#if hasUnsavedChanges}
                    <div class="flex items-center gap-2">
                        <Button variant="outline" size="sm" onclick={discardChanges} disabled={isSaving}>
                            Discard
                        </Button>
                        <Button size="sm" onclick={saveChanges} disabled={isSaving}>
                            {#if isSaving}
                                <Loader class="w-4 h-4 mr-2 animate-spin" />
                            {/if}
                            Save Changes
                        </Button>
                    </div>
                {/if}
            </div>
        </CardHeader>
        <CardContent>
            <IntentRouterCommandsEditor
                commands={editedCommands}
                tagId="{tagDefinition.scope}.{tagDefinition.tag}"
                onCommandsChanged={handleCommandsChanged}
            />
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
                            <span>
                                {tagDefinition.createDate 
                                    ? formatDistanceToNow(new Date(tagDefinition.createDate), { addSuffix: true })
                                    : 'Unknown'}
                            </span>
                        </div>
                        {#if tagDefinition.createdBy}
                            <p class="text-xs text-muted-foreground mt-1">
                                by {tagDefinition.createdBy}
                            </p>
                        {/if}
                    </div>
                </div>

                <div class="space-y-2">
                    <div>
                        <Label class="text-xs font-medium">Last Updated</Label>
                        <div class="flex items-center gap-2 mt-1">
                            <Calendar class="w-3 h-3" />
                            <span>
                                {tagDefinition.lastUpdate 
                                    ? formatDistanceToNow(new Date(tagDefinition.lastUpdate), { addSuffix: true })
                                    : 'Unknown'}
                            </span>
                        </div>
                        {#if tagDefinition.lastUpdatedBy}
                            <p class="text-xs text-muted-foreground mt-1">
                                by {tagDefinition.lastUpdatedBy}
                            </p>
                        {/if}
                    </div>
                </div>
            </div>

            <Separator class="my-4" />

            <div class="space-y-2">
                <Label class="text-xs font-medium">Widget Type</Label>
                <p class="text-sm">
                    {tagDefinition.widget?.type ?? 'Unknown'}
                </p>
            </div>

            {#if tagDefinition.renderingContexts}
                <div class="mt-4 space-y-2">
                    <Label class="text-xs font-medium">Rendering Contexts</Label>
                    <div class="flex flex-wrap gap-1">
                        {#each Object.entries(tagDefinition.renderingContexts) as [context, config]}
                            {#if config?.enabled}
                                <PikaBadge variant="outline">{context}</PikaBadge>
                            {/if}
                        {/each}
                    </div>
                </div>
            {/if}
        </CardContent>
    </Card>
</div>
