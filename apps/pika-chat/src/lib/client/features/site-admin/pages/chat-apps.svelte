<script lang="ts">
    import { Plus, RotateCcw, Save } from '$icons/lucide';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { Badge } from '$lib/components/ui/badge';
    import { Button } from '$lib/components/ui/button';
    import { Checkbox } from '$lib/components/ui/checkbox';
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
    import { DEFAULT_FEATURE_ENABLED_VALUE, FEATURE_NAMES } from '@pika/shared/types/chatbot/chatbot-types';
    import { getContext, type Snippet } from 'svelte';
    import BasicSettings from '../components/chat-apps/basic-settings.svelte';
    import AccessControl from '../components/chat-apps/access-control/access-control.svelte';
    import LeftNav from '../components/chat-apps/left-nav.svelte';
    import Titlebar from '../components/chat-apps/titlebar.svelte';
    import ConfigSection from '../components/config-section.svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    interface Props {
        pageHeaderRight: Snippet<[]> | undefined;
    }

    let { pageHeaderRight = $bindable() }: Props = $props();

    // Local state
    let selectedChatApp = $state<ChatApp | null>(null);
    let editedOverride = $state<Partial<ChatAppOverride>>({});
    let isDirty = $state(false);

    // Reactive values for the forms
    let title = $state('');
    let description = $state('');
    let enabled = $state(true);
    let userTypes = $state<UserType[]>(['internal-user']); // Always include internal-user by default
    let userRoles = $state<UserRole[]>([]);
    let applyRulesAs = $state<ApplyRulesAs>('and');
    let exclusiveExternalAccessControl = $state<string[]>([]);
    let exclusiveInternalAccessControl = $state<string[]>([]);
    let exclusiveUserIdAccessControl = $state<string[]>([]);
    let homePageFilterRules = $state<UserChatAppRule[]>([]);
    let dontCacheThis = $state(false);
    let features = $state<Partial<Record<FeatureIdType, ChatAppFeature>>>({});

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
            resetFormData();
        }
    });

    // Watch for form changes to set dirty flag
    $effect(() => {
        if (selectedChatApp && isOverrideMode) {
            const hasChanges =
                title !== getEffectiveValue('title') ||
                description !== getEffectiveValue('description') ||
                enabled !== getEffectiveValue('enabled') ||
                dontCacheThis !== getEffectiveValue('dontCacheThis') ||
                JSON.stringify(userTypes) !== JSON.stringify(getEffectiveValue('userTypes')) ||
                JSON.stringify(userRoles) !== JSON.stringify(getEffectiveValue('userRoles')) ||
                applyRulesAs !== getEffectiveValue('applyRulesAs') ||
                JSON.stringify(exclusiveExternalAccessControl) !==
                    JSON.stringify(getEffectiveValue('exclusiveExternalAccessControl')) ||
                JSON.stringify(exclusiveInternalAccessControl) !==
                    JSON.stringify(getEffectiveValue('exclusiveInternalAccessControl')) ||
                JSON.stringify(exclusiveUserIdAccessControl) !==
                    JSON.stringify(getEffectiveValue('exclusiveUserIdAccessControl')) ||
                JSON.stringify(homePageFilterRules) !== JSON.stringify(getEffectiveValue('homePageFilterRules')) ||
                JSON.stringify(features) !== JSON.stringify(getEffectiveValue('features'));

            isDirty = hasChanges;
        } else {
            isDirty = false;
        }
    });

    function resetFormData() {
        if (!selectedChatApp) return;

        title = getEffectiveValue('title');
        description = getEffectiveValue('description');
        enabled = getEffectiveValue('enabled');
        dontCacheThis = getEffectiveValue('dontCacheThis');
        userTypes = ensureNonEmptyUserTypes([...(getEffectiveValue('userTypes') || [])]);
        userRoles = [...(getEffectiveValue('userRoles') || [])];
        applyRulesAs = getEffectiveValue('applyRulesAs') || 'and';
        exclusiveExternalAccessControl = [...(getEffectiveValue('exclusiveExternalAccessControl') || [])];
        exclusiveInternalAccessControl = [...(getEffectiveValue('exclusiveInternalAccessControl') || [])];
        exclusiveUserIdAccessControl = [...(getEffectiveValue('exclusiveUserIdAccessControl') || [])];
        homePageFilterRules = [...(getEffectiveValue('homePageFilterRules') || [])];
        features = { ...(getEffectiveValue('features') || {}) };

        isDirty = false;
    }

    function getEffectiveValue(field: string): any {
        if (!selectedChatApp) return undefined;

        // Special handling for homePageFilterRules - comes from siteFeatures if not overridden
        if (field === 'homePageFilterRules') {
            return (
                selectedChatApp.override?.homePageFilterRules ||
                siteFeatures?.homePage?.linksToChatApps?.userChatAppRules ||
                []
            );
        }

        // Special handling for userTypes - ensure it's never empty
        if (field === 'userTypes') {
            const types = (selectedChatApp.override?.userTypes ?? selectedChatApp.userTypes) as UserType[];
            return ensureNonEmptyUserTypes(types || []);
        }

        // For other fields, use override value if exists, otherwise original value
        return selectedChatApp.override?.[field as keyof ChatAppOverride] ?? selectedChatApp[field as keyof ChatApp];
    }

    function getOriginalValue(field: string): any {
        if (!selectedChatApp) return undefined;

        if (field === 'homePageFilterRules') {
            return siteFeatures?.homePage?.linksToChatApps?.userChatAppRules || [];
        }

        return selectedChatApp[field as keyof ChatApp];
    }

    function isOverridden(field: string): boolean {
        if (!selectedChatApp?.override) return false;

        return selectedChatApp.override[field as keyof ChatAppOverride] !== undefined;
    }

    function selectChatApp(chatApp: ChatApp) {
        selectedChatApp = chatApp;
    }

    function setInitialOverride() {
        if (!selectedChatApp) return;

        // Create override with all current values (from the original chat app)
        const initialOverride: ChatAppOverrideForCreateOrUpdate = {
            enabled: selectedChatApp.enabled,
            userTypes: ensureNonEmptyUserTypes(selectedChatApp.userTypes || []),
            userRoles: selectedChatApp.userRoles,
            applyRulesAs: selectedChatApp.applyRulesAs,
            title: selectedChatApp.title,
            description: selectedChatApp.description,
            dontCacheThis: selectedChatApp.dontCacheThis,
            features: selectedChatApp.features,
            exclusiveExternalAccessControl: undefined, // These are override-only fields
            exclusiveInternalAccessControl: undefined,
            exclusiveUserIdAccessControl: undefined,
            homePageFilterRules: siteFeatures?.homePage?.linksToChatApps?.userChatAppRules,
        };

        // For now, simulate the override being created by updating the local state
        // This will be replaced with actual API call
        selectedChatApp.override = initialOverride;

        // Reset form data to pick up the new override
        resetFormData();
    }

    function removeOverride() {
        if (!selectedChatApp) return;

        // TODO: Remove the override from the backend
        console.log('Removing override for chat app:', selectedChatApp.chatAppId);

        // For now, simulate the override being removed
        selectedChatApp.override = undefined;

        // Reset form data to show original values
        resetFormData();
    }

    async function handleSave() {
        if (!selectedChatApp || !isDirty || !isOverrideMode) return;

        // TODO: Implement save functionality
        console.log('Saving chat app override:', {
            chatAppId: selectedChatApp.chatAppId,
            override: {
                enabled,
                title: title !== getOriginalValue('title') ? title : undefined,
                description: description !== getOriginalValue('description') ? description : undefined,
                dontCacheThis: dontCacheThis !== getOriginalValue('dontCacheThis') ? dontCacheThis : undefined,
                features: Object.keys(features).length > 0 ? features : undefined,
                userTypes: userTypes.length > 0 ? ensureNonEmptyUserTypes(userTypes) : undefined,
                userRoles: userRoles.length > 0 ? userRoles : undefined,
                applyRulesAs,
                exclusiveExternalAccessControl:
                    exclusiveExternalAccessControl.length > 0 ? exclusiveExternalAccessControl : undefined,
                exclusiveInternalAccessControl:
                    exclusiveInternalAccessControl.length > 0 ? exclusiveInternalAccessControl : undefined,
                exclusiveUserIdAccessControl:
                    exclusiveUserIdAccessControl.length > 0 ? exclusiveUserIdAccessControl : undefined,
                homePageFilterRules: homePageFilterRules.length > 0 ? homePageFilterRules : undefined,
            },
        });

        // Reset dirty flag after save
        isDirty = false;
    }

    function handleReset() {
        resetFormData();
    }

    function toggleUserRole(userRole: UserRole) {
        if (userRoles.includes(userRole)) {
            userRoles = userRoles.filter((r) => r !== userRole);
        } else {
            userRoles = [...userRoles, userRole];
        }
    }

    function toggleFeature(featureId: FeatureIdType) {
        if (!isOverrideMode) return;

        const currentFeatures = { ...features };

        if (currentFeatures[featureId]) {
            // Feature is currently enabled, remove it (this will fall back to original/default)
            delete currentFeatures[featureId];
        } else {
            // Feature is not enabled, enable it with default configuration
            currentFeatures[featureId] = {
                featureId,
                enabled: true,
            } as ChatAppFeature;
        }

        features = currentFeatures;
    }

    function isFeatureEnabled(featureId: FeatureIdType): boolean {
        const effectiveFeatures = getEffectiveValue('features') || {};
        return effectiveFeatures[featureId]?.enabled ?? DEFAULT_FEATURE_ENABLED_VALUE[featureId];
    }

    function isFeatureOverridden(featureId: FeatureIdType): boolean {
        if (!selectedChatApp?.override?.features) return false;
        return featureId in selectedChatApp.override.features;
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
        siteAdmin.setPageHeaderRight(pageHeaderRightSnippet);
    });
