<script lang="ts">
    import { Plus, RotateCcw, Save } from '$icons/lucide';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { Button } from '$lib/components/ui/button';
    import { Label } from '$lib/components/ui/label';
    import { ScrollArea } from '$lib/components/ui/scroll-area';
    import { Separator } from '$lib/components/ui/separator';
    import type {
        ApplyRulesAs,
        ChatApp,
        ChatAppFeature,
        ChatAppOverride,
        ChatAppOverrideForCreateOrUpdate,
        FeatureIdType,
        UserChatAppRule,
        UserRole,
        UserType,
    } from '@pika/shared/types/chatbot/chatbot-types';
    import deepEqual from 'deep-equal';
    import { getContext, type Snippet } from 'svelte';
    import AccessControl from '../components/chat-apps/access-control/access-control.svelte';
    import BasicSettings from '../components/chat-apps/basic-settings.svelte';
    import Features from '../components/chat-apps/features/features.svelte';
    import LeftNav from '../components/chat-apps/left-nav.svelte';
    import Titlebar from '../components/chat-apps/titlebar.svelte';
    import ConfigSection from '../components/config-section.svelte';
    import ValidationErrorBanner from '../components/validation-error-banner.svelte';
    import { assert } from '$lib/utils';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    interface Props {
        pageHeaderRight: Snippet<[]> | undefined;
    }

    let { pageHeaderRight = $bindable() }: Props = $props();

    // Local state
    let selectedChatApp = $state<ChatApp | undefined>(undefined);
    let editedOverride = $state<Partial<ChatAppOverride>>({});
    let selectedChatAppValid = $state(true);
    let selectedChatAppForEditing = $state<ChatApp | undefined>(undefined);

    let isDirty = $derived.by(() => {
        const original = selectedChatApp;
        const forEditing = selectedChatAppForEditing;
        return forEditing && original && !deepEqual(original, forEditing);
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
    const isOverrideMode = $derived(!!selectedChatApp?.override);

    let selectedAppToShow = $derived(isOverrideMode ? selectedChatAppForEditing : selectedChatApp);

    // Helper function to ensure userTypes is never empty (defaults to internal-user)
    function ensureNonEmptyUserTypes(types: UserType[]): UserType[] {
        if (types.length === 0) {
            return ['internal-user'];
        }
        return types;
    }

    // Watch for selected chat app changes
    $effect(() => {
        if (selectedChatApp) {
            selectedChatAppForEditing = JSON.parse(JSON.stringify(selectedChatApp));
        } else {
            selectedChatAppForEditing = undefined;
        }
    });

    function setValid(valid: boolean) {
        if (selectedChatApp) {
            selectedChatAppValid = valid;
        }
    }

    function resetFormData() {
        if (!selectedChatApp) return;
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
            userTypes: ensureNonEmptyUserTypes(clonedChatApp.userTypes || []),
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

        selectedChatApp.override = initialOverride;
    }

    function removeOverride() {
        if (!selectedChatApp || !selectedChatAppForEditing) return;
        selectedChatAppForEditing.override = undefined;
    }

    async function handleSave() {
        if (!selectedChatApp || !isDirty || !isOverrideMode) return;

        // TODO: Implement save functionality
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

<div class="flex h-full">
    <LeftNav {chatApps} {selectedChatApp} onSelectChatApp={(chatApp) => (selectedChatApp = chatApp)} />

    <!-- Right Panel - Configuration -->
    <div class="flex-1 flex flex-col">
        {#if selectedAppToShow && selectedChatAppForEditing && selectedChatApp}
            <Titlebar
                selectedChatApp={selectedAppToShow}
                {isOverrideMode}
                onSetInitialOverride={setInitialOverride}
                onRemoveOverride={removeOverride}
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
                    />

                    <Separator />

                    <AccessControl
                        bind:chatApp={selectedChatAppForEditing}
                        chatAppOriginal={selectedChatApp}
                        {isOverrideMode}
                        accessExpanded={expandedSections.access}
                        onToggleAccessSection={() => toggleSection('access')}
                        chatAppId={selectedChatApp.chatAppId}
                    />

                    <Separator />

                    <!-- <Features
                        bind:features
                        bind:enabled
                        {isOverrideMode}
                        featuresExpanded={expandedSections.features}
                        {isOverridden}
                        originalFeatures={getOriginalValue('features') || {}}
                        onToggleFeaturesSection={() => toggleSection('features')}
                        chatAppId={selectedChatApp.chatAppId}
                        {setValid}
                    /> -->

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
        <div class="flex items-center gap-2">
            <!-- Section collapse controls -->
            <div class="flex items-center gap-1 mr-2">
                <Button variant="ghost" size="sm" onclick={expandAllSections}>Expand All</Button>
                <Button variant="ghost" size="sm" onclick={collapseAllSections}>Collapse All</Button>
            </div>

            <!-- Save/Reset controls (only in override mode) -->
            {#if isOverrideMode}
                <Separator orientation="vertical" class="h-6" />
                <Button variant="outline" size="sm" onclick={() => resetFormData()} disabled={!isDirty}>
                    <RotateCcw class="w-4 h-4 mr-1" />
                    Reset
                </Button>
                <Button variant="default" size="sm" onclick={handleSave} disabled={!isDirty || !selectedChatAppValid}>
                    <Save class="w-4 h-4 mr-1" />
                    Save Changes
                </Button>
            {/if}
        </div>
    {/if}
{/snippet}
