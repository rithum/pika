<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import hljs from 'highlight.js';
    import 'highlight.js/styles/github-dark.css';
    import type {
        AgentDefinition,
        AgentInstructionAssistanceFeature,
        AgentInstructionAssistanceFeatureForChatApp,
        TagsChatAppOverridableFeature,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import {
        applyInstructionAssistance,
        generateInstructionAssistanceContent,
    } from 'pika-shared/util/instruction-assistance-utils';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import { Checkbox } from 'pika-ux/shadcn/checkbox';
    import { Label } from 'pika-ux/shadcn/label';
    import { Textarea } from 'pika-ux/shadcn/textarea';
    import { getContext } from 'svelte';

    interface Props {
        featureEnabled: boolean;
        overriddenFeature?: AgentInstructionAssistanceFeatureForChatApp;
        originalFeature?: AgentInstructionAssistanceFeature;
        isOverrideMode: boolean;
        isOverridden: boolean;
        disabled: boolean;
        setValid?: (valid: boolean) => void;
        agent?: AgentDefinition;
        tagsToUse?: TagsChatAppOverridableFeature;
    }

    let {
        featureEnabled,
        overriddenFeature = $bindable(),
        originalFeature,
        isOverrideMode,
        isOverridden,
        disabled,
        setValid,
        agent,
        tagsToUse,
    }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdminState = appState.siteAdmin;
    const effectiveFeature = $derived(isOverrideMode && overriddenFeature ? overriddenFeature : originalFeature);

    let highlightedInstructions = $state('');

    let instructions = $derived.by(() => {
        const agentToUse = agent;
        const instructionAssistanceConfig = siteAdminState.instructionAssistanceConfig;
        const tags = siteAdminState.tagDefinitions;
        const tagsConfig = tagsToUse;
        const feature = effectiveFeature;

        // console.log('instructions', {
        //     featureEnabled,
        //     agentToUse,
        //     instructionAssistanceConfig,
        //     tagsConfig,
        //     feature,
        // });

        if (featureEnabled && agentToUse && instructionAssistanceConfig) {
            const instructionContent = generateInstructionAssistanceContent(
                instructionAssistanceConfig,
                tagsConfig,
                {
                    enabled: feature?.enabled ?? false,
                    includeOutputFormattingRequirements: feature?.includeOutputFormattingRequirements?.enabled ?? false,
                    includeInstructionsForTags: feature?.includeInstructionsForTags?.enabled ?? false,
                    completeExampleInstructionEnabled: feature?.completeExampleInstructionLine?.enabled ?? false,
                    completeExampleInstructionLine: feature?.completeExampleInstructionLine?.mdLine,
                    jsonOnlyImperativeInstructionEnabled: feature?.jsonOnlyImperativeInstructionLine?.enabled ?? false,
                    jsonOnlyImperativeInstructionLine: feature?.jsonOnlyImperativeInstructionLine?.line,
                    includeTypescriptBackedOutputFormattingRequirements:
                        feature?.includeTypescriptBackedOutputFormattingRequirements?.enabled ?? false,
                    typescriptBackedOutputFormattingRequirements:
                        feature?.includeTypescriptBackedOutputFormattingRequirements?.line,
                },
                tags
            );
            return applyInstructionAssistance(agentToUse.basePrompt, instructionContent);
        }

        return undefined;
    });

    function highlightInstructions(content: string): string {
        if (!content) return '';

        // Use markdown highlighting since the content is primarily markdown with XML tags
        try {
            const highlighted = hljs.highlight(content, {
                language: 'markdown',
                ignoreIllegals: true,
            }).value;
            return highlighted;
        } catch (error) {
            console.warn('Failed to highlight instructions:', error);
            // Fallback to HTML escaping
            return hljs.highlight(content, {
                language: 'xml',
                ignoreIllegals: true,
            }).value;
        }
    }

    // Update highlighted instructions when content changes
    $effect(() => {
        if (instructions) {
            highlightedInstructions = highlightInstructions(instructions);
        } else {
            highlightedInstructions = '';
        }
    });

    function ensureFeature(): AgentInstructionAssistanceFeatureForChatApp {
        if (!isOverrideMode) {
            throw new Error('AgentInstructionAssistanceFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'agentInstructionAssistance',
                enabled: originalFeature?.enabled ?? false,
                includeOutputFormattingRequirements: {
                    enabled: originalFeature?.includeOutputFormattingRequirements?.enabled ?? true,
                },
                includeInstructionsForTags: {
                    enabled: originalFeature?.includeInstructionsForTags?.enabled ?? true,
                },
                completeExampleInstructionLine: {
                    enabled: originalFeature?.completeExampleInstructionLine?.enabled ?? true,
                    mdLine: originalFeature?.completeExampleInstructionLine?.mdLine,
                },
                jsonOnlyImperativeInstructionLine: {
                    enabled: originalFeature?.jsonOnlyImperativeInstructionLine?.enabled ?? true,
                    line: originalFeature?.jsonOnlyImperativeInstructionLine?.line,
                },
            } as AgentInstructionAssistanceFeatureForChatApp;
        } else {
            // Ensure all optional fields exist with defaults
            if (!overriddenFeature.includeOutputFormattingRequirements) {
                overriddenFeature.includeOutputFormattingRequirements = {
                    enabled: true,
                };
            }
            if (!overriddenFeature.includeInstructionsForTags) {
                overriddenFeature.includeInstructionsForTags = {
                    enabled: true,
                };
            }
            if (!overriddenFeature.completeExampleInstructionLine) {
                overriddenFeature.completeExampleInstructionLine = {
                    enabled: true,
                    mdLine: undefined,
                };
            }
            if (!overriddenFeature.jsonOnlyImperativeInstructionLine) {
                overriddenFeature.jsonOnlyImperativeInstructionLine = {
                    enabled: true,
                    line: undefined,
                };
            }
        }

        return overriddenFeature;
    }

    $effect(() => {
        if (isOverrideMode) {
            ensureFeature();
        } else {
            overriddenFeature = undefined;
        }
    });

    // Validation logic
    $effect(() => {
        if (!setValid) return;

        // Basic validation - feature is always valid for now
        // Could add more complex validation later if needed
        setValid(true);
    });
</script>

{#if effectiveFeature}
    <div class="flex gap-6">
        <div class="flex-shrink-0 w-96 min-w-96">
            <!-- Include Output Formatting Requirements -->
            <div class="space-y-2 mb-6">
                <div class="flex items-center space-x-2">
                    <Label class="text-sm font-bold">Output Formatting Requirements</Label>
                    <PopupHelp popoverClasses="max-w-[500px] text-xs text-muted-foreground">
                        When enabled, the system will inject foundational formatting guidance into the agent prompt at
                        the
                        <code>{'{{'}</code><code>output-formatting-requirements</code><code>{'}}'}</code> placeholder
                        location, or as part of the <code>{'{{'}</code><code>prompt-assistance</code><code>{'}}'}</code>
                        placeholder.
                    </PopupHelp>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="flex items-center space-x-2">
                        <Checkbox
                            id="include-output-formatting"
                            bind:checked={
                                () => effectiveFeature?.includeOutputFormattingRequirements?.enabled ?? true,
                                (checked) => {
                                    if (isOverrideMode) {
                                        const feature = ensureFeature();
                                        feature.includeOutputFormattingRequirements =
                                            feature.includeOutputFormattingRequirements || {
                                                enabled: true,
                                            };
                                        feature.includeOutputFormattingRequirements.enabled = checked;
                                    }
                                }
                            }
                            disabled={disabled || !featureEnabled}
                        />
                        <Label for="include-output-formatting" class="text-sm"
                            >Include basic output formatting requirements</Label
                        >
                    </div>
                </div>
            </div>

            <!-- Include Instructions for Tags -->
            <div class="space-y-2 mb-6">
                <div class="flex items-center space-x-2">
                    <Label class="text-sm font-bold">Tag Instructions Integration</Label>
                    <PopupHelp popoverClasses="max-w-[500px] text-xs text-muted-foreground">
                        When enabled, the system will automatically inject LLM instructions for all enabled tags into
                        the agent prompt at the <code>{'{{'}</code><code>tag-instructions</code><code>{'}}'}</code>
                        placeholder location, or as part of the <code>{'{{'}</code><code>prompt-assistance</code><code
                            >{'}}'}</code
                        >
                        placeholder.
                    </PopupHelp>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="flex items-center space-x-2">
                        <Checkbox
                            id="include-tag-instructions"
                            bind:checked={
                                () => effectiveFeature?.includeInstructionsForTags?.enabled ?? true,
                                (checked) => {
                                    if (isOverrideMode) {
                                        const feature = ensureFeature();
                                        feature.includeInstructionsForTags = feature.includeInstructionsForTags || {
                                            enabled: true,
                                        };
                                        feature.includeInstructionsForTags.enabled = checked;
                                    }
                                }
                            }
                            disabled={disabled || !featureEnabled}
                        />
                        <Label for="include-tag-instructions" class="text-sm"
                            >Include instructions for enabled tags</Label
                        >
                    </div>
                </div>
            </div>

            <!-- Complete Example Instruction Line -->
            <div class="space-y-2 mb-6">
                <div class="flex items-center space-x-2">
                    <Label class="text-sm font-bold">Example Instruction Line</Label>
                    <PopupHelp popoverClasses="max-w-[500px] text-xs text-muted-foreground">
                        Provides a complete example showing proper <code>&lt;answer&gt;</code> tag structure and enabled
                        tag usage to help the LLM understand the expected format.
                    </PopupHelp>
                </div>
                <div class="space-y-3">
                    <div class="flex items-center space-x-2">
                        <Checkbox
                            id="complete-example-enabled"
                            bind:checked={
                                () => effectiveFeature?.completeExampleInstructionLine?.enabled ?? true,
                                (checked) => {
                                    if (isOverrideMode) {
                                        const feature = ensureFeature();
                                        feature.completeExampleInstructionLine =
                                            feature.completeExampleInstructionLine || {
                                                enabled: true,
                                            };
                                        feature.completeExampleInstructionLine.enabled = checked;
                                    }
                                }
                            }
                            disabled={disabled || !featureEnabled}
                        />
                        <Label for="complete-example-enabled" class="text-sm">
                            Include complete example instruction line
                        </Label>
                    </div>

                    {#if effectiveFeature.completeExampleInstructionLine?.enabled}
                        <div class="space-y-1">
                            <Label for="custom-example-line" class="text-xs font-medium">Example Instruction Line</Label
                            >
                            <Textarea
                                id="custom-example-line"
                                placeholder="Leave empty to use default example instruction line"
                                bind:value={
                                    () => effectiveFeature?.completeExampleInstructionLine?.mdLine ?? '',
                                    (value) => {
                                        if (isOverrideMode) {
                                            const feature = ensureFeature();
                                            feature.completeExampleInstructionLine =
                                                feature.completeExampleInstructionLine || { enabled: true };
                                            feature.completeExampleInstructionLine.mdLine = value || undefined;
                                        }
                                    }
                                }
                                disabled={disabled || !isOverrideMode}
                                class="min-h-20 text-xs"
                            />
                        </div>
                    {/if}
                </div>
            </div>

            <!-- JSON Validation Instruction Line -->
            <div class="space-y-2 mb-6">
                <div class="flex items-center space-x-2">
                    <Label class="text-sm font-bold">JSON Validation Instructions</Label>
                    <PopupHelp popoverClasses="max-w-[500px] text-xs text-muted-foreground">
                        This critical instruction adds strict JSON validation instructions to prevent malformed data
                        from breaking response parsing and rendering.
                    </PopupHelp>
                </div>
                <div class="space-y-3">
                    <div class="flex items-center space-x-2">
                        <Checkbox
                            id="json-validation-enabled"
                            bind:checked={
                                () => effectiveFeature?.jsonOnlyImperativeInstructionLine?.enabled ?? true,
                                (checked) => {
                                    if (isOverrideMode) {
                                        const feature = ensureFeature();
                                        feature.jsonOnlyImperativeInstructionLine =
                                            feature.jsonOnlyImperativeInstructionLine || {
                                                enabled: true,
                                                line: undefined,
                                            };
                                        feature.jsonOnlyImperativeInstructionLine.enabled = checked;
                                    }
                                }
                            }
                            disabled={disabled || !featureEnabled}
                        />
                        <Label for="json-validation-enabled" class="text-sm">Include JSON validation imperative</Label>
                    </div>

                    {#if effectiveFeature.jsonOnlyImperativeInstructionLine?.enabled}
                        <div class="space-y-1">
                            <Label for="json-validation-line" class="text-xs font-medium">Instruction Line</Label>
                            <Textarea
                                id="json-validation-line"
                                placeholder="Leave empty to use default instruction line"
                                bind:value={
                                    () => effectiveFeature?.jsonOnlyImperativeInstructionLine?.line ?? undefined,
                                    (value) => {
                                        if (isOverrideMode) {
                                            const feature = ensureFeature();
                                            feature.jsonOnlyImperativeInstructionLine =
                                                feature.jsonOnlyImperativeInstructionLine || {
                                                    enabled: true,
                                                    line: undefined,
                                                };
                                            feature.jsonOnlyImperativeInstructionLine.line = value || undefined;
                                        }
                                    }
                                }
                                disabled={disabled || !isOverrideMode}
                                class="min-h-20 text-xs"
                            />
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Information Section -->
            <div class="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div class="space-y-2">
                    <h4 class="text-sm font-medium text-blue-900">How Agent Instruction Assistance Works</h4>
                    <div class="space-y-1 text-xs text-blue-800">
                        <p><strong>Placeholder Options:</strong></p>
                        <p>
                            • <strong>Single placeholder:</strong> Use
                            <code class="bg-blue-100 px-1 rounded">{'{{'}</code><code class="bg-blue-100 rounded"
                                >prompt-assistance</code
                            ><code class="bg-blue-100 px-1 rounded">{'}}'}</code> to inject all enabled instruction content
                            in one location
                        </p>
                        <p><strong>Individual placeholders for fine-grained control:</strong></p>
                        <p class="ml-4">
                            • <code class="bg-blue-100 px-1 rounded">{'{{'}</code><code class="bg-blue-100 rounded"
                                >output-formatting-requirements</code
                            ><code class="bg-blue-100 px-1 rounded">{'}}'}</code> - Basic formatting requirements
                        </p>
                        <p class="ml-4">
                            • <code class="bg-blue-100 px-1 rounded">{'{{'}</code><code class="bg-blue-100 rounded"
                                >tag-instructions</code
                            ><code class="bg-blue-100 px-1 rounded">{'}}'}</code> - Tag-specific instructions
                        </p>
                        <p class="ml-4">
                            • <code class="bg-blue-100 px-1 rounded">{'{{'}</code><code class="bg-blue-100 rounded"
                                >complete-example-instruction-line</code
                            ><code class="bg-blue-100 px-1 rounded">{'}}'}</code> - Complete example
                        </p>
                        <p class="ml-4">
                            • <code class="bg-blue-100 px-1 rounded">{'{{'}</code><code class="bg-blue-100 rounded"
                                >json-only-imperative-instruction-line</code
                            ><code class="bg-blue-100 px-1 rounded">{'}}'}</code> - JSON validation instructions
                        </p>
                        <p class="mt-2"><strong>Automatic Injection:</strong></p>
                        <p>
                            • If <strong>any</strong> placeholder is found in your prompt, only those placeholders will be
                            replaced
                        </p>
                        <p>
                            • If <strong>no</strong> placeholders are found and this feature is enabled, all instruction
                            content will be automatically appended to the end of your prompt (as if
                            <code class="bg-blue-100 px-1 rounded">{'{{'}</code><code class="bg-blue-100 rounded"
                                >prompt-assistance</code
                            ><code class="bg-blue-100 px-1 rounded">{'}}'}</code> was placed at the very last line)
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <div class="flex-1 min-w-0">
            {#if instructions}
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <Label class="text-sm font-bold">Generated Agent Instructions</Label>
                        <div class="text-xs text-muted-foreground">
                            {instructions.split('\n').length} lines • {instructions.length} characters
                        </div>
                    </div>
                    <div class="hljs rounded-lg border bg-gray-900 p-4 text-sm font-mono">
                        <pre class="m-0 whitespace-pre-wrap break-words"><code>{@html highlightedInstructions}</code
                            ></pre>
                    </div>
                    <div class="text-xs text-muted-foreground">
                        This preview shows how the instructions will appear to the LLM after all placeholders are
                        resolved.
                    </div>
                </div>
            {:else}
                <div class="flex items-center justify-center h-48 border-2 border-dashed border-gray-300 rounded-lg">
                    <div class="text-center text-muted-foreground">
                        <div class="text-sm font-medium">No Instructions Generated</div>
                        <div class="text-xs mt-1">
                            Configure the settings on the left to see the generated instructions
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
{:else}
    <div class="text-sm text-muted-foreground italic">
        No configuration available. This feature may not be properly configured at the site level.
    </div>
{/if}
