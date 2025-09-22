<script lang="ts">
    import { BrushCleaning, Expand, Loader, Shrink } from '$icons/lucide';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import PikaAlert from '$ui/pika/pika-alert/pika-alert.svelte';
    import { Button } from '$ui/shadcn/button';
    import { ScrollArea } from '$ui/shadcn/scroll-area';
    import { Separator } from '$ui/shadcn/separator';
    import deepEqual from 'deep-equal';
    import type {
        ChatApp,
        ChatAppOverrideForCreateOrUpdate,
        UserChatAppRule,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext, type Snippet } from 'svelte';
    import AccessControl from '../components/chat-apps/access-control/access-control.svelte';
    import BasicSettings from '../components/chat-apps/basic-settings.svelte';
    import Features from '../components/chat-apps/features/features.svelte';
    import LeftNav from '../components/chat-apps/left-nav.svelte';
    import Titlebar from '../components/chat-apps/titlebar.svelte';
    import ValidationErrorBanner from '../components/validation-error-banner.svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    let showRemoveOverrideAlertDialog = $state(false);
    let showResetToSavedVersionAlertDialog = $state(false);
    let showClearChatAppCacheAlertDialog = $state(false);

    interface Props {
        pageHeaderRight: Snippet<[]> | undefined;
    }

    let { pageHeaderRight = $bindable() }: Props = $props();

    // Local state
    let selectedChatApp = $state<ChatApp | undefined>(undefined);
    let selectedChatAppValid = $state(true);
    let selectedChatAppForEditing = $state<ChatApp | undefined>(undefined);
    let isSaving = $state(false);
    let isClearingChatAppCache = $derived(siteAdmin.siteAdminOperationInProgress.clearConverseLambdaCache);

    let isDirty = $derived.by(() => {
        const original = selectedChatApp;
        const forEditing = selectedChatAppForEditing;

        if (!forEditing || !original) {
            return false;
        }

        // For fair comparison, normalize both objects the same way
        const normalizedOriginal = original; //normalizeChatApp(original);
        const dirty = !deepEqual(normalizedOriginal, forEditing);

        // Debug logging for isDirty calculation (simplified)
        // console.log('isDirty calculation:', {
        //     chatAppId: original.chatAppId,
        //     hasOverride: !!original.override,
        //     isDirty: dirty,
        // });

        // Log differences if dirty (for ongoing debugging)
        // if (dirty) {
        //     console.log('Chat app is dirty - user has made changes');
        // console.log('original:', JSON.stringify(original, null, 2));
        // console.log('forEditing:', JSON.stringify(forEditing, null, 2));
        // }

        return dirty;
    });

    // Section collapse state
    let expandedSections = $state({
        basic: false,
        access: false,
        features: false,
        homepage: false,
    });

    const chatApps = $derived(siteAdmin.chatApps);
    const siteFeatures = $derived(siteAdmin.siteFeatures);

    // Determine if we're in override mode
    let isOverrideMode = $derived(!!selectedChatAppForEditing?.override);

    let selectedAppToShow = $derived(isOverrideMode ? selectedChatAppForEditing : selectedChatApp);

    // Helper function to normalize chat app for consistent comparison
    // function normalizeChatApp(chatApp: ChatApp): ChatApp {
    //     const normalized = JSON.parse(JSON.stringify(chatApp));

    //     // If chat app has an override, ensure it has consistent properties
    //     // that child components expect to prevent auto-initialization
    //     if (normalized.override) {
    //         // Initialize properties that components might auto-add
    //         if (normalized.userTypes === undefined) {
    //             normalized.userTypes = normalized.override.userTypes || [];
    //         }
    //         if (normalized.userRoles === undefined) {
    //             normalized.userRoles = normalized.override.userRoles || [];
    //         }
    //         if (normalized.applyRulesAs === undefined) {
    //             normalized.applyRulesAs = normalized.override.applyRulesAs || 'and';
    //         }
    //     }

    //     return normalized;
    // }

    // Watch for selected chat app changes
    $effect(() => {
        if (selectedChatApp) {
            selectedChatAppForEditing = JSON.parse(JSON.stringify(selectedChatApp));
            siteAdmin.sendSiteAdminCommand({
                command: 'getInstructionAssistanceConfigFromSsm',
            });
            siteAdmin.sendSiteAdminCommand({
                command: 'getAgent',
                agentId: selectedChatApp.agentId,
            });
        } else {
            selectedChatAppForEditing = undefined;
        }
    });

    function setValid(valid: boolean) {
        if (selectedChatApp) {
            selectedChatAppValid = valid;
        }
    }

    function resetToSavedVersion(dontPrompt?: boolean) {
        if (!selectedChatApp) return;

        if (!dontPrompt) {
            showResetToSavedVersionAlertDialog = true;
            return;
        }

        selectedChatAppForEditing = JSON.parse(JSON.stringify(selectedChatApp));
    }

    function setInitialOverride() {
        if (!selectedChatApp || !selectedChatAppForEditing) return;

        const clonedChatApp = JSON.parse(JSON.stringify(selectedChatAppForEditing));

        // Clone the linksToChatApps.userChatAppRules
        let homePageFilterRules: UserChatAppRule[] | undefined;
        if (siteFeatures?.homePage?.linksToChatApps?.userChatAppRules) {
            homePageFilterRules = JSON.parse(JSON.stringify(siteFeatures.homePage.linksToChatApps.userChatAppRules));
        }

        // Create override with all current values (from the original chat app)
        const initialOverride: ChatAppOverrideForCreateOrUpdate = {
            enabled: clonedChatApp.enabled,
            userTypes: clonedChatApp.userTypes,
            userRoles: clonedChatApp.userRoles,
            applyRulesAs: clonedChatApp.applyRulesAs,
            title: clonedChatApp.title,
            description: clonedChatApp.description,
            dontCacheThis: clonedChatApp.dontCacheThis,
            features: clonedChatApp.features,
            exclusiveExternalAccessControl: undefined, // These are override-only fields
            exclusiveInternalAccessControl: undefined,
            exclusiveUserIdAccessControl: undefined,
            homePageFilterRules,
        };

        selectedChatAppForEditing.override = initialOverride;
    }

    function removeOverride(dontPrompt?: boolean) {
        if (!selectedChatApp || !selectedChatAppForEditing) return;

        if (!dontPrompt) {
            showRemoveOverrideAlertDialog = true;
            return;
        }

        selectedChatAppForEditing = JSON.parse(JSON.stringify(selectedChatApp)) as ChatApp;
        selectedChatAppForEditing.override = undefined;
    }

    function clearChatAppCache(dontPrompt?: boolean) {
        if (!selectedChatApp) return;

        if (!dontPrompt) {
            showClearChatAppCacheAlertDialog = true;
            return;
        }

        if (selectedChatApp) {
            siteAdmin.sendSiteAdminCommand({
                command: 'clearConverseLambdaCache',
                cacheType: 'agent',
                agentId: selectedChatApp.agentId,
            });
        }
    }

    async function handleSave() {
        if (!selectedChatApp || !selectedChatAppForEditing || !isDirty) return;

        // Case 1: Creating or updating an override
        if (selectedChatAppForEditing.override && isOverrideMode) {
            isSaving = true;
            try {
                await siteAdmin.sendSiteAdminCommand({
                    command: 'createOrUpdateChatAppOverride',
                    userId: appState.identity.user.userId,
                    chatAppId: selectedChatApp.chatAppId,
                    override: selectedChatAppForEditing.override,
                });
            } catch (error) {
                console.error('Error saving chat app override', error);
                //TODO: show an error toast
            } finally {
                isSaving = false;
            }
        }
        // Case 2: Deleting an override (original had one, but editing version doesn't)
        else if (selectedChatApp.override && !selectedChatAppForEditing.override) {
            isSaving = true;
            try {
                await siteAdmin.sendSiteAdminCommand({
                    command: 'deleteChatAppOverride',
                    chatAppId: selectedChatApp.chatAppId,
                });
            } catch (error) {
                console.error('Error deleting chat app override', error);
                //TODO: show an error toast
            } finally {
                isSaving = false;
            }
        }
    }

    // Section collapse functions
    function toggleSection(sectionKey: keyof typeof expandedSections) {
        expandedSections[sectionKey] = !expandedSections[sectionKey];
    }

    function expandAllSections() {
        expandedSections = {
            basic: true,
            access: true,
            features: true,
            homepage: true,
        };
    }

    function collapseAllSections() {
        expandedSections = {
            basic: false,
            access: false,
            features: false,
            homepage: false,
        };
    }

    $effect(() => {
        setTimeout(() => {
            siteAdmin.setPageHeaderRight(pageHeaderRightSnippet);
        }, 1);
    });
