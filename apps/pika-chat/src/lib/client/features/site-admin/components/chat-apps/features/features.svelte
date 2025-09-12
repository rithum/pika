<script lang="ts">
    import { ChevronDown, Expand, Shrink } from '$icons/lucide';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { PikaBadge } from '$ui/pika/pika-badge';
    import { Badge } from '$ui/shadcn/badge';
    import { Checkbox } from '$ui/shadcn/checkbox';
    import { Label } from '$ui/shadcn/label';
    import { Separator } from '$ui/shadcn/separator';
    import { FEATURE_NAMES, VerifyResponseClassificationDescriptions } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import ConfigSection from '../../config-section.svelte';

    import type {
        AgentDefinition,
        AgentInstructionAssistanceFeature,
        AgentInstructionAssistanceFeatureForChatApp,
        ChatApp,
        ChatAppFeature,
        ChatDisclaimerNoticeFeatureForChatApp,
        FeatureIdType,
        FileUploadFeature,
        FileUploadFeatureForChatApp,
        LogoutFeatureForChatApp,
        PromptInputFieldLabelFeature,
        PromptInputFieldLabelFeatureForChatApp,
        InstructionAugmentationFeatureForChatApp,
        SessionInsightsFeatureForChatApp,
        SuggestionsFeature,
        SuggestionsFeatureForChatApp,
        TagDefinitionLite,
        TagsFeatureForChatApp,
        TracesFeatureForChatApp,
        UiCustomizationFeature,
        UiCustomizationFeatureForChatApp,
        VerifyResponseFeatureForChatApp,
    } from 'pika-shared/types/chatbot/chatbot-types';
    // Import individual feature components
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import Button from '$ui/shadcn/button/button.svelte';
    import { assert } from '$lib/utils';
    import ChatDisclaimerNoticeFeatureRenderer from './chat-disclaimer-notice-feature-renderer.svelte';
    import FileUploadFeatureRenderer from './file-upload-feature-renderer.svelte';
    import LogoutFeatureRenderer from './logout-feature-renderer.svelte';
    import PromptInputFieldLabelFeatureRenderer from './prompt-input-field-label-feature-renderer.svelte';
    import InstructionAugmentationFeatureRenderer from './instruction-augmentation-feature-renderer.svelte';
    import SuggestionsFeatureRenderer from './suggestions-feature-renderer.svelte';
    import TagsFeatureRenderer from './tags-feature-renderer.svelte';
    import TracesFeatureRenderer from './traces-feature-renderer.svelte';
    import UiCustomizationFeatureRenderer from './ui-customization-feature-renderer.svelte';
    import VerifyResponseFeatureRenderer from './verify-response-feature-renderer.svelte';
    import SessionInsightsFeatureRenderer from './session-insights-feature-renderer.svelte';
    import AgentInstructionAssistanceFeatureRenderer from './agent-instruction-assistance-feature-renderer.svelte';

    interface Props {
        chatApp: ChatApp;
        chatAppOriginal: ChatApp;
        agent: AgentDefinition | undefined;
        isOverrideMode: boolean;
        featuresExpanded: boolean;
        onToggleFeaturesSection: () => void;
        chatAppId: string;
        setValid: (valid: boolean) => void;
        disabled: boolean;
    }

    let {
        chatApp = $bindable(),
        chatAppOriginal,
        agent,
        isOverrideMode,
        featuresExpanded,
        onToggleFeaturesSection,
        chatAppId,
        setValid,
        disabled,
    }: Props = $props();

    const appState = getContext<AppState>('appState');

    const featureValid = $state<Partial<Record<FeatureIdType, boolean>>>({});

    const tagsToUse = $derived.by(() => {
        const tags: TagDefinitionLite[] = [];

        const originalTagsFeature = chatApp.features?.tags as TagsFeatureForChatApp | undefined;
        const overriddenTagsFeature = chatApp.override?.features?.tags as TagsFeatureForChatApp | undefined;
        const isEnabled = isOverrideMode ? overriddenTagsFeature?.enabled : originalTagsFeature?.enabled;

        if (isEnabled) {
            const tagsEnabled = isOverrideMode ? overriddenTagsFeature?.tagsEnabled : originalTagsFeature?.tagsEnabled;
            if (tagsEnabled) {
                tags.push(...tagsEnabled);
            }
        }

        return tags;
    });

    // Phase 2: Site-level feature status tracking
    const siteFeatureStatus = $derived.by(() => {
        const status: Record<FeatureIdType, 'enabled' | 'disabled' | 'not-configured'> = {} as Record<
            FeatureIdType,
            'enabled' | 'disabled' | 'not-configured'
        >;

        Object.keys(FEATURE_NAMES).forEach((featureId) => {
            const typedFeatureId = featureId as FeatureIdType;
            const siteFeature = appState.siteAdmin.siteFeatures?.[typedFeatureId];

            if (!siteFeature) {
                status[typedFeatureId] = 'not-configured';
            } else if ('enabled' in siteFeature && siteFeature.enabled === false) {
                status[typedFeatureId] = 'disabled';
            } else {
                status[typedFeatureId] = 'enabled';
            }
        });

        return status;
    });

    // Phase 2: Invalid chat app configuration detection
    const invalidChatAppFeatures = $derived.by(() => {
        const invalid: Record<FeatureIdType, boolean> = {} as Record<FeatureIdType, boolean>;

        Object.keys(FEATURE_NAMES).forEach((featureId) => {
            const typedFeatureId = featureId as FeatureIdType;
            const chatAppFeature = chatAppOriginal.features?.[typedFeatureId];
            const siteStatus = siteFeatureStatus[typedFeatureId];

            // Chat app has feature enabled but site doesn't allow it
            invalid[typedFeatureId] = !!(
                chatAppFeature?.enabled &&
                (siteStatus === 'disabled' || siteStatus === 'not-configured')
            );
        });

        return invalid;
    });

    const enabledButNoUsersHaveAccess = $derived.by(() => {
        const result: Record<FeatureIdType, boolean> = {} as Record<FeatureIdType, boolean>;
        const accessControlFeatures = ['verifyResponse', 'traces', 'logout'] as FeatureIdType[];

        Object.keys(FEATURE_NAMES).forEach((featureId) => {
            const typedFeatureId = featureId as FeatureIdType;
            const hasAccessControl = accessControlFeatures.includes(typedFeatureId);

            if (!hasAccessControl) {
                result[typedFeatureId] = false;
                return;
            }

            const siteStatus = siteFeatureStatus[typedFeatureId];
            const canBeEnabled = siteStatus === 'enabled';
            const app = isOverrideMode ? chatApp : chatAppOriginal;
            const featureEnabled =
                canBeEnabled &&
                (app.override?.features?.[typedFeatureId]?.enabled ??
                    chatAppOriginal.features?.[typedFeatureId]?.enabled ??
                    true);

            const featureOverridden = app.override?.features?.[typedFeatureId] !== undefined;
            const originalFeature =
                chatAppOriginal.features?.[typedFeatureId] ?? appState.siteAdmin.siteFeatures?.[typedFeatureId];
            const effectiveFeature = featureOverridden ? app.override?.features?.[typedFeatureId] : originalFeature;

            // Check if feature is enabled but no users have access (secure by default)
            result[typedFeatureId] = !!(
                hasAccessControl &&
                featureEnabled &&
                effectiveFeature &&
                // Check if BOTH userTypes and userRoles are missing or empty (secure by default)
                (!('userTypes' in effectiveFeature) ||
                    !effectiveFeature.userTypes ||
                    effectiveFeature.userTypes.length === 0) &&
                (!('userRoles' in effectiveFeature) ||
                    !effectiveFeature.userRoles ||
                    effectiveFeature.userRoles.length === 0)
            );
        });

        return result;
    });

    const app = $derived(isOverrideMode ? chatApp : chatAppOriginal);

    // Track which features have errors
    const featuresHaveErrors = $derived(
        Object.entries(featureValid).some(([, valid]) => valid === false) ||
            Object.entries(enabledButNoUsersHaveAccess).some(([, enabled]) => enabled === true) ||
            Object.entries(invalidChatAppFeatures).some(([, invalid]) => invalid === true)
    );

    function setFeatureValid(featureId: FeatureIdType, valid: boolean) {
        featureValid[featureId] = valid;
    }

    // Effect to compute overall validation state and notify parent
    $effect(() => {
        const allFeatureIds = Object.keys(FEATURE_NAMES) as FeatureIdType[];

        const hasErrors = allFeatureIds.some((featureId) => {
            // Check for explicit feature validation errors
            if (featureValid[featureId] === false) {
                return true;
            }

            // Check for invalid chat app configurations
            if (invalidChatAppFeatures[featureId] === true) {
                return true;
            }

            // Check for enabled features with no user access
            if (enabledButNoUsersHaveAccess[featureId] === true) {
                return true;
            }

            return false;
        });

        setValid(!hasErrors);
    });

    // Expanded state for individual features
    let expandedFeatures = $state<Record<FeatureIdType, boolean>>({
        fileUpload: false,
        promptInputFieldLabel: false,
        instructionAugmentation: false,
        suggestions: false,
        uiCustomization: false,
        verifyResponse: false,
        traces: false,
        chatDisclaimerNotice: false,
        logout: false,
        agentInstructionAssistance: false,
    } as Record<FeatureIdType, boolean>);

    function setExpandedOrCollapsed(expanded: boolean) {
        const keys: FeatureIdType[] = Object.keys(expandedFeatures) as FeatureIdType[];
        keys.forEach((featureId) => {
            expandedFeatures[featureId] = expanded;
        });
    }

    function setFeatureEnabled(featureId: FeatureIdType, enabled: boolean) {
        assert(isOverrideMode, 'isOverrideMode must be true');
        assert(chatApp.override, 'chatApp.override must be defined');

        // Phase 2: Check if site allows this feature
        const siteStatus = siteFeatureStatus[featureId];

        if (enabled && siteStatus !== 'enabled') {
            // Don't allow enabling features not enabled at site level
            console.warn(`Cannot enable feature ${featureId}: not enabled at site level (status: ${siteStatus})`);
            return;
        }

        if (!chatApp.override.features) {
            chatApp.override.features = {};
        }

        // If already set to this value, do nothing
        if (chatApp.override.features[featureId]?.enabled === enabled) {
            return;
        }

        const originalFeature = chatAppOriginal.override?.features?.[featureId];

        // In override mode, always create the override with the specified value
        // The admin explicitly wants to set this feature to the chosen state
        chatApp.override.features[featureId] = {
            featureId,
            ...originalFeature,
            enabled,
        } as ChatAppFeature;

        if (enabled && !expandedFeatures[featureId]) {
            expandedFeatures[featureId] = true;
        }
    }

    function toggleFeatureExpanded(featureId: FeatureIdType) {
        expandedFeatures[featureId] = !expandedFeatures[featureId];
    }

    // function cleanupFeaturesAfterReset() {
    //     if (!isOverrideMode) return;

    //     if (!chatApp.override) {
    //         return;
    //     }

    //     const currentFeatures = chatApp.override.features ?? {};
    //     // let hasChanges = false;

    //     // Remove any features that match the original
    //     Object.keys(currentFeatures).forEach((featureId) => {
    //         const typedFeatureId = featureId as FeatureIdType;
    //         const currentFeature = currentFeatures[typedFeatureId];
    //         const originalFeature = chatAppOriginal.override?.features?.[typedFeatureId];

    //         if (deepEqual(originalFeature, currentFeature)) {
    //             delete currentFeatures[typedFeatureId];
    //             // hasChanges = true;
    //         }
    //     });

    //     // if (hasChanges) {
    //     //     chatApp.override.features = currentFeatures;
    //     // }
    // }

    // Clean up features after they're updated from parent reset
    // $effect(() => {
    //     if (isOverrideMode) {
    //         cleanupFeaturesAfterReset();
    //     }
    // });
