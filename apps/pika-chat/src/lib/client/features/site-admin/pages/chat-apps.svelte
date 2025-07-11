<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import List from '$lib/components/ui-pika/list/list.svelte';
    import SimpleDropdown from '$lib/components/ui-pika/simple-dropdown/simple-dropdown.svelte';
    import { Badge } from '$lib/components/ui/badge';
    import { Button } from '$lib/components/ui/button';
    import { Checkbox } from '$lib/components/ui/checkbox';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { ScrollArea } from '$lib/components/ui/scroll-area';
    import { Separator } from '$lib/components/ui/separator';
    import { Plus, RotateCcw, Save, Trash2 } from '$lib/icons/lucide';
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

    function handleAddExternalEntity() {
        // TODO: Open dialog to select external entities
        console.log('Add external entity dialog');
    }

    function handleAddInternalEntity() {
        // TODO: Open dialog to select internal entities
        console.log('Add internal entity dialog');
    }

    function removeExternalEntity(index: number) {
        exclusiveExternalAccessControl = exclusiveExternalAccessControl.filter((_, i) => i !== index);
    }

    function removeInternalEntity(index: number) {
        exclusiveInternalAccessControl = exclusiveInternalAccessControl.filter((_, i) => i !== index);
    }

    function removeUserId(index: number) {
        exclusiveUserIdAccessControl = exclusiveUserIdAccessControl.filter((_, i) => i !== index);
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

    siteAdmin.setPageHeaderRight(pageHeaderRight);
</script>

<div class="flex h-full">
    <!-- Left Sidebar - Chat Apps List -->
    <div class="w-80 border-r bg-muted/20">
        <ScrollArea class="h-[calc(100vh-12rem)]">
            <div class="p-2">
                {#each chatApps as chatApp (chatApp.chatAppId)}
                    <button
                        class="w-full p-3 text-left rounded-lg hover:bg-muted/50 transition-colors {selectedChatApp?.chatAppId ===
                        chatApp.chatAppId
                            ? 'bg-muted ring-2 ring-ring'
                            : ''}"
                        onclick={() => selectChatApp(chatApp)}
                    >
                        <div class="flex items-start justify-between">
                            <div class="min-w-0 flex-1">
                                <h3 class="font-medium truncate">{chatApp.title}</h3>
                                <p class="text-sm text-muted-foreground line-clamp-2">{chatApp.description}</p>
                                <div class="mt-2 flex items-center gap-2">
                                    <Badge variant={chatApp.enabled ? 'default' : 'destructive'} class="text-xs">
                                        {chatApp.enabled ? 'Enabled' : 'Disabled'}
                                    </Badge>
                                    {#if chatApp.override}
                                        <Badge variant="secondary" class="text-xs">Override</Badge>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    </button>
                {/each}
            </div>
        </ScrollArea>
    </div>

    <!-- Right Panel - Configuration -->
    <div class="flex-1 flex flex-col">
        {#if selectedChatApp}
            <div class="p-6 border-b">
                <div class="flex items-center justify-between">
                    <div>
                        <h1 class="text-2xl font-bold">
                            {selectedChatApp.title}
                            <span class="text-sm font-normal text-muted-foreground">({selectedChatApp.chatAppId})</span>
                        </h1>
                        <p class="text-muted-foreground text-sm">
                            {#if isOverrideMode}
                                Edit settings for this chat app that override the original settings published with the
                                chat app (Override mode)
                            {:else}
                                Viewing default settings published with chat app (select "Enable Override" to edit)
                            {/if}
                        </p>
                    </div>
                    <div>
                        {#if isOverrideMode}
                            <Button variant="outline" size="sm" onclick={removeOverride}>Remove Override</Button>
                        {:else}
                            <Button variant="default" size="sm" onclick={setInitialOverride}>Enable Override</Button>
                        {/if}
                    </div>
                </div>
            </div>

            <ScrollArea class="flex-1">
                <div class="p-6 space-y-8">
                    <!-- Basic Settings -->
                    <section>
                        <h2 class="text-lg font-semibold mb-4">Basic Settings</h2>
                        <div class="space-y-4">
                            <div>
                                <div class="flex items-center gap-2">
                                    <div class="flex flex-col mr-6">
                                        <div>
                                            <span class="text-sm font-medium">Chat App Status:</span>
                                            <span class="font-medium {enabled ? 'text-blue-600' : 'text-red-600'}">
                                                {enabled ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </div>
                                        {#if isOverridden('enabled')}
                                            <span class="text-xs text-muted-foreground">
                                                (Original: {getOriginalValue('enabled') ? 'Enabled' : 'Disabled'})
                                            </span>
                                        {/if}
                                    </div>
                                    <Button
                                        variant={enabled ? 'destructive' : 'default'}
                                        size="sm"
                                        disabled={!isOverrideMode}
                                        onclick={() => isOverrideMode && (enabled = !enabled)}
                                        class={isOverridden('enabled') ? 'border-orange-500' : ''}
                                    >
                                        {enabled ? 'Disable Chat App' : 'Enable Chat App'}
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <Label for="title">Title</Label>
                                <Input
                                    id="title"
                                    bind:value={title}
                                    placeholder="Chat app title"
                                    disabled={!isOverrideMode}
                                />
                                {#if isOverridden('title')}
                                    <p class="text-xs text-muted-foreground mt-1">
                                        Original: {getOriginalValue('title')}
                                    </p>
                                {/if}
                            </div>

                            <div>
                                <Label for="description">Description</Label>
                                <textarea
                                    id="description"
                                    bind:value={description}
                                    placeholder="Chat app description"
                                    disabled={!isOverrideMode}
                                    class="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                    rows="3"
                                ></textarea>
                                {#if isOverridden('description')}
                                    <p class="text-xs text-muted-foreground mt-1">
                                        Original: {getOriginalValue('description')}
                                    </p>
                                {/if}
                            </div>

                            <div class="flex items-center space-x-2">
                                <Checkbox
                                    id="dontCacheThis"
                                    bind:checked={dontCacheThis}
                                    disabled={!isOverrideMode}
                                    class={isOverridden('dontCacheThis') ? 'border-orange-500' : ''}
                                />
                                <Label for="dontCacheThis">Don't Cache (for development)</Label>
                                {#if isOverridden('dontCacheThis')}
                                    <span class="text-xs text-muted-foreground">
                                        (Original: {getOriginalValue('dontCacheThis') ? 'Not caching' : 'Caching'})
                                    </span>
                                {/if}
                            </div>

                            <div class="text-sm">
                                <span class="text-muted-foreground">Agent ID:</span>
                                <span class="ml-2">{selectedChatApp.agentId}</span>
                            </div>
                        </div>
                    </section>

                    <Separator />

                    <!-- Access Control -->
                    <section>
                        <h2 class="text-lg font-semibold mb-4">Access Control</h2>
                        <div class="flex gap-4">
                            <div class="space-y-6">
                                <div>
                                    <div class="text-sm font-medium mb-2">User Types Allowed Access</div>
                                    <div class="flex items-center gap-4">
                                        <div class="flex items-center space-x-2">
                                            <Checkbox
                                                id="internal-user"
                                                bind:checked={
                                                    () => userTypes.includes('internal-user'),
                                                    () => {
                                                        if (!isOverrideMode) return;
                                                        if (userTypes.includes('internal-user')) {
                                                            // Unchecking internal-user
                                                            if (!userTypes.includes('external-user')) {
                                                                // Can't uncheck if external-user is not checked
                                                                return;
                                                            }
                                                            userTypes = userTypes.filter((t) => t !== 'internal-user');
                                                        } else {
                                                            // Checking internal-user
                                                            userTypes = [...userTypes, 'internal-user'];
                                                        }
                                                    }
                                                }
                                                disabled={!isOverrideMode ||
                                                    (userTypes.length === 1 && userTypes.includes('internal-user'))}
                                            />
                                            <Label for="internal-user">Internal Users</Label>
                                        </div>
                                        <div class="flex items-center space-x-2">
                                            <Checkbox
                                                id="external-user"
                                                bind:checked={
                                                    () => userTypes.includes('external-user'),
                                                    () => {
                                                        if (!isOverrideMode) return;
                                                        if (userTypes.includes('external-user')) {
                                                            // Unchecking external-user
                                                            if (!userTypes.includes('internal-user')) {
                                                                // Can't uncheck if internal-user is not checked
                                                                return;
                                                            }
                                                            userTypes = userTypes.filter((t) => t !== 'external-user');
                                                        } else {
                                                            // Checking external-user
                                                            userTypes = [...userTypes, 'external-user'];
                                                        }
                                                    }
                                                }
                                                disabled={!isOverrideMode ||
                                                    (userTypes.length === 1 && userTypes.includes('external-user'))}
                                            />
                                            <Label for="external-user">External Users</Label>
                                        </div>
                                    </div>
                                    {#if isOverridden('userTypes')}
                                        <p class="text-xs text-muted-foreground mt-1">
                                            Original: {getOriginalValue('userTypes')?.join(', ') || 'All users'}
                                        </p>
                                    {/if}
                                </div>

                                <div>
                                    <span class="text-sm font-medium">User Roles Allowed Access</span>
                                    <List
                                        classes="w-[300px] h-[200px] mt-2"
                                        items={userRoles}
                                        mapping={{
                                            value: (item) => item as string,
                                            label: (item) => item as string,
                                        }}
                                        allowSelection={true}
                                        multiSelect={true}
                                        emptyMessage="No user roles assigned"
                                        addRemove={{
                                            addItem: (item) => {
                                                userRoles = [...userRoles, item as UserRole];
                                            },
                                            removeItem: (item) => {
                                                userRoles = userRoles.filter((r) => r !== (item as UserRole));
                                            },
                                            predefinedOptions: {
                                                items: ['pika:content-admin', 'pika:site-admin'] as UserRole[],
                                                optionTypeName: 'role',
                                                optionTypeNamePlural: 'roles',
                                                mapping: {
                                                    value: (item) => item as string,
                                                    label: (item) => {
                                                        // Convert role values to readable labels
                                                        const roleLabels: Record<string, string> = {
                                                            'pika:content-admin': 'Content Admin',
                                                            'pika:site-admin': 'Site Admin',
                                                        };
                                                        return roleLabels[item as string] || (item as string);
                                                    },
                                                },
                                            },
                                            addValueInputPlaceholder: 'Choose or provide a role...',
                                            allowArbitraryValues: {
                                                convertValueToType: (value: string) => value as UserRole,
                                                popupInputPlaceholder: 'Choose or enter a new role...',
                                            },
                                        }}
                                    />
                                    {#if isOverridden('userRoles')}
                                        <p class="text-xs text-muted-foreground mt-1">
                                            Original: {getOriginalValue('userRoles')?.join(', ') || 'All roles'}
                                        </p>
                                    {/if}
                                </div>

                                <div>
                                    <Label for="applyRulesAs">Apply Rules As</Label>
                                    <SimpleDropdown
                                        bind:value={applyRulesAs}
                                        widthClasses="w-[300px]"
                                        mapping={{
                                            value: (item) => item as string,
                                            label: (item) => {
                                                if (item === 'and') {
                                                    return 'AND (User type and role required)';
                                                } else {
                                                    return 'OR (User type or role required)';
                                                }
                                            },
                                        }}
                                        options={['and', 'or']}
                                        disabled={!isOverrideMode}
                                    />

                                    {#if isOverridden('applyRulesAs')}
                                        <p class="text-xs text-muted-foreground mt-1">
                                            Original: {getOriginalValue('applyRulesAs')}
                                        </p>
                                    {/if}
                                </div>
                            </div>
                            <div class="max-w-[300px] space-y-3">
                                <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <h3 class="text-sm font-medium text-blue-900 mb-2">Who Can Access</h3>
                                    <div class="text-sm text-blue-800">
                                        {#if !enabled}
                                            <p class="text-red-600 font-medium">Chat app is disabled</p>
                                        {:else if userTypes.length === 0 && userRoles.length === 0}
                                            <p class="text-red-600 font-medium">
                                                No access - No user types or roles selected
                                            </p>
                                        {:else if userTypes.length === 0}
                                            <p>
                                                Users with any of these roles: <span class="font-medium"
                                                    >{userRoles.join(', ')}</span
                                                >
                                            </p>
                                        {:else if userRoles.length === 0}
                                            <p>
                                                <span class="font-medium"
                                                    >any {userTypes.map((t) => t.replace('-', ' ')).join(' or ')}</span
                                                > (any role)
                                            </p>
                                        {:else if applyRulesAs === 'and'}
                                            <p>
                                                any <span class="font-medium"
                                                    >{userTypes.map((t) => t.replace('-', ' ')).join(' or ')}</span
                                                >
                                                who has {userRoles.length === 1 ? 'the' : 'any one of these roles:'}
                                                <span class="font-medium">
                                                    {userRoles.length === 1
                                                        ? userRoles[0] + ' role'
                                                        : userRoles.join(', ')}
                                                </span>
                                            </p>
                                        {:else}
                                            <p>
                                                any <span class="font-medium"
                                                    >{userTypes.map((t) => t.replace('-', ' ')).join(' or ')}</span
                                                >, OR any user who has {userRoles.length === 1
                                                    ? 'the'
                                                    : 'any one of these roles:'}
                                                <span class="font-medium">
                                                    {userRoles.length === 1
                                                        ? userRoles[0] + ' role'
                                                        : userRoles.join(', ')}
                                                </span>
                                            </p>
                                        {/if}

                                        {#if enabled && (userTypes.length > 0 || userRoles.length > 0)}
                                            <div class="mt-2 pt-2 border-t border-blue-200">
                                                <p class="text-xs text-blue-600">
                                                    Access rule: <span class="font-medium"
                                                        >{applyRulesAs.toUpperCase()}</span
                                                    >
                                                    {#if applyRulesAs === 'and'}
                                                        (user must meet both user type AND role criteria)
                                                    {:else}
                                                        (user can meet either user type OR role criteria)
                                                    {/if}
                                                </p>
                                            </div>
                                        {/if}
                                    </div>
                                </div>

                                {#if exclusiveExternalAccessControl.length > 0 || exclusiveInternalAccessControl.length > 0 || exclusiveUserIdAccessControl.length > 0}
                                    <div class="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                        <h3 class="text-sm font-medium text-orange-900 mb-2">
                                            Additional Restrictions
                                        </h3>
                                        <div class="text-sm text-orange-800 space-y-1">
                                            {#if exclusiveExternalAccessControl.length > 0}
                                                <p>
                                                    • Only specific external entities ({exclusiveExternalAccessControl.length})
                                                </p>
                                            {/if}
                                            {#if exclusiveInternalAccessControl.length > 0}
                                                <p>
                                                    • Only specific internal entities ({exclusiveInternalAccessControl.length})
                                                </p>
                                            {/if}
                                            {#if exclusiveUserIdAccessControl.length > 0}
                                                <p>• Only specific user IDs ({exclusiveUserIdAccessControl.length})</p>
                                            {/if}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </section>

                    <Separator />

                    <!-- Features -->
                    <section>
                        <h2 class="text-lg font-semibold mb-4">Features</h2>
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
                    </section>

                    <Separator />

                    <!-- Exclusive Access Control -->
                    <section>
                        <h2 class="text-lg font-semibold mb-4">Exclusive Access Control</h2>
                        <div class="space-y-6">
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <Label>External Entity Access</Label>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!isOverrideMode}
                                        onclick={handleAddExternalEntity}
                                    >
                                        <Plus class="w-4 h-4 mr-1" />
                                        Add Entity
                                    </Button>
                                </div>
                                <div class="space-y-2">
                                    {#each exclusiveExternalAccessControl as entity, index}
                                        <div class="flex items-center justify-between p-2 border rounded">
                                            <span class="text-sm">{entity}</span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={!isOverrideMode}
                                                onclick={() => removeExternalEntity(index)}
                                            >
                                                <Trash2 class="w-4 h-4" />
                                            </Button>
                                        </div>
                                    {/each}
                                    {#if exclusiveExternalAccessControl.length === 0}
                                        <p class="text-sm text-muted-foreground">
                                            No exclusive external entities configured
                                        </p>
                                    {/if}
                                </div>
                                {#if isOverridden('exclusiveExternalAccessControl')}
                                    <p class="text-xs text-muted-foreground mt-1">
                                        Original: {getOriginalValue('exclusiveExternalAccessControl')?.length || 0} entities
                                    </p>
                                {/if}
                            </div>

                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <Label>Internal Entity Access</Label>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!isOverrideMode}
                                        onclick={handleAddInternalEntity}
                                    >
                                        <Plus class="w-4 h-4 mr-1" />
                                        Add Entity
                                    </Button>
                                </div>
                                <div class="space-y-2">
                                    {#each exclusiveInternalAccessControl as entity, index}
                                        <div class="flex items-center justify-between p-2 border rounded">
                                            <span class="text-sm">{entity}</span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={!isOverrideMode}
                                                onclick={() => removeInternalEntity(index)}
                                            >
                                                <Trash2 class="w-4 h-4" />
                                            </Button>
                                        </div>
                                    {/each}
                                    {#if exclusiveInternalAccessControl.length === 0}
                                        <p class="text-sm text-muted-foreground">
                                            No exclusive internal entities configured
                                        </p>
                                    {/if}
                                </div>
                                {#if isOverridden('exclusiveInternalAccessControl')}
                                    <p class="text-xs text-muted-foreground mt-1">
                                        Original: {getOriginalValue('exclusiveInternalAccessControl')?.length || 0} entities
                                    </p>
                                {/if}
                            </div>

                            <div>
                                <Label>User ID Access</Label>
                                <div class="mt-2 space-y-2">
                                    {#each exclusiveUserIdAccessControl as userId, index}
                                        <div class="flex items-center justify-between p-2 border rounded">
                                            <span class="text-sm">{userId}</span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={!isOverrideMode}
                                                onclick={() => removeUserId(index)}
                                            >
                                                <Trash2 class="w-4 h-4" />
                                            </Button>
                                        </div>
                                    {/each}
                                    {#if exclusiveUserIdAccessControl.length === 0}
                                        <p class="text-sm text-muted-foreground">No exclusive user IDs configured</p>
                                    {/if}
                                </div>
                                {#if isOverridden('exclusiveUserIdAccessControl')}
                                    <p class="text-xs text-muted-foreground mt-1">
                                        Original: {getOriginalValue('exclusiveUserIdAccessControl')?.length || 0} user IDs
                                    </p>
                                {/if}
                            </div>
                        </div>
                    </section>

                    <Separator />

                    <!-- Home Page Settings -->
                    <section>
                        <h2 class="text-lg font-semibold mb-4">Home Page Settings</h2>
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
                    </section>
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
    {#if selectedChatApp && isOverrideMode}
        <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" onclick={handleReset} disabled={!isDirty}>
                <RotateCcw class="w-4 h-4 mr-1" />
                Reset
            </Button>
            <Button variant="default" size="sm" onclick={handleSave} disabled={!isDirty}>
                <Save class="w-4 h-4 mr-1" />
                Save Changes
            </Button>
        </div>
    {/if}
{/snippet}