</script>

<div class="flex min-h-full">
    <LeftNav {chatApps} {selectedChatApp} onSelectChatApp={(chatApp) => (selectedChatApp = chatApp)} />

    <!-- Right Panel - Configuration -->
    <div class="flex-1 flex flex-col">
        {#if selectedAppToShow && selectedChatAppForEditing && selectedChatApp}
            <Titlebar
                selectedChatApp={selectedAppToShow}
                {isOverrideMode}
                onSetInitialOverride={setInitialOverride}
                onRemoveOverride={() => removeOverride(false)}
            />

            <ScrollArea class="flex-1">
                <div class="p-6 space-y-8 pt-8">
                    <!-- Validation Error Banner -->
                    <ValidationErrorBanner visible={!selectedChatAppValid} />

                    <!-- Basic Settings -->
                    <BasicSettings
                        bind:chatApp={selectedChatAppForEditing}
                        chatAppOriginal={selectedChatApp}
                        {isOverrideMode}
                        expanded={expandedSections.basic}
                        onToggleSection={() => toggleSection('basic')}
                        disabled={isSaving}
                    />

                    <Separator />

                    <AccessControl
                        bind:chatApp={selectedChatAppForEditing}
                        chatAppOriginal={selectedChatApp}
                        {isOverrideMode}
                        accessExpanded={expandedSections.access}
                        onToggleAccessSection={() => toggleSection('access')}
                        chatAppId={selectedChatApp.chatAppId}
                        {setValid}
                        disabled={isSaving}
                    />

                    <Separator />

                    <Features
                        bind:chatApp={selectedChatAppForEditing}
                        chatAppOriginal={selectedChatApp}
                        agent={!selectedChatApp
                            ? undefined
                            : siteAdmin.agents.find((a) => a.agentId === selectedChatApp?.agentId)}
                        {isOverrideMode}
                        featuresExpanded={expandedSections.features}
                        onToggleFeaturesSection={() => toggleSection('features')}
                        chatAppId={selectedChatApp.chatAppId}
                        {setValid}
                        disabled={isSaving}
                    />

                    <Separator />

                    <!-- Home Page Settings -->
                    <!-- <ConfigSection
                        title="Home Page Settings"
                        expanded={expandedSections.homepage}
                        onToggle={() => toggleSection('homepage')}
                    >
                        <div class="space-y-4">
                            <div class="p-4 border rounded bg-muted/20">
                                <p class="text-sm text-muted-foreground">
                                    Home page visibility is controlled by the filter rules below.
                                    {#if homePageFilterRules.length > 0}
                                        Custom rules are configured (will show on home page).
                                    {:else}
                                        Using site default rules.
                                    {/if}
                                </p>
                            </div>

                            <div>
                                <Label>Home Page Filter Rules</Label>
                                <div class="mt-2 p-4 border rounded bg-muted/20">
                                    <p class="text-sm text-muted-foreground">
                                        {#if homePageFilterRules.length > 0}
                                            {homePageFilterRules.length} rule(s) configured
                                        {:else}
                                            No custom home page filter rules (using site defaults)
                                        {/if}
                                    </p>
                                    <Button size="sm" variant="outline" class="mt-2" disabled={!isOverrideMode}>
                                        <Plus class="w-4 h-4 mr-1" />
                                        Configure Rules
                                    </Button>
                                </div>
                                {#if isOverridden('homePageFilterRules')}
                                    <p class="text-xs text-muted-foreground mt-1">
                                        Site Default: {getOriginalValue('homePageFilterRules')?.length || 0} rule(s)
                                    </p>
                                {/if}
                            </div>
                        </div>
                    </ConfigSection> -->
                </div>
            </ScrollArea>
        {:else}
            <div class="flex-1 flex items-center justify-center">
                <div class="text-center">
                    <h2 class="text-xl font-semibold text-muted-foreground">Select a Chat App</h2>
                    <p class="text-muted-foreground">
                        Choose a chat app from the left sidebar to configure its settings
                    </p>
                </div>
            </div>
        {/if}
    </div>
</div>

{#snippet pageHeaderRightSnippet()}
    {#if selectedChatApp}
        <div class="flex items-center">
            <!-- Section collapse controls -->
            <div class="flex items-center gap-1 mr-2">
                <Button variant="ghost" size="icon" onclick={expandAllSections}>
                    <Expand class="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onclick={collapseAllSections}>
                    <Shrink class="w-4 h-4" />
                </Button>
            </div>

            <Separator orientation="vertical" class="h-6" />

            <Button
                variant="ghost"
                size="icon"
                class="mr-2 ml-2"
                onclick={() => {
                    clearChatAppCache();
                }}
            >
                <BrushCleaning class="w-4 h-4" />
            </Button>

            {#if isClearingChatAppCache}
                <Loader class="mr-2 w-4 h-4 animate-spin text-muted-foreground" />
            {/if}

            <Separator orientation="vertical" class="h-6 mr-4" />
            <div class="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onclick={() => resetToSavedVersion()}
                    disabled={!isDirty || !isOverrideMode || isSaving}
                >
                    Reset
                </Button>
                <Button
                    variant="default"
                    size="sm"
                    onclick={handleSave}
                    disabled={(() => {
                        const disabled =
                            !isDirty ||
                            !selectedChatAppValid ||
                            (!isOverrideMode && !selectedChatApp?.override) ||
                            isSaving;

                        return disabled;
                    })()}
                >
                    Save
                </Button>

                {#if isSaving}
                    <Loader class="w-4 h-4 animate-spin text-muted-foreground" />
                {/if}
            </div>
        </div>
    {/if}
{/snippet}

<PikaAlert
    title="Remove Override"
    description="Are you sure you want to remove the override and revert to the original chat app settings? If you have unsaved changes, they will be lost."
    bind:open={showRemoveOverrideAlertDialog}
    ok={{
        label: 'Remove',
        onClick: () => {
            removeOverride(true);
        },
    }}
    cancel={{ showCancel: true, label: 'Cancel', onClick: () => (showRemoveOverrideAlertDialog = false) }}
/>

<PikaAlert
    title="Reset to Saved Version"
    description="Are you sure you want to reset to the saved version? If you have unsaved changes, they will be lost."
    bind:open={showResetToSavedVersionAlertDialog}
    ok={{
        label: 'Reset',
        onClick: () => {
            resetToSavedVersion(true);
        },
    }}
    cancel={{ showCancel: true, label: 'Cancel', onClick: () => (showResetToSavedVersionAlertDialog = false) }}
/>

<PikaAlert
    title="Clear Chat App Cache"
    description="Clear this chat app from the server cache? "
    bind:open={showClearChatAppCacheAlertDialog}
    ok={{
        label: 'Clear',
        onClick: () => {
            clearChatAppCache(true);
        },
    }}
    cancel={{ showCancel: true, label: 'Cancel', onClick: () => (showClearChatAppCacheAlertDialog = false) }}
/>
