<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { FEATURE_NAMES, VerifyResponseClassificationDescriptions } from '@pika/shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import ConfigSection from '../../config-section.svelte';
    import { Badge } from '$lib/components/ui/badge';
    import { Label } from '$lib/components/ui/label';
    import { Checkbox } from '$lib/components/ui/checkbox';
    import { Separator } from '$lib/components/ui/separator';
    import { ChevronDown, Expand, Shrink } from '$icons/lucide';

    import type {
        ChatAppFeature,
        ChatDisclaimerNoticeFeatureForChatApp,
        FeatureIdType,
        FileUploadFeature,
        LogoutFeatureForChatApp,
        PromptInputFieldLabelFeature,
        SuggestionsFeature,
        TracesFeatureForChatApp,
        UiCustomizationFeature,
        VerifyResponseFeature,
        VerifyResponseFeatureForChatApp,
    } from '@pika/shared/types/chatbot/chatbot-types';

    // Import individual feature components
    import FileUploadFeatureRenderer from './file-upload-feature-renderer.svelte';
    import PromptInputFieldLabelFeatureRenderer from './prompt-input-field-label-feature-renderer.svelte';
    import SuggestionsFeatureRenderer from './suggestions-feature-renderer.svelte';
    import UiCustomizationFeatureRenderer from './ui-customization-feature-renderer.svelte';
    import VerifyResponseFeatureRenderer from './verify-response-feature-renderer.svelte';
    import TracesFeatureRenderer from './traces-feature-renderer.svelte';
    import ChatDisclaimerNoticeFeatureRenderer from './chat-disclaimer-notice-feature-renderer.svelte';
    import LogoutFeatureRenderer from './logout-feature-renderer.svelte';
    import PopupHelp from '$lib/components/ui-pika/popup-help/popup-help.svelte';
    import Button from '$lib/components/ui/button/button.svelte';

    interface Props {
        features: Partial<Record<FeatureIdType, ChatAppFeature>>;
        enabled: boolean;
        isOverrideMode: boolean;
        featuresExpanded: boolean;
        isOverridden: (field: string) => boolean;
        originalFeatures: Partial<Record<FeatureIdType, ChatAppFeature>>;
        onToggleFeaturesSection: () => void;
        chatAppId: string;
        setValid: (valid: boolean) => void;
    }

    let {
        features = $bindable(),
        enabled = $bindable(),
        isOverrideMode,
        featuresExpanded,
        isOverridden,
        originalFeatures,
        onToggleFeaturesSection,
        chatAppId,
        setValid,
    }: Props = $props();

    const appState = getContext<AppState>('appState');

    const featureValid = $state<Partial<Record<FeatureIdType, boolean>>>({});

    // Track which features have errors
    const featuresHaveErrors = $derived(Object.entries(featureValid).some(([, valid]) => valid === false));

    function setFeatureValid(featureId: FeatureIdType, valid: boolean) {
        featureValid[featureId] = valid;

        setValid(Object.values(featureValid).every((valid) => valid));
    }

    // Expanded state for individual features
    let expandedFeatures = $state<Record<FeatureIdType, boolean>>({
        fileUpload: false,
        promptInputFieldLabel: false,
        suggestions: false,
        uiCustomization: false,
        verifyResponse: false,
        traces: false,
        chatDisclaimerNotice: false,
        logout: false,
    } as Record<FeatureIdType, boolean>);

    function setExpandedOrCollapsed(expanded: boolean) {
        const keys: FeatureIdType[] = Object.keys(expandedFeatures) as FeatureIdType[];
        keys.forEach((featureId) => {
            expandedFeatures[featureId] = expanded;
        });
    }

    function isFeatureEnabled(featureId: FeatureIdType): boolean {
        // Check current features first, then fall back to original, then default
        const currentFeatures = features || {};
        const origFeatures = originalFeatures || {};
        return currentFeatures[featureId]?.enabled ?? origFeatures[featureId]?.enabled ?? false;
    }

    function isFeatureOverridden(featureId: FeatureIdType): boolean {
        // A feature is overridden if it exists in the current features object
        const currentFeatures = features || {};
        return currentFeatures[featureId] !== undefined;
    }

    function getOriginalFeature(featureId: FeatureIdType): ChatAppFeature | undefined {
        const origFeatures = originalFeatures || {};
        return origFeatures[featureId];
    }

    // function toggleFeature(featureId: FeatureIdType) {
    //     if (!isOverrideMode) return;

    //     const currentFeatures = { ...(features || {}) };

    //     if (currentFeatures[featureId]) {
    //         // Feature is currently overridden, remove the override
    //         delete currentFeatures[featureId];
    //     } else {
    //         // Feature is not overridden, create an override
    //         const originalFeature = originalFeatures?.[featureId];
    //         const defaultEnabled = DEFAULT_FEATURE_ENABLED_VALUE[featureId];

    //         // Create a basic feature object with just the enabled flag toggled
    //         currentFeatures[featureId] = {
    //             featureId,
    //             enabled: !isFeatureEnabled(featureId), // Toggle from current state
    //             ...originalFeature, // Preserve any existing configuration
    //         } as ChatAppFeature;
    //     }

    //     features = currentFeatures;
    // }

    function setFeatureEnabled(featureId: FeatureIdType, enabled: boolean) {
        if (!isOverrideMode) return;

        console.log('setFeatureEnabled', featureId, enabled);
        if (features[featureId]?.enabled === enabled) return;

        const originalFeature = originalFeatures?.[featureId];
        const originalEnabled = originalFeature?.enabled ?? false;

        // If setting to match original, remove from override entirely
        if (enabled === originalEnabled) {
            delete features[featureId];
            return;
        }

        // Otherwise, create/update the override
        features[featureId] = {
            featureId,
            enabled,
            ...originalFeature,
        } as ChatAppFeature;

        if (enabled && !expandedFeatures[featureId]) {
            expandedFeatures[featureId] = true;
        }
    }

    function toggleFeatureExpanded(featureId: FeatureIdType) {
        expandedFeatures[featureId] = !expandedFeatures[featureId];
    }

    function cleanupFeaturesAfterReset() {
        if (!isOverrideMode) return;

        const currentFeatures = { ...features };
        let hasChanges = false;

        // Remove any features that match the original
        Object.keys(currentFeatures).forEach((featureId) => {
            const typedFeatureId = featureId as FeatureIdType;
            const currentFeature = currentFeatures[typedFeatureId];
            const originalFeature = originalFeatures?.[typedFeatureId];

            if (JSON.stringify(currentFeature) === JSON.stringify(originalFeature)) {
                delete currentFeatures[typedFeatureId];
                hasChanges = true;
            }
        });

        if (hasChanges) {
            features = currentFeatures;
        }
    }

    // Clean up features after they're updated from parent reset
    $effect(() => {
        if (isOverrideMode) {
            cleanupFeaturesAfterReset();
        }
    });