</script>

<ConfigSection
    title="Features"
    expanded={featuresExpanded}
    onToggle={onToggleFeaturesSection}
    hasErrors={featuresHaveErrors}
>
    <div class="space-y-6">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-1">
                <p class="text-sm text-muted-foreground">Configure which features are enabled for this chat app.</p>
                <PopupHelp popoverClasses="max-w-[500px] text-xs text-muted-foreground">
                    <div class="space-y-3">
                        <p>There are 3 levels of configuration for features:</p>
                        <ul class="list-disc list-inside ml-2">
                            <li>Site: Enabled/Disabled in pika-config.ts</li>
                            <li>Chat App: Disabled/configured in chat app configuration</li>
                            <li>Admin: Disabled/configured in admin override</li>
                        </ul>
                        <p>
                            A feature must be enabled at the site level to be available to chat apps and admins to
                            configure. A feature enabled at the site level may be disabled by either the chat app or
                            admin.
                        </p>
                        <p>
                            Chat App configuration is defined when a Chat App is deployed by the engineer that defined
                            it. The chat app configuration takes precedence over the site configuration.
                        </p>
                        <p>
                            The admin override takes precedence over the site and chat app configuration. This is useful
                            when an admin wants to change a feature for a chat app, e.g. to make it available to only
                            certain external users.
                        </p>
                    </div>
                </PopupHelp>
            </div>
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
                {@const siteStatus = siteFeatureStatus[typedFeatureId]}
                {@const isInvalidChatAppConfig = invalidChatAppFeatures[typedFeatureId]}
                {@const canBeEnabled = siteStatus === 'enabled'}
                {@const featureEnabled =
                    canBeEnabled &&
                    (app.override?.features?.[typedFeatureId]?.enabled ??
                        chatAppOriginal.features?.[typedFeatureId]?.enabled ??
                        true)}
                {@const featureOverridden = app.override?.features?.[typedFeatureId] !== undefined}
                {@const originalFeature =
                    chatAppOriginal.features?.[typedFeatureId] ?? appState.siteAdmin.siteFeatures?.[typedFeatureId]}
                {@const noUsersHaveAccess = enabledButNoUsersHaveAccess[typedFeatureId]}

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
                                    disabled={!isOverrideMode || !canBeEnabled || disabled}
                                    class={featureOverridden ? 'border-orange-500' : ''}
                                    onclick={(e) => e.stopPropagation()}
                                />
                                <div>
                                    <Label for="feature-{featureId}" class="font-medium">{featureName}</Label>
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

                            {#if noUsersHaveAccess}
                                <PikaBadge
                                    variant="destructive"
                                    class="text-xs"
                                    help="ENABLED but no users have access\nThis feature is enabled but has no userTypes or userRoles specified. Due to Pika's secure-by-default design, this means no users can actually access this feature.\n\nTo fix this:\n• Add at least one userType (e.g., 'internal-user', 'external-user')\n• OR add at least one userRole\n• OR disable the feature if not needed\n\nWithout access control configuration, the feature is effectively disabled even though it appears enabled."
                                >
                                    No Users Have Access
                                </PikaBadge>
                            {/if}

                            <!-- Status badge with complete hierarchy explanation -->
                            {#if isInvalidChatAppConfig}
                                <PikaBadge
                                    variant="destructive"
                                    class="text-xs"
                                    help={siteStatus === 'not-configured'
                                        ? "INVALID CONFIG: Chat app enabled but site not configured\n\nHierarchy:\n• Site: Not configured (pika-config.ts)\n• Chat App: Enabled (invalid!)\n• Admin Override: None\n\nThe chat app has this feature enabled, but it's not configured at the site level.\nAdd this feature to your site configuration or disable it in the chat app."
                                        : "INVALID CONFIG: Chat app enabled but site disabled\n\nHierarchy:\n• Site: Disabled (pika-config.ts)\n• Chat App: Enabled (invalid!)\n• Admin Override: None\n\nThe chat app has this feature enabled, but it's disabled at the site level.\nEither enable the feature at the site level or disable it in the chat app configuration."}
                                >
                                    Invalid Config: Disabled
                                </PikaBadge>
                            {:else if siteStatus === 'not-configured'}
                                <PikaBadge
                                    variant="secondary"
                                    class="text-xs"
                                    help="This feature is not configured at the site level in pika-config.ts and is therefore disabled by default.\nAdd this feature to your site configuration to turn on the feature and make it available to chat apps and admins to configure."
                                >
                                    Site: Not Configured
                                </PikaBadge>
                            {:else}
                                <PikaBadge
                                    variant={'secondary'}
                                    class="text-xs"
                                    help={featureEnabled
                                        ? featureOverridden
                                            ? `ENABLED by admin override\n\nHierarchy:\n• Site: ${siteStatus === 'enabled' ? 'Enabled' : 'Disabled'} (pika-config.ts)\n• Chat App: ${originalFeature === undefined ? 'Not configured' : originalFeature.enabled ? 'Enabled' : 'Disabled'}\n• Admin Override: Enabled (takes precedence)\n\nUsers with appropriate permissions can access this feature.`
                                            : originalFeature?.enabled === true
                                              ? `ENABLED by chat app configuration\n\nHierarchy:\n• Site: ${siteStatus === 'enabled' ? 'Enabled' : 'Disabled'} (pika-config.ts)\n• Chat App: Enabled (takes precedence)\n• Admin Override: None\n\nUsers with appropriate permissions can access this feature.`
                                              : `ENABLED by site default\n\nHierarchy:\n• Site: Enabled (pika-config.ts)\n• Chat App: Not configured\n• Admin Override: None\n\nFeature is enabled by default since site allows it and no restrictions are applied.`
                                        : featureOverridden
                                          ? `DISABLED by admin override\n\nHierarchy:\n• Site: ${siteStatus === 'enabled' ? 'Enabled' : 'Disabled'} (pika-config.ts)\n• Chat App: ${originalFeature === undefined ? 'Not configured' : originalFeature.enabled ? 'Enabled' : 'Disabled'}\n• Admin Override: Disabled (takes precedence)\n\nUsers cannot access this feature due to admin override.`
                                          : originalFeature?.enabled === false
                                            ? `DISABLED by chat app configuration\n\nHierarchy:\n• Site: Enabled (pika-config.ts)\n• Chat App: Disabled (takes precedence)\n• Admin Override: None\n\nUsers cannot access this feature due to chat app configuration.`
                                            : `DISABLED by site level\n\nHierarchy:\n• Site: Disabled (pika-config.ts)\n• Chat App: Not applicable\n• Admin Override: Not applicable\n\nFeature is disabled at the site level and cannot be enabled by chat apps or admins.`}
                                >
                                    {featureEnabled ? 'Enabled' : 'Disabled'}
                                </PikaBadge>
                            {/if}

                            <ChevronDown
                                class="w-4 h-4 transition-transform {expandedFeatures[typedFeatureId]
                                    ? ''
                                    : '-rotate-90'}"
                            />
                        </div>
                    </div>

                    <!-- Feature Configuration (when expanded) -->
                    <Separator />
                    <div class="p-4" class:hidden={!expandedFeatures[typedFeatureId]}>
                        {#if typedFeatureId === 'fileUpload'}
                            <FileUploadFeatureRenderer
                                {featureEnabled}
                                bind:overriddenFeature={
                                    () =>
                                        app.override?.features?.[typedFeatureId] as
                                            | FileUploadFeatureForChatApp
                                            | undefined,
                                    (feat) => {
                                        if (!feat) {
                                            if (chatApp.override && chatApp.override.features) {
                                                delete chatApp.override.features[typedFeatureId];
                                            }
                                            return;
                                        }

                                        assert(isOverrideMode, 'isOverrideMode must be true');
                                        assert(chatApp.override, 'chatApp.override must be defined');
                                        if (!chatApp.override.features) {
                                            chatApp.override.features = {};
                                        }

                                        if (feat) {
                                            chatApp.override.features[typedFeatureId] = feat;
                                        }
                                    }
                                }
                                originalFeature={originalFeature as FileUploadFeature}
                                {isOverrideMode}
                                isOverridden={featureOverridden}
                                {disabled}
                                setValid={(valid: boolean) => setFeatureValid(typedFeatureId, valid)}
                            />
                        {:else if typedFeatureId === 'sessionInsights'}
                            <SessionInsightsFeatureRenderer
                                {featureEnabled}
                                isOverridden={featureOverridden}
                                bind:overriddenFeature={
                                    () =>
                                        app.override?.features?.[typedFeatureId] as
                                            | SessionInsightsFeatureForChatApp
                                            | undefined,
                                    (feat) => {
                                        if (!feat) {
                                            if (chatApp.override && chatApp.override.features) {
                                                delete chatApp.override.features[typedFeatureId];
                                            }
                                            return;
                                        }
                                    }
                                }
                                originalFeature={originalFeature as SessionInsightsFeatureForChatApp}
                                {isOverrideMode}
                            />
                        {:else if typedFeatureId === 'promptInputFieldLabel'}
                            <PromptInputFieldLabelFeatureRenderer
                                {featureEnabled}
                                {disabled}
                                bind:overriddenFeature={
                                    () =>
                                        app.override?.features?.[typedFeatureId] as
                                            | PromptInputFieldLabelFeatureForChatApp
                                            | undefined,
                                    (feat) => {
                                        if (!feat) {
                                            if (chatApp.override && chatApp.override.features) {
                                                delete chatApp.override.features[typedFeatureId];
                                            }
                                            return;
                                        }

                                        assert(isOverrideMode, 'isOverrideMode must be true');
                                        assert(chatApp.override, 'chatApp.override must be defined');
                                        if (!chatApp.override.features) {
                                            chatApp.override.features = {};
                                        }

                                        if (feat) {
                                            chatApp.override.features[typedFeatureId] = feat;
                                        }
                                    }
                                }
                                originalFeature={originalFeature as PromptInputFieldLabelFeature}
                                {isOverrideMode}
                                isOverridden={featureOverridden}
                                {chatAppId}
                            />
                        {:else if typedFeatureId === 'instructionAugmentation'}
                            <InstructionAugmentationFeatureRenderer
                                {featureEnabled}
                                {disabled}
                                bind:overriddenFeature={
                                    () =>
                                        app.override?.features?.[typedFeatureId] as
                                            | InstructionAugmentationFeatureForChatApp
                                            | undefined,
                                    (feat) => {
                                        if (!feat) {
                                            if (chatApp.override && chatApp.override.features) {
                                                delete chatApp.override.features[typedFeatureId];
                                            }
                                            return;
                                        }

                                        assert(isOverrideMode, 'isOverrideMode must be true');
                                        assert(chatApp.override, 'chatApp.override must be defined');
                                        if (!chatApp.override.features) {
                                            chatApp.override.features = {};
                                        }

                                        if (feat) {
                                            chatApp.override.features[typedFeatureId] = feat;
                                        }
                                    }
                                }
                                originalFeature={originalFeature as InstructionAugmentationFeatureForChatApp}
                                {isOverrideMode}
                                isOverridden={featureOverridden}
                                {chatAppId}
                            />
                        {:else if typedFeatureId === 'suggestions'}
                            <SuggestionsFeatureRenderer
                                {featureEnabled}
                                {disabled}
                                bind:overriddenFeature={
                                    () =>
                                        app.override?.features?.[typedFeatureId] as
                                            | SuggestionsFeatureForChatApp
                                            | undefined,
                                    (feat) => {
                                        if (!feat) {
                                            if (chatApp.override && chatApp.override.features) {
                                                delete chatApp.override.features[typedFeatureId];
                                            }
                                            return;
                                        }

                                        assert(isOverrideMode, 'isOverrideMode must be true');
                                        assert(chatApp.override, 'chatApp.override must be defined');
                                        if (!chatApp.override.features) {
                                            chatApp.override.features = {};
                                        }

                                        if (feat) {
                                            chatApp.override.features[typedFeatureId] = feat;
                                        }
                                    }
                                }
                                originalFeature={originalFeature as SuggestionsFeature}
                                {isOverrideMode}
                                isOverridden={featureOverridden}
                                {chatAppId}
                            />
                        {:else if typedFeatureId === 'tags'}
                            <TagsFeatureRenderer
                                {featureEnabled}
                                {disabled}
                                bind:overriddenFeature={
                                    () => app.override?.features?.[typedFeatureId] as TagsFeatureForChatApp | undefined,
                                    (feat) => {
                                        if (!feat) {
                                            if (chatApp.override && chatApp.override.features) {
                                                delete chatApp.override.features[typedFeatureId];
                                            }
                                            return;
                                        }

                                        assert(isOverrideMode, 'isOverrideMode must be true');
                                        assert(chatApp.override, 'chatApp.override must be defined');
                                        if (!chatApp.override.features) {
                                            chatApp.override.features = {};
                                        }

                                        if (feat) {
                                            chatApp.override.features[typedFeatureId] = feat;
                                        }
                                    }
                                }
                                originalFeature={originalFeature as TagsFeatureForChatApp}
                                {isOverrideMode}
                                isOverridden={featureOverridden}
                                {chatAppId}
                            />
                        {:else if typedFeatureId === 'uiCustomization'}
                            <UiCustomizationFeatureRenderer
                                {featureEnabled}
                                {disabled}
                                bind:overriddenFeature={
                                    () =>
                                        app.override?.features?.[typedFeatureId] as
                                            | UiCustomizationFeatureForChatApp
                                            | undefined,
                                    (feat) => {
                                        if (!feat) {
                                            if (chatApp.override && chatApp.override.features) {
                                                delete chatApp.override.features[typedFeatureId];
                                            }
                                            return;
                                        }

                                        assert(isOverrideMode, 'isOverrideMode must be true');
                                        assert(chatApp.override, 'chatApp.override must be defined');
                                        if (!chatApp.override.features) {
                                            chatApp.override.features = {};
                                        }

                                        if (feat) {
                                            chatApp.override.features[typedFeatureId] = feat;
                                        }
                                    }
                                }
                                originalFeature={originalFeature as UiCustomizationFeature}
                                {isOverrideMode}
                                isOverridden={featureOverridden}
                                {chatAppId}
                            />
                        {:else if typedFeatureId === 'verifyResponse'}
                            <VerifyResponseFeatureRenderer
                                {featureEnabled}
                                {disabled}
                                bind:overriddenFeature={
                                    () =>
                                        app.override?.features?.[typedFeatureId] as
                                            | VerifyResponseFeatureForChatApp
                                            | undefined,
                                    (feat) => {
                                        if (!feat) {
                                            if (chatApp.override && chatApp.override.features) {
                                                delete chatApp.override.features[typedFeatureId];
                                            }
                                            return;
                                        }

                                        assert(isOverrideMode, 'isOverrideMode must be true');
                                        assert(chatApp.override, 'chatApp.override must be defined');

                                        if (!chatApp.override.features) {
                                            chatApp.override.features = {};
                                        }

                                        if (feat) {
                                            chatApp.override.features[typedFeatureId] = feat;
                                        }
                                    }
                                }
                                originalFeature={originalFeature as VerifyResponseFeatureForChatApp}
                                {isOverrideMode}
                                isOverridden={featureOverridden}
                                {chatAppId}
                                setValid={(valid: boolean) => setFeatureValid(typedFeatureId, valid)}
                            />
                        {:else if typedFeatureId === 'traces'}
                            <TracesFeatureRenderer
                                {featureEnabled}
                                {disabled}
                                bind:overriddenFeature={
                                    () =>
                                        app.override?.features?.[typedFeatureId] as TracesFeatureForChatApp | undefined,
                                    (feat) => {
                                        if (!feat) {
                                            if (chatApp.override && chatApp.override.features) {
                                                delete chatApp.override.features[typedFeatureId];
                                            }
                                            return;
                                        }

                                        assert(isOverrideMode, 'isOverrideMode must be true');
                                        assert(chatApp.override, 'chatApp.override must be defined');
                                        if (!chatApp.override.features) {
                                            chatApp.override.features = {};
                                        }

                                        if (feat) {
                                            chatApp.override.features[typedFeatureId] = feat;
                                        }
                                    }
                                }
                                originalFeature={originalFeature as TracesFeatureForChatApp}
                                {isOverrideMode}
                                isOverridden={featureOverridden}
                                {chatAppId}
                                setValid={(valid: boolean) => setFeatureValid(typedFeatureId, valid)}
                            />
                        {:else if typedFeatureId === 'chatDisclaimerNotice'}
                            <ChatDisclaimerNoticeFeatureRenderer
                                {featureEnabled}
                                {disabled}
                                bind:overriddenFeature={
                                    () =>
                                        app.override?.features?.[typedFeatureId] as
                                            | ChatDisclaimerNoticeFeatureForChatApp
                                            | undefined,
                                    (feat) => {
                                        if (!feat) {
                                            if (chatApp.override && chatApp.override.features) {
                                                delete chatApp.override.features[typedFeatureId];
                                            }
                                            return;
                                        }

                                        assert(isOverrideMode, 'isOverrideMode must be true');
                                        assert(chatApp.override, 'chatApp.override must be defined');
                                        if (!chatApp.override.features) {
                                            chatApp.override.features = {};
                                        }
                                        if (feat) {
                                            chatApp.override.features[typedFeatureId] = feat;
                                        }
                                    }
                                }
                                originalFeature={originalFeature as ChatDisclaimerNoticeFeatureForChatApp}
                                {isOverrideMode}
                                isOverridden={featureOverridden}
                                {chatAppId}
                            />
                        {:else if typedFeatureId === 'logout'}
                            <LogoutFeatureRenderer
                                {featureEnabled}
                                {disabled}
                                bind:overriddenFeature={
                                    () =>
                                        app.override?.features?.[typedFeatureId] as LogoutFeatureForChatApp | undefined,
                                    (feat) => {
                                        if (!feat) {
                                            if (chatApp.override && chatApp.override.features) {
                                                delete chatApp.override.features[typedFeatureId];
                                            }
                                            return;
                                        }

                                        assert(isOverrideMode, 'isOverrideMode must be true');
                                        assert(chatApp.override, 'chatApp.override must be defined');
                                        if (!chatApp.override.features) {
                                            chatApp.override.features = {};
                                        }
                                        if (feat) {
                                            chatApp.override.features[typedFeatureId] = feat;
                                        }
                                    }
                                }
                                originalFeature={originalFeature as LogoutFeatureForChatApp}
                                {isOverrideMode}
                                isOverridden={featureOverridden}
                                {chatAppId}
                                setValid={(valid: boolean) => setFeatureValid(typedFeatureId, valid)}
                            />
                        {:else if typedFeatureId === 'agentInstructionAssistance'}
                            <AgentInstructionAssistanceFeatureRenderer
                                {featureEnabled}
                                {disabled}
                                {agent}
                                {tagsToUse}
                                bind:overriddenFeature={
                                    () =>
                                        app.override?.features?.[typedFeatureId] as
                                            | AgentInstructionAssistanceFeatureForChatApp
                                            | undefined,
                                    (feat) => {
                                        if (!feat) {
                                            if (chatApp.override && chatApp.override.features) {
                                                delete chatApp.override.features[typedFeatureId];
                                            }
                                            return;
                                        }

                                        assert(isOverrideMode, 'isOverrideMode must be true');
                                        assert(chatApp.override, 'chatApp.override must be defined');
                                        if (!chatApp.override.features) {
                                            chatApp.override.features = {};
                                        }

                                        if (feat) {
                                            chatApp.override.features[typedFeatureId] = feat;
                                        }
                                    }
                                }
                                originalFeature={originalFeature as AgentInstructionAssistanceFeature}
                                {isOverrideMode}
                                isOverridden={featureOverridden}
                                setValid={(valid: boolean) => setFeatureValid(typedFeatureId, valid)}
                            />
                        {:else if typedFeatureId === 'userDataOverrides'}
                            <div>No additional configuration may be overridden for this feature.</div>
                        {/if}
                    </div>
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
    {:else if featureId === 'sessionInsights'}
        <p class="text-xs text-muted-foreground">Automatically collect session insights for each chat session.</p>
    {:else if featureId === 'promptInputFieldLabel'}
        <p class="text-xs text-muted-foreground mb-2">Defaults to "Ready to chat" when enabled but no label is set.</p>
        <p class="text-xs text-muted-foreground">
            When a user creates a new session and hasn't asked the first question yet, the input field label appears
            above the chat input field, bringing balance to the visual appearance and a welcoming message to get them
            going.
        </p>
    {:else if featureId === 'instructionAugmentation'}
        <div class="space-y-2">
            <p class="text-xs text-muted-foreground">
                Automatically augments prompts sent to agents with additional contextual information to improve response
                quality and relevance.
            </p>
            <p class="text-xs text-muted-foreground">
                <span class="font-bold">LLM Semantic Directive Search:</span> Uses the scope of the agent invocation (chat
                app ID, agent ID, entity ID) to search for semantic directives in a database of canned semantic directives
                that match the invocation scope. The LLM then evaluates the user's message against these directives to determine
                which should be included in the prompt.
            </p>
            <p class="text-xs text-muted-foreground">
                This feature helps ensure that agents have access to relevant contextual instructions and guidelines
                specific to the current chat app and entity context.
            </p>
        </div>
    {:else if featureId === 'suggestions'}
        <p class="text-xs text-muted-foreground">
            Suggestions appear as an expandable section above the chat input field allowing a user to click on a
            suggestion and have it added to the chat input field.
        </p>
    {:else if featureId === 'tags'}
        <div class="space-y-2">
            <p class="text-xs text-muted-foreground">
                Enable AI-driven UI components (tags) that can be dynamically rendered within chat responses. Tags allow
                the LLM to create contextual, interactive user interfaces on-demand.
            </p>
            <p class="text-xs text-muted-foreground">
                <span class="font-bold">Tag definitions</span> must be created by site administrators before they can be
                enabled for chat apps. Each tag specifies how to render interactive widgets like charts, forms, or custom
                components.
            </p>
            <p class="text-xs text-muted-foreground">
                Once enabled, the LLM can include tags in its responses to display data visualizations, collect user
                input, or render any custom UI component defined by the tag definition.
            </p>
        </div>
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
    {:else if featureId === 'agentInstructionAssistance'}
        <div class="space-y-2">
            <p class="text-xs text-muted-foreground">
                Automatically injects formatting instructions into agent prompts to ensure consistent response
                structure. This feature streamlines prompt engineering by managing output formatting requirements and
                tag-specific instructions.
            </p>
            <p class="text-xs text-muted-foreground">
                <span class="font-bold">Placeholder Options:</span> Use <code>{'{{'}</code><code>prompt-assistance</code
                ><code>{'}}'}</code> for all instruction content in one place, or individual placeholders like
                <code>{'{{'}</code><code>tag-instructions</code><code>{'}}'}</code>, <code>{'{{'}</code><code
                    >output-formatting-requirements</code
                ><code>{'}}'}</code>, etc. for fine-grained control.
            </p>
            <p class="text-xs text-muted-foreground">
                <span class="font-bold">Consistent Formatting:</span> Ensures all responses are properly wrapped in
                <code>&lt;answer&gt;</code> tags and follow Pika's structured formatting standards.
            </p>
        </div>
    {:else}
        <p class="text-xs text-muted-foreground">Configure the {featureId} for the chat app.</p>
    {/if}
{/snippet}
