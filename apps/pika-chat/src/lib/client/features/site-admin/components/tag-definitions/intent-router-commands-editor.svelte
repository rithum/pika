<script lang="ts">
    import ChevronDown from '$icons/lucide/chevron-down';
    import ChevronRight from '$icons/lucide/chevron-right';
    import Plus from '$icons/lucide/plus';
    import Trash2 from '$icons/lucide/trash-2';
    import type { IntentRouterCommand } from 'pika-shared/types/chatbot/intent-router-types';
    import { Badge } from 'pika-ux/shadcn/badge';
    import { Button } from 'pika-ux/shadcn/button';
    import { Separator } from 'pika-ux/shadcn/separator';
    import IntentRouterCommandForm from './intent-router-command-form.svelte';

    interface Props {
        commands: IntentRouterCommand[];
        tagId: string;
        onCommandsChanged: (commands: IntentRouterCommand[]) => void;
    }

    let { commands, tagId, onCommandsChanged }: Props = $props();

    let expandedCommandId = $state<string | null>(null);
    let showAddForm = $state(false);

    function toggleExpanded(commandId: string) {
        expandedCommandId = expandedCommandId === commandId ? null : commandId;
    }

    function addCommand(command: IntentRouterCommand) {
        const newCommands = [...commands, command];
        onCommandsChanged(newCommands);
        showAddForm = false;
        expandedCommandId = command.commandId;
    }

    function updateCommand(index: number, command: IntentRouterCommand) {
        const newCommands = [...commands];
        newCommands[index] = command;
        onCommandsChanged(newCommands);
    }

    function removeCommand(index: number) {
        const newCommands = commands.filter((_, i) => i !== index);
        onCommandsChanged(newCommands);
        if (expandedCommandId === commands[index].commandId) {
            expandedCommandId = null;
        }
    }

    function moveCommand(index: number, direction: 'up' | 'down') {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= commands.length) return;
        
        const newCommands = [...commands];
        [newCommands[index], newCommands[newIndex]] = [newCommands[newIndex], newCommands[index]];
        onCommandsChanged(newCommands);
    }
</script>

<div class="space-y-4">
    {#if commands.length === 0 && !showAddForm}
        <div class="text-center py-8 border rounded-lg border-dashed">
            <p class="text-muted-foreground mb-4">No commands defined for this widget</p>
            <Button onclick={() => showAddForm = true}>
                <Plus class="w-4 h-4 mr-2" />
                Add First Command
            </Button>
        </div>
    {:else}
        <!-- Command list -->
        <div class="space-y-2">
            {#each commands as command, index}
                <div class="border rounded-lg">
                    <!-- Command header -->
                    <button
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                        onclick={() => toggleExpanded(command.commandId)}
                    >
                        <div class="flex items-center gap-3">
                            {#if expandedCommandId === command.commandId}
                                <ChevronDown class="w-4 h-4 text-muted-foreground" />
                            {:else}
                                <ChevronRight class="w-4 h-4 text-muted-foreground" />
                            {/if}
                            <div class="text-left">
                                <div class="font-medium text-sm">{command.name}</div>
                                <div class="text-xs text-muted-foreground font-mono">{command.commandId}</div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <Badge variant="outline" class="text-xs">
                                {command.execution.mode}
                            </Badge>
                            <Badge variant="secondary" class="text-xs">
                                priority: {command.priority}
                            </Badge>
                        </div>
                    </button>

                    <!-- Command details (expanded) -->
                    {#if expandedCommandId === command.commandId}
                        <Separator />
                        <div class="p-4">
                            <IntentRouterCommandForm
                                {command}
                                {tagId}
                                mode="edit"
                                onSave={(updatedCommand: IntentRouterCommand) => updateCommand(index, updatedCommand)}
                                onCancel={() => expandedCommandId = null}
                            />
                            
                            <div class="flex items-center justify-between mt-4 pt-4 border-t">
                                <div class="flex items-center gap-2">
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onclick={() => moveCommand(index, 'up')}
                                        disabled={index === 0}
                                    >
                                        Move Up
                                    </Button>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onclick={() => moveCommand(index, 'down')}
                                        disabled={index === commands.length - 1}
                                    >
                                        Move Down
                                    </Button>
                                </div>
                                <Button 
                                    variant="destructive" 
                                    size="sm"
                                    onclick={() => removeCommand(index)}
                                >
                                    <Trash2 class="w-4 h-4 mr-2" />
                                    Delete Command
                                </Button>
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>

        <!-- Add command button or form -->
        {#if showAddForm}
            <div class="border rounded-lg p-4">
                <h4 class="font-medium mb-4">Add New Command</h4>
                <IntentRouterCommandForm
                    {tagId}
                    mode="create"
                    onSave={addCommand}
                    onCancel={() => showAddForm = false}
                />
            </div>
        {:else}
            <Button variant="outline" onclick={() => showAddForm = true}>
                <Plus class="w-4 h-4 mr-2" />
                Add Command
            </Button>
        {/if}
    {/if}
</div>
