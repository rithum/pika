<script lang="ts">
    import Plus from '$icons/lucide/plus';
    import X from '$icons/lucide/x';
    import type {
        IntentRouterCommand,
        IntentRouterCommandExecution,
        IntentRouterDirectExecution,
        IntentRouterDispatchExecution,
        PikaCommand,
    } from 'pika-shared/types/chatbot/intent-router-types';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import { Input } from 'pika-ux/shadcn/input';
    import { Label } from 'pika-ux/shadcn/label';
    import * as Select from 'pika-ux/shadcn/select';
    import { Textarea } from 'pika-ux/shadcn/textarea';

    interface Props {
        command?: IntentRouterCommand;
        tagId: string;
        mode: 'create' | 'edit';
        onSave: (command: IntentRouterCommand) => void;
        onCancel: () => void;
    }

    let { command, tagId, mode, onSave, onCancel }: Props = $props();

    // Form state
    let commandId = $state(command?.commandId ?? '');
    let name = $state(command?.name ?? '');
    let description = $state(command?.description ?? '');
    let examples = $state<string[]>(command?.examples ?? ['']);
    let antiExamples = $state<string[]>(command?.antiExamples ?? []);
    let priority = $state(command?.priority ?? 100);
    let confidenceThreshold = $state(command?.confidenceThreshold ?? 0.85);
    let requiresContext = $state<string[]>(command?.requiresContext ?? []);

    // Execution mode state
    let executionMode = $state<'direct' | 'dispatch'>(command?.execution?.mode ?? 'direct');

    // Direct mode state
    let directCommandType = $state<string>(
        (command?.execution as IntentRouterDirectExecution)?.command?.type ?? 'renderTag'
    );
    let directRenderTagId = $state<string>(
        ((command?.execution as IntentRouterDirectExecution)?.command as any)?.tagId ?? tagId
    );
    let directRenderContext = $state<string>(
        ((command?.execution as IntentRouterDirectExecution)?.command as any)?.renderingContext ?? 'canvas'
    );
    let directResponseTemplate = $state((command?.execution as IntentRouterDirectExecution)?.responseTemplate ?? '');
    let directPassToAgent = $state((command?.execution as IntentRouterDirectExecution)?.passToAgent ?? false);

    // Dispatch mode state
    let dispatchHandlerTagId = $state((command?.execution as IntentRouterDispatchExecution)?.handlerTagId ?? tagId);
    let dispatchPayloadJson = $state(
        (command?.execution as IntentRouterDispatchExecution)?.payload
            ? JSON.stringify((command?.execution as IntentRouterDispatchExecution)?.payload, null, 2)
            : '{}'
    );
    let dispatchResponseTemplate = $state(
        (command?.execution as IntentRouterDispatchExecution)?.responseTemplate ?? ''
    );

    // Validation
    let errors = $state<Record<string, string>>({});

    function validateForm(): boolean {
        const newErrors: Record<string, string> = {};

        if (!commandId.trim()) {
            newErrors.commandId = 'Command ID is required';
        } else if (!/^[a-z][a-z0-9_]*$/.test(commandId)) {
            newErrors.commandId =
                'Command ID must start with lowercase letter and contain only lowercase letters, numbers, and underscores';
        }

        if (!name.trim()) {
            newErrors.name = 'Name is required';
        }

        if (!description.trim()) {
            newErrors.description = 'Description is required';
        }

        const validExamples = examples.filter((e) => e.trim());
        if (validExamples.length === 0) {
            newErrors.examples = 'At least one example is required';
        }

        if (priority < 0 || priority > 1000) {
            newErrors.priority = 'Priority must be between 0 and 1000';
        }

        if (confidenceThreshold < 0 || confidenceThreshold > 1) {
            newErrors.confidenceThreshold = 'Confidence threshold must be between 0 and 1';
        }

        if (executionMode === 'dispatch') {
            try {
                JSON.parse(dispatchPayloadJson);
            } catch {
                newErrors.dispatchPayload = 'Invalid JSON';
            }
        }

        errors = newErrors;
        return Object.keys(newErrors).length === 0;
    }

    function buildExecution(): IntentRouterCommandExecution {
        if (executionMode === 'direct') {
            const directExecution: IntentRouterDirectExecution = {
                mode: 'direct',
                command: {
                    type: 'renderTag',
                    tagId: directRenderTagId,
                    renderingContext: directRenderContext as any,
                } as PikaCommand,
                responseTemplate: directResponseTemplate || undefined,
                passToAgent: directPassToAgent,
            };
            return directExecution;
        } else {
            const dispatchExecution: IntentRouterDispatchExecution = {
                mode: 'dispatch',
                handlerTagId: dispatchHandlerTagId,
                payload:
                    dispatchPayloadJson.trim() && dispatchPayloadJson !== '{}'
                        ? JSON.parse(dispatchPayloadJson)
                        : undefined,
                responseTemplate: dispatchResponseTemplate || undefined,
            };
            return dispatchExecution;
        }
    }

    function handleSave() {
        if (!validateForm()) return;

        const validExamples = examples.filter((e) => e.trim());
        const validAntiExamples = antiExamples.filter((e) => e.trim());
        const validRequiresContext = requiresContext.filter((e) => e.trim());

        const newCommand: IntentRouterCommand = {
            commandId: commandId.trim(),
            name: name.trim(),
            description: description.trim(),
            examples: validExamples,
            antiExamples: validAntiExamples.length > 0 ? validAntiExamples : undefined,
            priority,
            confidenceThreshold: confidenceThreshold !== 0.85 ? confidenceThreshold : undefined,
            requiresContext: validRequiresContext.length > 0 ? validRequiresContext : undefined,
            execution: buildExecution(),
        };

        onSave(newCommand);
    }

    function addExample() {
        examples = [...examples, ''];
    }

    function removeExample(index: number) {
        examples = examples.filter((_, i) => i !== index);
    }

    function addAntiExample() {
        antiExamples = [...antiExamples, ''];
    }

    function removeAntiExample(index: number) {
        antiExamples = antiExamples.filter((_, i) => i !== index);
    }

    function addRequiresContext() {
        requiresContext = [...requiresContext, ''];
    }

    function removeRequiresContext(index: number) {
        requiresContext = requiresContext.filter((_, i) => i !== index);
    }