</script>

<div class="flex h-full">
    <LeftNav {chatApps} {selectedChatApp} onSelectChatApp={selectChatApp} />

    <!-- Right Panel - Configuration -->
    <div class="flex-1 flex flex-col">
        {#if selectedChatApp}
            <Titlebar
                {selectedChatApp}
                {isOverrideMode}
                onSetInitialOverride={setInitialOverride}
                onRemoveOverride={removeOverride}
            />

            <ScrollArea class="flex-1">
                <div class="p-6 space-y-8 pt-8">
                    <!-- Basic Settings -->
                    <BasicSettings
                        {selectedChatApp}
                        bind:title
                        bind:description
                        bind:enabled
                        bind:dontCacheThis
                        {isOverrideMode}
                        expanded={expandedSections.basic}
                        {isOverridden}
                        {getOriginalValue}
                        onToggleSection={() => toggleSection('basic')}
                        onEnabledChange={(newEnabled) => (enabled = newEnabled)}
                    />

                    <Separator />

                    <AccessControl
                        bind:userTypes
                        bind:userRoles
                        bind:applyRulesAs
                        bind:enabled
                        bind:exclusiveExternalAccessControl
                        bind:exclusiveInternalAccessControl
                        bind:exclusiveUserIdAccessControl
                        {isOverrideMode}
                        accessExpanded={expandedSections.access}
                        {isOverridden}
                        {getOriginalValue}
                        onToggleAccessSection={() => toggleSection('access')}
                        chatAppId={selectedChatApp.chatAppId}
                    />

                    <Separator />

                    <!-- Features -->
                    <ConfigSection
                        title="Features"
                        expanded={expandedSections.features}
                        onToggle={() => toggleSection('features')}
                    >
                        <div class="space-y-4">
                            <p class="text-sm text-muted-foreground">
                                Configure which features are enabled for this chat app. Only features that differ from
                                the original settings are saved.
                            </p>

                            <div class="grid grid-cols-1 gap-4">
                                {#each Object.entries(FEATURE_NAMES) as [featureId, featureName]}
                                    {@const typedFeatureId = featureId as FeatureIdType}
                                    <div class="flex items-center justify-between p-3 border rounded-lg">
                                        <div class="flex items-center space-x-3">
                                            <Checkbox
                                                id="feature-{featureId}"
                                                checked={isFeatureEnabled(typedFeatureId)}
                                                disabled={!isOverrideMode}
                                                onchange={() => isOverrideMode && toggleFeature(typedFeatureId)}
                                                class={isFeatureOverridden(typedFeatureId) ? 'border-orange-500' : ''}
                                            />
                                            <div>
                                                <Label for="feature-{featureId}" class="font-medium"
                                                    >{featureName}</Label
                                                >
                                                {#if isFeatureOverridden(typedFeatureId)}
                                                    <p class="text-xs text-muted-foreground">
                                                        Original: {getOriginalValue('features')?.[typedFeatureId]
                                                            ?.enabled
                                                            ? 'Enabled'
                                                            : 'Disabled'}
                                                    </p>
                                                {/if}
                                            </div>
                                        </div>

                                        {#if isFeatureOverridden(typedFeatureId)}
                                            <Badge variant="destructive" class="text-xs">Overridden</Badge>
                                        {:else}
                                            <Badge variant="secondary" class="text-xs">Default</Badge>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </ConfigSection>

                    <Separator />

                    <!-- Home Page Settings -->
                    <ConfigSection
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
                    </ConfigSection>
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
                <Button variant="outline" size="sm" onclick={handleReset} disabled={!isDirty}>
                    <RotateCcw class="w-4 h-4 mr-1" />
                    Reset
                </Button>
                <Button variant="default" size="sm" onclick={handleSave} disabled={!isDirty}>
                    <Save class="w-4 h-4 mr-1" />
                    Save Changes
                </Button>
            {/if}
        </div>
    {/if}
{/snippet}