</script>

<ConfigSection
    title="Features"
    expanded={featuresExpanded}
    onToggle={onToggleFeaturesSection}
    hasErrors={featuresHaveErrors}
>
    <div class="space-y-6">
        <div class="flex items-center justify-between">
            <p class="text-sm text-muted-foreground">Configure which features are enabled for this chat app.</p>
            <div class="flex items-center">
                <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => {
                        setExpandedOrCollapsed(true);
                    }}
                >
                    <Expand class="w-4 h-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => {
                        setExpandedOrCollapsed(false);
                    }}
                >
                    <Shrink class="w-4 h-4" />
                </Button>
            </div>
        </div>

        <div class="space-y-4">
            {#each Object.entries(FEATURE_NAMES) as [featureId, featureName]}
                {@const typedFeatureId = featureId as FeatureIdType}
                {@const featureEnabled = isFeatureEnabled(typedFeatureId)}
                {@const featureOverridden = isFeatureOverridden(typedFeatureId)}
                {@const originalFeature = getOriginalFeature(typedFeatureId)}

                <div class="border rounded-lg">
                    <!-- Feature Header -->
                    <div
                        class="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                        onclick={() => toggleFeatureExpanded(typedFeatureId)}
                        onkeydown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleFeatureExpanded(typedFeatureId);
                            }
                        }}
                        tabindex="0"
                        role="button"
                        aria-expanded={expandedFeatures[typedFeatureId]}
                        aria-label="Toggle {featureName} configuration"
                    >
                        <div class="flex items-center space-x-2">
                            <div class="flex items-center space-x-3">
                                <Checkbox
                                    id="feature-{featureId}"
                                    bind:checked={
                                        () => featureEnabled,
                                        (featureEnabled) => setFeatureEnabled(typedFeatureId, featureEnabled)
                                    }
                                    disabled={!isOverrideMode}
                                    class={featureOverridden ? 'border-orange-500' : ''}
                                    onclick={(e) => e.stopPropagation()}
                                />
                                <div>
                                    <Label for="feature-{featureId}" class="font-medium">{featureName}</Label>
                                    {#if featureOverridden}
                                        <p class="text-xs text-muted-foreground">
                                            Original: {originalFeature?.enabled ? 'Enabled' : 'Disabled'}
                                        </p>
                                    {/if}
                                </div>
                            </div>
                            <PopupHelp popoverClasses="max-w-[500px]">
                                <div class="text-xs text-muted-foreground">
                                    {@render featureHelp(typedFeatureId)}
                                </div>
                            </PopupHelp>
                        </div>

                        <div class="flex items-center space-x-2">
                            {#if featureValid[typedFeatureId] === false}
                                <Badge variant="destructive" class="text-xs">Error</Badge>
                            {/if}

                            {#if featureOverridden}
                                <Badge variant="outline" class="text-xs border-orange-300 text-orange-700 bg-orange-50"
                                    >Overridden</Badge
                                >
                            {/if}

                            <Badge variant={featureEnabled ? 'default' : 'secondary'} class="text-xs">
                                {featureEnabled ? 'Enabled' : 'Disabled'}
                            </Badge>

                            <ChevronDown
                                class="w-4 h-4 transition-transform {expandedFeatures[typedFeatureId]
                                    ? ''
                                    : '-rotate-90'}"
                            />
                        </div>
                    </div>

                    <!-- Feature Configuration (when expanded) -->
                    {#if expandedFeatures[typedFeatureId]}
                        <Separator />
                        <div class="p-4">
                            {#if typedFeatureId === 'fileUpload'}
                                <FileUploadFeatureRenderer
                                    bind:overriddenFeature={features[typedFeatureId] as FileUploadFeature | undefined}
                                    originalFeature={originalFeature as FileUploadFeature}
                                    {isOverrideMode}
                                    isOverridden={featureOverridden}
                                    setValid={(valid: boolean) => setFeatureValid(typedFeatureId, valid)}
                                />
                            {:else if typedFeatureId === 'promptInputFieldLabel'}
                                <PromptInputFieldLabelFeatureRenderer
                                    bind:overriddenFeature={
                                        features[typedFeatureId] as PromptInputFieldLabelFeature | undefined
                                    }
                                    originalFeature={originalFeature as PromptInputFieldLabelFeature}
                                    {isOverrideMode}
                                    isOverridden={featureOverridden}
                                    {chatAppId}
                                />
                            {:else if typedFeatureId === 'suggestions'}
                                <SuggestionsFeatureRenderer
                                    bind:overriddenFeature={features[typedFeatureId] as SuggestionsFeature | undefined}
                                    originalFeature={originalFeature as SuggestionsFeature}
                                    {isOverrideMode}
                                    isOverridden={featureOverridden}
                                    {chatAppId}
                                />
                            {:else if typedFeatureId === 'uiCustomization'}
                                <UiCustomizationFeatureRenderer
                                    bind:overriddenFeature={
                                        features[typedFeatureId] as UiCustomizationFeature | undefined
                                    }
                                    originalFeature={originalFeature as UiCustomizationFeature}
                                    {isOverrideMode}
                                    isOverridden={featureOverridden}
                                    {chatAppId}
                                />
                            {:else if typedFeatureId === 'verifyResponse'}
                                <VerifyResponseFeatureRenderer
                                    bind:overriddenFeature={
                                        features[typedFeatureId] as VerifyResponseFeatureForChatApp | undefined
                                    }
                                    originalFeature={originalFeature as VerifyResponseFeatureForChatApp}
                                    {isOverrideMode}
                                    isOverridden={featureOverridden}
                                    {chatAppId}
                                />
                            {:else if typedFeatureId === 'traces'}
                                <TracesFeatureRenderer
                                    bind:overriddenFeature={
                                        features[typedFeatureId] as TracesFeatureForChatApp | undefined
                                    }
                                    originalFeature={originalFeature as TracesFeatureForChatApp}
                                    {isOverrideMode}
                                    isOverridden={featureOverridden}
                                    {chatAppId}
                                    setValid={(valid: boolean) => setFeatureValid(typedFeatureId, valid)}
                                />
                            {:else if typedFeatureId === 'chatDisclaimerNotice'}
                                <ChatDisclaimerNoticeFeatureRenderer
                                    bind:overriddenFeature={
                                        features[typedFeatureId] as ChatDisclaimerNoticeFeatureForChatApp | undefined
                                    }
                                    originalFeature={originalFeature as ChatDisclaimerNoticeFeatureForChatApp}
                                    {isOverrideMode}
                                    isOverridden={featureOverridden}
                                    {chatAppId}
                                />
                            {:else if typedFeatureId === 'logout'}
                                <LogoutFeatureRenderer
                                    bind:overriddenFeature={
                                        features[typedFeatureId] as LogoutFeatureForChatApp | undefined
                                    }
                                    originalFeature={originalFeature as LogoutFeatureForChatApp}
                                    {isOverrideMode}
                                    isOverridden={featureOverridden}
                                    {chatAppId}
                                />
                            {/if}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
</ConfigSection>

{#snippet featureHelp(featureId: FeatureIdType)}
    {#if featureId === 'fileUpload'}
        <p class="text-xs text-muted-foreground">
            If enabled, users can upload files to the chat app. You can configure which file types are allowed.
        </p>
    {:else if featureId === 'promptInputFieldLabel'}
        <p class="text-xs text-muted-foreground mb-2">Defaults to "Ready to chat" when enabled but no label is set.</p>
        <p class="text-xs text-muted-foreground">
            When a user creates a new session and hasn't asked the first question yet, the input field label appears
            above the chat input field, bringing balance to the visual appearance and a welcoming message to get them
            going.
        </p>
    {:else if featureId === 'suggestions'}
        <p class="text-xs text-muted-foreground">
            Suggestions appear as an expandable section above the chat input field allowing a user to click on a
            suggestion and have it added to the chat input field.
        </p>
    {:else if featureId === 'uiCustomization'}
        <p class="text-xs text-muted-foreground">General UI customizations for the chat app.</p>
    {:else if featureId === 'verifyResponse'}
        <div class="space-y-2">
            <p class="text-xs text-muted-foreground">
                After the AI answers a question but before that answer is returned to the user, this feature uses
                another AI to grade the response and if you turn it on, to ask the first AI to improve the response if
                the grade is below a certain threshold.
            </p>
            <p class="text-xs text-muted-foreground">
                If you enable the Verify Response feature, that means you intend to have Pika grade responses. This will
                not have an effect unless you select which users are allowed to use the feature.
            </p>
            <p class="text-xs text-muted-foreground">
                If you want Pika to use a second AI to try and improve the response when the grade is below the
                threshold, you must specify which threshold to use. If you don't want to use this feature, then you can
                leave the threshold blank.
            </p>
            <div class="text-xs text-muted-foreground">
                <span class="font-bold">Classifications:</span>
                <ul class="list-disc ml-4">
                    {#each Object.values(VerifyResponseClassificationDescriptions) as classification}
                        <li>
                            <span class="font-bold">{classification.label}</span>
                            <span class="text-muted-foreground font-mono">({classification.classification})</span>:
                            <span>{classification.description}</span>
                        </li>
                    {/each}
                </ul>
            </div>
        </div>
    {:else if featureId === 'traces'}
        <div class="space-y-2">
            <p class="text-xs text-muted-foreground">
                Traces provide insight into the reasoning process of the AI. Enabling Traces means you intend to allow
                some users access to at least basic traces.
            </p>
            <p class="text-xs text-muted-foreground">
                <span class="font-bold">Basic traces</span> are usually appropriate to share with external and non-technical
                users. You must specify which users are allowed to see basic traces.
            </p>
            <p class="text-xs text-muted-foreground">
                <span class="font-bold">Detailed traces</span> name the internal tools that were invoked by the AI and include
                the details of how these tools were invoked. Detailed traces are usually only appropriate for internal use.
                You must specify which users are allowed to see detailed traces.
            </p>
        </div>
    {:else if featureId === 'chatDisclaimerNotice'}
        <p class="text-xs text-muted-foreground">A notice that appears below the chat input field in small print.</p>
    {:else if featureId === 'logout'}
        <p class="text-xs text-muted-foreground">
            Whether to enable logout for the chat app. You must specify which users are allowed to logout.
        </p>
    {:else}
        <p class="text-xs text-muted-foreground">Configure the {featureId} for the chat app.</p>
    {/if}
{/snippet}