</script>

<div class="space-y-6">
    <!-- Basic Info -->
    <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
            <div class="flex items-center gap-1">
                <Label for="commandId">Command ID</Label>
                <PopupHelp popoverClasses="max-w-[300px]">
                    <p class="text-xs">
                        Unique identifier for this command. Use snake_case (e.g., view_jobs, fix_errors).
                    </p>
                </PopupHelp>
            </div>
            <Input
                id="commandId"
                bind:value={commandId}
                placeholder="view_jobs"
                disabled={mode === 'edit'}
                class={errors.commandId ? 'border-destructive' : ''}
            />
            {#if errors.commandId}
                <p class="text-xs text-destructive">{errors.commandId}</p>
            {/if}
        </div>

        <div class="space-y-2">
            <div class="flex items-center gap-1">
                <Label for="name">Name</Label>
                <PopupHelp popoverClasses="max-w-[300px]">
                    <p class="text-xs">Human-readable name shown in admin UI.</p>
                </PopupHelp>
            </div>
            <Input
                id="name"
                bind:value={name}
                placeholder="View Jobs"
                class={errors.name ? 'border-destructive' : ''}
            />
            {#if errors.name}
                <p class="text-xs text-destructive">{errors.name}</p>
            {/if}
        </div>
    </div>

    <div class="space-y-2">
        <div class="flex items-center gap-1">
            <Label for="description">Description</Label>
            <PopupHelp popoverClasses="max-w-[300px]">
                <p class="text-xs">
                    Description shown to the classifier for matching. Be specific about what this command does.
                </p>
            </PopupHelp>
        </div>
        <Textarea
            id="description"
            bind:value={description}
            placeholder="Opens the job list widget showing all jobs for the current user"
            rows={2}
            class={errors.description ? 'border-destructive' : ''}
        />
        {#if errors.description}
            <p class="text-xs text-destructive">{errors.description}</p>
        {/if}
    </div>

    <!-- Examples -->
    <div class="space-y-2">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-1">
                <Label>Examples (should match)</Label>
                <PopupHelp popoverClasses="max-w-[300px]">
                    <p class="text-xs">User messages that SHOULD trigger this command. Add diverse examples.</p>
                </PopupHelp>
            </div>
            <Button variant="ghost" size="sm" onclick={addExample}>
                <Plus class="w-4 h-4" />
            </Button>
        </div>
        <div class="space-y-2">
            {#each examples as example, index}
                <div class="flex items-center gap-2">
                    <Input bind:value={examples[index]} placeholder="show me my jobs" />
                    <Button variant="ghost" size="icon" onclick={() => removeExample(index)}>
                        <X class="w-4 h-4" />
                    </Button>
                </div>
            {/each}
        </div>
        {#if errors.examples}
            <p class="text-xs text-destructive">{errors.examples}</p>
        {/if}
    </div>

    <!-- Anti-Examples -->
    <div class="space-y-2">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-1">
                <Label>Anti-Examples (should NOT match)</Label>
                <PopupHelp popoverClasses="max-w-[300px]">
                    <p class="text-xs">
                        User messages that should NOT trigger this command. Helps distinguish similar intents.
                    </p>
                </PopupHelp>
            </div>
            <Button variant="ghost" size="sm" onclick={addAntiExample}>
                <Plus class="w-4 h-4" />
            </Button>
        </div>
        <div class="space-y-2">
            {#each antiExamples as antiExample, index}
                <div class="flex items-center gap-2">
                    <Input bind:value={antiExamples[index]} placeholder="what is a job?" />
                    <Button variant="ghost" size="icon" onclick={() => removeAntiExample(index)}>
                        <X class="w-4 h-4" />
                    </Button>
                </div>
            {/each}
            {#if antiExamples.length === 0}
                <p class="text-xs text-muted-foreground">No anti-examples. Click + to add one.</p>
            {/if}
        </div>
    </div>

    <!-- Priority & Confidence -->
    <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
            <div class="flex items-center gap-1">
                <Label for="priority">Priority</Label>
                <PopupHelp popoverClasses="max-w-[300px]">
                    <p class="text-xs">
                        Higher priority commands are preferred when multiple could match. Range: 0-1000.
                    </p>
                </PopupHelp>
            </div>
            <Input
                id="priority"
                type="number"
                min="0"
                max="1000"
                bind:value={priority}
                class={errors.priority ? 'border-destructive' : ''}
            />
            {#if errors.priority}
                <p class="text-xs text-destructive">{errors.priority}</p>
            {/if}
        </div>

        <div class="space-y-2">
            <div class="flex items-center gap-1">
                <Label for="confidenceThreshold">Confidence Threshold</Label>
                <PopupHelp popoverClasses="max-w-[300px]">
                    <p class="text-xs">Minimum confidence (0-1) required to match. Default is 0.85.</p>
                </PopupHelp>
            </div>
            <Input
                id="confidenceThreshold"
                type="number"
                min="0"
                max="1"
                step="0.05"
                bind:value={confidenceThreshold}
                class={errors.confidenceThreshold ? 'border-destructive' : ''}
            />
            {#if errors.confidenceThreshold}
                <p class="text-xs text-destructive">{errors.confidenceThreshold}</p>
            {/if}
        </div>
    </div>

    <!-- Requires Context -->
    <div class="space-y-2">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-1">
                <Label>Requires Context (optional)</Label>
                <PopupHelp popoverClasses="max-w-[300px]">
                    <p class="text-xs">
                        Context paths that must exist for this command to be eligible. Use dot notation (e.g.,
                        currentJob.jobId).
                    </p>
                </PopupHelp>
            </div>
            <Button variant="ghost" size="sm" onclick={addRequiresContext}>
                <Plus class="w-4 h-4" />
            </Button>
        </div>
        <div class="space-y-2">
            {#each requiresContext as contextPath, index}
                <div class="flex items-center gap-2">
                    <Input
                        bind:value={requiresContext[index]}
                        placeholder="currentJob.jobId"
                        class="font-mono text-sm"
                    />
                    <Button variant="ghost" size="icon" onclick={() => removeRequiresContext(index)}>
                        <X class="w-4 h-4" />
                    </Button>
                </div>
            {/each}
            {#if requiresContext.length === 0}
                <p class="text-xs text-muted-foreground">No context requirements. Command is always eligible.</p>
            {/if}
        </div>
    </div>

    <!-- Execution Mode -->
    <div class="space-y-4 p-4 border rounded-lg bg-muted/30">
        <div class="space-y-2">
            <div class="flex items-center gap-1">
                <Label>Execution Mode</Label>
                <PopupHelp popoverClasses="max-w-[400px]">
                    <div class="text-xs space-y-2">
                        <p>
                            <strong>Direct:</strong> Execute a command immediately (e.g., open a widget). Simple and fast.
                        </p>
                        <p>
                            <strong>Dispatch:</strong> Send to an orchestrator widget for custom logic. Use when you need
                            API calls or conditional behavior.
                        </p>
                    </div>
                </PopupHelp>
            </div>
            <Select.Root type="single" bind:value={executionMode}>
                <Select.Trigger class="w-full">
                    {executionMode === 'direct' ? 'Direct (execute command)' : 'Dispatch (send to handler)'}
                </Select.Trigger>
                <Select.Content>
                    <Select.Item value="direct">Direct (execute command)</Select.Item>
                    <Select.Item value="dispatch">Dispatch (send to handler)</Select.Item>
                </Select.Content>
            </Select.Root>
        </div>

        {#if executionMode === 'direct'}
            <div class="space-y-4">
                <div class="space-y-2">
                    <Label for="directRenderTagId">Tag to Render</Label>
                    <Input
                        id="directRenderTagId"
                        bind:value={directRenderTagId}
                        placeholder="scope.tag"
                        class="font-mono"
                    />
                </div>

                <div class="space-y-2">
                    <Label for="directRenderContext">Rendering Context</Label>
                    <Select.Root type="single" bind:value={directRenderContext}>
                        <Select.Trigger class="w-full">
                            {directRenderContext}
                        </Select.Trigger>
                        <Select.Content>
                            <Select.Item value="canvas">Canvas</Select.Item>
                            <Select.Item value="dialog">Dialog</Select.Item>
                            <Select.Item value="hero">Hero</Select.Item>
                            <Select.Item value="spotlight">Spotlight</Select.Item>
                        </Select.Content>
                    </Select.Root>
                </div>

                <div class="space-y-2">
                    <div class="flex items-center gap-1">
                        <Label for="directResponseTemplate">Response Template</Label>
                        <PopupHelp popoverClasses="max-w-[300px]">
                            <p class="text-xs">
                                Message shown to user. Supports template interpolation (e.g., {'{{context.currentJob.name}}'}).
                            </p>
                        </PopupHelp>
                    </div>
                    <Input
                        id="directResponseTemplate"
                        bind:value={directResponseTemplate}
                        placeholder="Opening your jobs..."
                    />
                </div>

                <div class="flex items-center gap-2">
                    <input type="checkbox" id="directPassToAgent" bind:checked={directPassToAgent} class="rounded" />
                    <Label for="directPassToAgent" class="text-sm font-normal">
                        Also pass to Bedrock agent for richer response
                    </Label>
                </div>
            </div>
        {:else}
            <div class="space-y-4">
                <div class="space-y-2">
                    <div class="flex items-center gap-1">
                        <Label for="dispatchHandlerTagId">Handler Widget Tag ID</Label>
                        <PopupHelp popoverClasses="max-w-[300px]">
                            <p class="text-xs">Tag ID of the orchestrator widget that will handle this command.</p>
                        </PopupHelp>
                    </div>
                    <Input
                        id="dispatchHandlerTagId"
                        bind:value={dispatchHandlerTagId}
                        placeholder="myapp.orchestrator"
                        class="font-mono"
                    />
                </div>

                <div class="space-y-2">
                    <div class="flex items-center gap-1">
                        <Label for="dispatchPayload">Payload (JSON)</Label>
                        <PopupHelp popoverClasses="max-w-[300px]">
                            <p class="text-xs">
                                Custom data sent to the handler. Use to pass action identifiers or parameters.
                            </p>
                        </PopupHelp>
                    </div>
                    <Textarea
                        id="dispatchPayload"
                        bind:value={dispatchPayloadJson}
                        placeholder={'{"action": "my_action"}'}
                        rows={3}
                        class="font-mono text-sm {errors.dispatchPayload ? 'border-destructive' : ''}"
                    />
                    {#if errors.dispatchPayload}
                        <p class="text-xs text-destructive">{errors.dispatchPayload}</p>
                    {/if}
                </div>

                <div class="space-y-2">
                    <div class="flex items-center gap-1">
                        <Label for="dispatchResponseTemplate">Response Template</Label>
                        <PopupHelp popoverClasses="max-w-[300px]">
                            <p class="text-xs">
                                Message shown to user while handler processes (e.g., "Loading your jobs...").
                            </p>
                        </PopupHelp>
                    </div>
                    <Input
                        id="dispatchResponseTemplate"
                        bind:value={dispatchResponseTemplate}
                        placeholder="Loading your jobs..."
                    />
                </div>
            </div>
        {/if}
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-4">
        <Button variant="outline" onclick={onCancel}>Cancel</Button>
        <Button onclick={handleSave}>
            {mode === 'create' ? 'Add Command' : 'Update Command'}
        </Button>
    </div>
</div>
