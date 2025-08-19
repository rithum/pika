<script lang="ts">
    import { Checkbox } from '$ui/shadcn/checkbox';
    import { Input } from '$ui/shadcn/input';
    import { Label } from '$ui/shadcn/label';
    import { Textarea } from '$ui/shadcn/textarea';
    import { Separator } from '$ui/shadcn/separator';
    import type {
        AgentInstructionAssistanceFeature,
        AgentInstructionAssistanceFeatureForChatApp,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import { assert } from '$lib/utils';

    interface Props {
        featureEnabled: boolean;
        overriddenFeature?: AgentInstructionAssistanceFeatureForChatApp;
        originalFeature?: AgentInstructionAssistanceFeature;
        isOverrideMode: boolean;
        isOverridden: boolean;
        disabled: boolean;
        setValid?: (valid: boolean) => void;
    }

    let {
        featureEnabled,
        overriddenFeature = $bindable(),
        originalFeature,
        isOverrideMode,
        isOverridden,
        disabled,
        setValid,
    }: Props = $props();

    function ensureFeature(): AgentInstructionAssistanceFeatureForChatApp {
        if (!isOverrideMode) {
            throw new Error('AgentInstructionAssistanceFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'agentInstructionAssistance',
                enabled: originalFeature?.enabled ?? false,
                includeInstructionsForTags: originalFeature?.includeInstructionsForTags ?? true,
                completeExampleInstructionLine: {
                    enabled: originalFeature?.completeExampleInstructionLine?.enabled ?? true,
                    mdLine: originalFeature?.completeExampleInstructionLine?.mdLine,
                },
                jsonOnlyImperativeInstructionLine: {
                    enabled: originalFeature?.jsonOnlyImperativeInstructionLine?.enabled ?? true,
                    line:
                        originalFeature?.jsonOnlyImperativeInstructionLine?.line ??
                        'BE ABSOLUTELY CERTAIN ANY JSON INCLUDED IS 100% VALID (especially for charts). Invalid JSON will break the user experience.',
                },
            } as AgentInstructionAssistanceFeatureForChatApp;
        } else {
            // Ensure all optional fields exist with defaults
            if (overriddenFeature.includeInstructionsForTags === undefined) {
                overriddenFeature.includeInstructionsForTags = true;
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
                    line: 'BE ABSOLUTELY CERTAIN ANY JSON INCLUDED IS 100% VALID (especially for charts). Invalid JSON will break the user experience.',
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

    // Helper to get the effective feature for display
    const effectiveFeature = $derived(isOverrideMode && overriddenFeature ? overriddenFeature : originalFeature);
</script>

{#if !featureEnabled}
    <div class="text-sm text-muted-foreground italic">
        Feature is disabled. Enable the feature to configure instruction assistance settings.
    </div>
{:else if effectiveFeature}
    <div class="space-y-6">
        <!-- Include Instructions for Tags -->
        <div class="space-y-2">
            <Label class="text-sm font-medium">Tag Instructions Integration</Label>
            <div class="space-y-3 pl-4">
                <div class="flex items-center space-x-2">
                    <Checkbox
                        id="include-tag-instructions"
                        bind:checked={
                            () => effectiveFeature?.includeInstructionsForTags ?? true,
                            (checked) => {
                                if (isOverrideMode) {
                                    const feature = ensureFeature();
                                    feature.includeInstructionsForTags = checked;
                                }
                            }
                        }
                        {disabled}
                    />
                    <Label for="include-tag-instructions" class="text-sm">Include instructions for enabled tags</Label>
                </div>
                <p class="text-xs text-muted-foreground ml-6">
                    When enabled, the system will automatically inject LLM instructions for all enabled tags into the
                    agent prompt at the <code>{'{{'}</code><code>tag-instructions</code><code>{'}}'}</code> placeholder location.
                </p>
            </div>
        </div>

        <Separator />

        <!-- Complete Example Instruction Line -->
        <div class="space-y-2">
            <Label class="text-sm font-medium">Example Instruction Line</Label>
            <div class="space-y-3 pl-4">
                <div class="flex items-center space-x-2">
                    <Checkbox
                        id="complete-example-enabled"
                        bind:checked={
                            () => effectiveFeature?.completeExampleInstructionLine?.enabled ?? true,
                            (checked) => {
                                if (isOverrideMode) {
                                    const feature = ensureFeature();
                                    feature.completeExampleInstructionLine = feature.completeExampleInstructionLine || {
                                        enabled: true,
                                    };
                                    feature.completeExampleInstructionLine.enabled = checked;
                                }
                            }
                        }
                        {disabled}
                    />
                    <Label for="complete-example-enabled" class="text-sm">
                        Include complete example instruction line
                    </Label>
                </div>

                {#if effectiveFeature.completeExampleInstructionLine?.enabled}
                    <div class="space-y-2 ml-6">
                        <Label for="custom-example-line" class="text-xs font-medium">
                            Custom Example Line (optional)
                        </Label>
                        <Textarea
                            id="custom-example-line"
                            placeholder="Leave empty to use default example format"
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
                            class="min-h-20 text-xs font-mono"
                        />
                        <p class="text-xs text-muted-foreground">
                            If not specified, a default example will be generated showing proper tag usage structure.
                        </p>
                    </div>
                {/if}

                <p class="text-xs text-muted-foreground ml-6">
                    Provides a complete example showing proper <code>&lt;answer&gt;</code> tag structure and enabled tag
                    usage to help the LLM understand the expected format.
                </p>
            </div>
        </div>

        <Separator />

        <!-- JSON Validation Instruction Line -->
        <div class="space-y-2">
            <Label class="text-sm font-medium">JSON Validation Instructions</Label>
            <div class="space-y-3 pl-4">
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
                                            line: 'BE ABSOLUTELY CERTAIN ANY JSON INCLUDED IS 100% VALID (especially for charts). Invalid JSON will break the user experience.',
                                        };
                                    feature.jsonOnlyImperativeInstructionLine.enabled = checked;
                                }
                            }
                        }
                        {disabled}
                    />
                    <Label for="json-validation-enabled" class="text-sm">Include JSON validation imperative</Label>
                </div>

                {#if effectiveFeature.jsonOnlyImperativeInstructionLine?.enabled}
                    <div class="space-y-2 ml-6">
                        <Label for="json-validation-line" class="text-xs font-medium">Validation Message</Label>
                        <Textarea
                            id="json-validation-line"
                            bind:value={
                                () =>
                                    effectiveFeature?.jsonOnlyImperativeInstructionLine?.line ??
                                    'BE ABSOLUTELY CERTAIN ANY JSON INCLUDED IS 100% VALID (especially for charts). Invalid JSON will break the user experience.',
                                (value) => {
                                    if (isOverrideMode) {
                                        const feature = ensureFeature();
                                        feature.jsonOnlyImperativeInstructionLine =
                                            feature.jsonOnlyImperativeInstructionLine || { enabled: true, line: '' };
                                        feature.jsonOnlyImperativeInstructionLine.line = value;
                                    }
                                }
                            }
                            disabled={disabled || !isOverrideMode}
                            class="min-h-16 text-xs"
                        />
                        <p class="text-xs text-muted-foreground">
                            This critical instruction helps prevent malformed JSON that would break UI components like
                            charts.
                        </p>
                    </div>
                {/if}

                <p class="text-xs text-muted-foreground ml-6">
                    Adds strict JSON validation instructions to prevent malformed data from breaking the user
                    experience.
                </p>
            </div>
        </div>

        <!-- Information Section -->
        <div class="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div class="space-y-2">
                <h4 class="text-sm font-medium text-blue-900">How Agent Instruction Assistance Works</h4>
                <div class="space-y-1 text-xs text-blue-800">
                    <p>• Automatically injects "Output Formatting Requirements" into agent prompts</p>
                    <p>
                        • Uses <code class="bg-blue-100 px-1 rounded">{'{{'}</code><code
                            class="bg-blue-100 px-1 rounded">tag-instructions</code
                        ><code class="bg-blue-100 px-1 rounded">{'}}'}</code> placeholder to inject tag-specific instructions
                    </p>
                    <p>
                        • Ensures consistent response formatting with <code class="bg-blue-100 px-1 rounded"
                            >&lt;answer&gt;</code
                        > tags
                    </p>
                    <p>• Works with the Tags feature to provide contextual UI component instructions</p>
                </div>
            </div>
        </div>
    </div>
{:else}
    <div class="text-sm text-muted-foreground italic">
        No configuration available. This feature may not be properly configured at the site level.
    </div>
{/if}
