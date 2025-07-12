<script lang="ts">
    import ConfigSection from '../config-section.svelte';
    import AccessControl from '../access-control.svelte';
    import { Button } from '$lib/components/ui/button';
    import { Checkbox } from '$lib/components/ui/checkbox';
    import { Label } from '$lib/components/ui/label';
    import { Input } from '$lib/components/ui/input';
    import List from '$lib/components/ui-pika/list/list.svelte';
    import SimpleDropdown from '$lib/components/ui-pika/simple-dropdown/simple-dropdown.svelte';
    import { Plus, Trash2, Info } from '$icons/lucide';
    import { HelpCircleOutline } from '$icons/ci';
    import {
        SiteAdminCommand,
        type ApplyRulesAs,
        type SimpleOption,
        type UserRole,
        type UserType,
    } from '@pika/shared/types/chatbot/chatbot-types';
    import PopupHelp from '$lib/components/ui-pika/popup-help/popup-help.svelte';
    import { getContext } from 'svelte';
    import type { AppState } from '$lib/client/app/app.state.svelte';

    type AccessMode = 'general' | 'exclusive-entity' | 'exclusive-user';

    interface Props {
        userTypes: UserType[];
        userRoles: UserRole[];
        applyRulesAs: ApplyRulesAs;
        enabled: boolean;
        exclusiveExternalAccessControl: string[];
        exclusiveInternalAccessControl: string[];
        exclusiveUserIdAccessControl: string[];
        isOverrideMode: boolean;
        accessExpanded: boolean;
        isOverridden: (field: string) => boolean;
        getOriginalValue: (field: string) => any;
        onToggleAccessSection: () => void;
        onAddExternalEntity: () => void;
        onAddInternalEntity: () => void;
        onRemoveExternalEntity: (index: number) => void;
        onRemoveInternalEntity: (index: number) => void;
        onRemoveUserId: (index: number) => void;
        chatAppId: string;
    }

    let {
        userTypes = $bindable(),
        userRoles = $bindable(),
        applyRulesAs = $bindable(),
        enabled = $bindable(),
        exclusiveExternalAccessControl = $bindable(),
        exclusiveInternalAccessControl = $bindable(),
        exclusiveUserIdAccessControl = $bindable(),
        isOverrideMode,
        accessExpanded,
        isOverridden,
        getOriginalValue,
        onToggleAccessSection,
        onAddExternalEntity,
        onAddInternalEntity,
        onRemoveExternalEntity,
        onRemoveInternalEntity,
        onRemoveUserId,
        chatAppId,
    }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    // User's intended access mode (state, not derived)
    let accessMode = $state<AccessMode>('general');

    // Initialize access mode based on existing data (only once)
    let initialized = $state(false);
    $effect(() => {
        if (!initialized) {
            // Determine initial access mode based on data (priority: user IDs > entities > general)
            if (exclusiveUserIdAccessControl && exclusiveUserIdAccessControl.length > 0) {
                accessMode = 'exclusive-user';
            } else if (
                (exclusiveExternalAccessControl && exclusiveExternalAccessControl.length > 0) ||
                (exclusiveInternalAccessControl && exclusiveInternalAccessControl.length > 0)
            ) {
                accessMode = 'exclusive-entity';
                // Initialize exclusiveEntityOn based on existing data
                if (exclusiveInternalAccessControl && exclusiveInternalAccessControl.length > 0) {
                    exclusiveEntityOn = [...exclusiveEntityOn, 'internal-user'];
                }
                if (exclusiveExternalAccessControl && exclusiveExternalAccessControl.length > 0) {
                    exclusiveEntityOn = [...exclusiveEntityOn, 'external-user'];
                }
            } else {
                accessMode = 'general';
            }
            initialized = true;
        }
    });

    // Validation for the chosen access mode
    let validationErrors = $derived.by(() => {
        const errors: string[] = [];

        if (accessMode === 'exclusive-entity') {
            if (exclusiveExternalAccessControl.length === 0 && exclusiveInternalAccessControl.length === 0) {
                errors.push(
                    'At least one entity must be specified for either internal or external users in exclusive entity mode.'
                );
            } else {
                if (exclusiveEntityOn.includes('internal-user') && exclusiveInternalAccessControl.length === 0) {
                    errors.push('Provide at least one entity for internal users or turn off exclusive internal users.');
                }

                if (exclusiveEntityOn.includes('external-user') && exclusiveExternalAccessControl.length === 0) {
                    errors.push('Provide at least one entity for external users or turn off exclusive external users.');
                }
            }
        } else if (accessMode === 'exclusive-user') {
            if (exclusiveUserIdAccessControl.length === 0) {
                errors.push('At least one user ID must be specified in exclusive user mode.');
            }
        }

        return errors;
    });

    // Clear incompatible data when access mode changes (only if initialized and in override mode)
    $effect(() => {
        if (!initialized || !isOverrideMode) return;

        // Clear data that doesn't apply to the new mode
        if (accessMode === 'general') {
            exclusiveExternalAccessControl = [];
            exclusiveInternalAccessControl = [];
            exclusiveUserIdAccessControl = [];
            exclusiveEntityOn = [];
        } else if (accessMode === 'exclusive-entity') {
            exclusiveUserIdAccessControl = [];
        } else if (accessMode === 'exclusive-user') {
            exclusiveExternalAccessControl = [];
            exclusiveInternalAccessControl = [];
            exclusiveEntityOn = [];
            userTypes = ensureNonEmptyUserTypes([]);
            userRoles = [];
        }
    });

    // Handle interaction between exclusive entity access and general access control
    $effect(() => {
        const notInitialized = !initialized;
        const notOverrideMode = !isOverrideMode;
        const notExclusiveEntity = accessMode !== 'exclusive-entity';
        if (notInitialized || notOverrideMode || notExclusiveEntity) return;

        // When a user type is enabled for exclusive entity access, remove it from general access userTypes
        exclusiveEntityOn.forEach((userType) => {
            if (userTypes.includes(userType)) {
                userTypes = userTypes.filter((t) => t !== userType);
            }
        });
    });

    // Helper function to ensure userTypes is never empty (defaults to internal-user)
    function ensureNonEmptyUserTypes(types: UserType[]): UserType[] {
        if (types.length === 0) {
            return ['internal-user'];
        }
        return types;
    }

    let exclusiveEntityOn = $state<UserType[]>([]);

    let loadingEntities = $derived(siteAdmin.siteAdminOperationInProgress['getValuesForEntityAutoComplete']);

    let exclusiveInternalAccessControlOptions = $derived.by(() => {
        let result =
            siteAdmin.valuesForInternalEntityAutoComplete?.map((item) => ({ value: item.value }) as SimpleOption) ?? [];
        return result;
    });

    let exclusiveExternalAccessControlOptions = $derived.by(() => {
        let result =
            siteAdmin.valuesForExternalEntityAutoComplete?.map((item) => ({ value: item.value }) as SimpleOption) ?? [];
        return result;
    });

    // User type handlers for exclusive entity mode
    function toggleInternalUsers() {
        if (!isOverrideMode) return;

        if (userTypes.includes('internal-user')) {
            // If unchecking and no external users, prevent unchecking
            if (!userTypes.includes('external-user')) {
                return;
            }
            userTypes = userTypes.filter((t) => t !== 'internal-user');
            // Clear internal entities if internal users disabled
            exclusiveInternalAccessControl = [];
        } else {
            userTypes = [...userTypes, 'internal-user'];
        }
    }

    function toggleExternalUsers() {
        if (!isOverrideMode) return;

        if (userTypes.includes('external-user')) {
            // If unchecking and no internal users, prevent unchecking
            if (!userTypes.includes('internal-user')) {
                return;
            }
            userTypes = userTypes.filter((t) => t !== 'external-user');
            // Clear external entities if external users disabled
            exclusiveExternalAccessControl = [];
        } else {
            userTypes = [...userTypes, 'external-user'];
        }
    }

    // Add user ID functionality
    let newUserId = $state('');

    function addUserId() {
        if (!isOverrideMode || !newUserId.trim()) return;

        if (!exclusiveUserIdAccessControl.includes(newUserId.trim())) {
            exclusiveUserIdAccessControl = [...exclusiveUserIdAccessControl, newUserId.trim()];
        }
        newUserId = '';
    }

    function handleUserIdKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault();
            addUserId();
        }
    }
</script>

<ConfigSection title="Access Control" expanded={accessExpanded} onToggle={onToggleAccessSection}>
    <div class="space-y-6">
        <!-- Access Mode Selector -->
        <SimpleDropdown
            bind:value={accessMode}
            widthClasses="w-[300px]"
            mapping={{
                value: (item) => item as string,
                label: (item) => {
                    if (item === 'general') {
                        return 'General Access Control';
                    } else if (item === 'exclusive-entity') {
                        return 'Exclusive Entity Access';
                    } else if (item === 'exclusive-user') {
                        return 'Exclusive User Access';
                    }
                    return '';
                },
                secondaryLabel: (item) => {
                    if (item === 'general') {
                        return 'This grants access based on user types and roles. Exclusive settings are not active.';
                    } else if (item === 'exclusive-entity') {
                        return `Grants access to users exclusively from specified ${siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.entityDisplayNamePlural ?? 'entities'}. You can mix exclusive ${siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.entityDisplayNameSingular ?? 'entity'} access for one user type with general access control for the other user type.`;
                    } else if (item === 'exclusive-user') {
                        return 'Only the specified users will be granted access. All other access settings are ignored.';
                    }
                    return '';
                },
            }}
            options={['general', 'exclusive-entity', 'exclusive-user']}
            dontShowSearchInput={true}
            popupWidthClasses="w-[300px]"
        />

        <!-- Validation Errors -->
        {#if validationErrors.length > 0}
            <div class="p-3 bg-red-50 border border-red-200 rounded">
                {#each validationErrors as error}
                    <p class="text-sm text-red-800">{error}</p>
                {/each}
            </div>
        {/if}

        <!-- Mode-specific content -->
        {#if accessMode === 'general'}
            <AccessControl
                bind:userTypes
                bind:userRoles
                bind:applyRulesAs
                bind:enabled
                {isOverrideMode}
                {isOverridden}
                {getOriginalValue}
                sectionTitle=""
            />
        {:else if accessMode === 'exclusive-entity'}
            <div class="space-y-6">
                <div class="flex gap-10">
                    {#if !siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.enabled}
                        <div class="p-3 bg-yellow-50 border border-yellow-200 rounded">
                            <p class="text-sm text-yellow-800">
                                Support for entity access control is not enabled. Please enable it in the pika-config.ts
                                file and redeploy the site, making sure to follow the instructions on how to setup the
                                feature to work.
                            </p>
                        </div>
                    {:else}
                        <div class="flex-1 space-y-6">
                            {@render exclusiveEntityAccessControl(
                                'internal-user',
                                'internal-users-entity',
                                'Exclusive Internal User Entities',
                                exclusiveInternalAccessControl,
                                exclusiveInternalAccessControlOptions,
                                (newArray: string[]) => (exclusiveInternalAccessControl = newArray)
                            )}

                            {@render exclusiveEntityAccessControl(
                                'external-user',
                                'external-users-entity',
                                'Exclusive External User Entities',
                                exclusiveExternalAccessControl,
                                exclusiveExternalAccessControlOptions,
                                (newArray: string[]) => (exclusiveExternalAccessControl = newArray)
                            )}
                        </div>

                        <div class="max-w-[300px] space-y-3">
                            {@render exclusiveUserAccessWhoCanAccess()}
                        </div>
                    {/if}
                </div>

                <!-- General Access Control for Non-Exclusive User Type -->
                {#if exclusiveEntityOn.length === 1}
                    {@render generalAccessControlForNonExclusiveUserType()}
                {/if}
            </div>
        {:else if accessMode === 'exclusive-user'}
            <div class="space-y-4">
                <div>
                    <Label class="text-sm font-medium">Allowed User IDs</Label>
                    <div class="flex gap-2 mt-2">
                        <Input
                            bind:value={newUserId}
                            placeholder="Enter user ID..."
                            disabled={!isOverrideMode}
                            onkeydown={handleUserIdKeydown}
                            class="flex-1"
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={!isOverrideMode || !newUserId.trim()}
                            onclick={addUserId}
                        >
                            <Plus class="w-4 h-4 mr-1" />
                            Add User
                        </Button>
                    </div>
                </div>

                <div class="space-y-2">
                    {#each exclusiveUserIdAccessControl as userId, index}
                        <div class="flex items-center justify-between p-2 border rounded">
                            <span class="text-sm font-mono">{userId}</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={!isOverrideMode}
                                onclick={() => onRemoveUserId(index)}
                            >
                                <Trash2 class="w-4 h-4" />
                            </Button>
                        </div>
                    {/each}
                    {#if exclusiveUserIdAccessControl.length === 0}
                        <div class="p-3 bg-red-50 border border-red-200 rounded">
                            <p class="text-sm text-red-800">
                                No user IDs configured. No one will have access to this chat app.
                            </p>
                        </div>
                    {/if}
                </div>

                {#if isOverridden('exclusiveUserIdAccessControl')}
                    <p class="text-xs text-muted-foreground">
                        Original: {getOriginalValue('exclusiveUserIdAccessControl')?.length || 0} user IDs
                    </p>
                {/if}
            </div>
        {/if}
    </div>
</ConfigSection>

{#snippet exclusiveEntityAccessControl(
    userType: UserType,
    checkboxId: string,
    label: string,
    accessControlArray: string[],
    autoCompleteOptions: any[],
    onUpdateAccessControl: (newArray: string[]) => void
)}
    <div>
        <div class="flex items-center space-x-2 mb-3">
            <Checkbox
                id={checkboxId}
                bind:checked={
                    () => exclusiveEntityOn.includes(userType),
                    (value) => {
                        if (exclusiveEntityOn.includes(userType)) {
                            exclusiveEntityOn = exclusiveEntityOn.filter((t) => t !== userType);
                        } else {
                            exclusiveEntityOn = [...exclusiveEntityOn, userType];
                        }

                        if (!value) {
                            onUpdateAccessControl([]);
                        }
                    }
                }
                disabled={!isOverrideMode}
            />
            <Label for={checkboxId} class="font-medium">{label}</Label>
            <PopupHelp popoverClasses="w-[400px]">
                <p>
                    Only {userType === 'internal-user' ? 'internal' : 'external'} users associated with the specified entities
                    will be granted access. You must specify at least one entity or unselect this option. Either this or
                    the "Exclusive {userType === 'internal-user' ? 'External' : 'Internal'} Entities" option must be selected.
                </p>
            </PopupHelp>
        </div>
        {#if exclusiveEntityOn.includes(userType)}
            <Label class="text-sm font-medium">Entities</Label>
            <List
                classes="w-[300px] h-[120px]"
                items={accessControlArray as unknown as SimpleOption[]}
                mapping={{
                    value: (item) => (typeof item === 'string' ? item : item.value),
                    label: (item) => (typeof item === 'string' ? item : (item.label ?? item.value)),
                }}
                allowSelection={true}
                multiSelect={true}
                emptyMessage="No {siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl
                    ?.entityDisplayNamePlural ?? 'Entities'} specified"
                addRemove={{
                    addItem: (item) => {
                        const value = typeof item === 'string' ? item : item.value;
                        if (!accessControlArray.includes(value)) {
                            const newArray = [...accessControlArray, value];
                            onUpdateAccessControl(newArray);
                        }
                    },
                    removeItem: (item) => {
                        const value = typeof item === 'string' ? item : item.value;
                        const newArray = accessControlArray.filter((r) => r !== value);
                        onUpdateAccessControl(newArray);
                    },
                    search: {
                        onSearchValueChanged: async (value) => {
                            await siteAdmin.sendSiteAdminCommand({
                                command: 'getValuesForEntityAutoComplete',
                                type: userType,
                                valueProvidedByUser: value,
                                chatAppId,
                            });
                        },
                        options: autoCompleteOptions,
                        minCharactersForSearch: 1,
                        showValueInListEntries: true,
                        popupInputPlaceholder: `${siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.searchPlaceholderText ?? 'Search for an entity'}...`,
                        optionTypeName:
                            siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl
                                ?.entityDisplayNameSingular,
                        optionTypeNamePlural:
                            siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.entityDisplayNamePlural,
                        loading: loadingEntities,
                    },
                }}
            />
        {/if}
    </div>
{/snippet}

{#snippet exclusiveUserAccessWhoCanAccess()}
    <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 class="text-sm font-medium text-blue-900 mb-2">Who Can Access</h3>
        <div class="text-sm text-blue-800">
            {#if !enabled}
                <p class="text-red-600 font-medium">Chat app is disabled</p>
            {:else if !exclusiveEntityOn.includes('internal-user') && !exclusiveEntityOn.includes('external-user')}
                <p class="text-red-600 font-medium">No access - No user types enabled for exclusive entity access</p>
            {:else}
                <ul class="space-y-1 list-disc list-inside">
                    {#if exclusiveEntityOn.includes('internal-user')}
                        {#if exclusiveInternalAccessControl.length > 0}
                            <li>
                                <span class="font-medium">Internal users</span> from these
                                {siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl
                                    ?.entityDisplayNamePlural ?? 'entities'}:
                                <span class="font-medium">{exclusiveInternalAccessControl.join(', ')}</span>
                            </li>
                        {:else}
                            <li class="text-red-600">
                                <span class="font-medium">Internal users</span> (no {siteAdmin.siteFeatures?.siteAdmin
                                    ?.supportUserEntityAccessControl?.entityDisplayNamePlural ?? 'entities'} specified -
                                incomplete configuration)
                            </li>
                        {/if}
                    {/if}

                    {#if exclusiveEntityOn.includes('external-user')}
                        {#if exclusiveExternalAccessControl.length > 0}
                            <li>
                                <span class="font-medium">External users</span> from these
                                {siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl
                                    ?.entityDisplayNamePlural ?? 'entities'}:
                                <span class="font-medium">{exclusiveExternalAccessControl.join(', ')}</span>
                            </li>
                        {:else}
                            <li class="text-red-600">
                                <span class="font-medium">External users</span> (no {siteAdmin.siteFeatures?.siteAdmin
                                    ?.supportUserEntityAccessControl?.entityDisplayNamePlural ?? 'entities'} specified -
                                incomplete configuration)
                            </li>
                        {/if}
                    {/if}

                    <!-- Handle general access for non-exclusive user type -->
                    {#if exclusiveEntityOn.length === 1}
                        {@const nonExclusiveUserType = exclusiveEntityOn.includes('internal-user')
                            ? 'external-user'
                            : 'internal-user'}
                        {@const nonExclusiveUserTypeLabel =
                            nonExclusiveUserType === 'internal-user' ? 'Internal users' : 'External users'}

                        {#if userTypes.includes(nonExclusiveUserType)}
                            <li>
                                {#if userRoles.length > 0}
                                    <span class="font-medium">{nonExclusiveUserTypeLabel}</span> with one of these
                                    roles:
                                    <span class="font-medium">{userRoles.join(', ')}</span>
                                {:else}
                                    <span class="font-medium">All {nonExclusiveUserTypeLabel.toLowerCase()}</span>
                                {/if}
                            </li>
                        {:else}
                            <li>
                                <span class="font-medium">No {nonExclusiveUserTypeLabel.toLowerCase()}</span> will be granted
                                access
                            </li>
                        {/if}
                    {/if}
                </ul>
            {/if}
        </div>
    </div>
{/snippet}

{#snippet generalAccessControlForNonExclusiveUserType()}
    {@const nonExclusiveUserType = exclusiveEntityOn.includes('internal-user') ? 'external-user' : 'internal-user'}
    {@const nonExclusiveUserTypeLabel = nonExclusiveUserType === 'internal-user' ? 'Internal Users' : 'External Users'}
    {@const nonExclusiveUserTypeDescription =
        nonExclusiveUserType === 'internal-user' ? 'internal users' : 'external users'}

    <div class="border border-gray-200 rounded-lg p-4 mt-6">
        <h3 class="text-sm font-medium mb-4">Access for {nonExclusiveUserTypeLabel}</h3>
        <p class="text-xs text-muted-foreground mb-4">
            Configure access for {nonExclusiveUserTypeDescription} who are not governed by exclusive entity restrictions.
        </p>

        <div class="space-y-4">
            <!-- User Type Checkbox -->
            <div class="flex items-center space-x-2">
                <Checkbox
                    id={`general-${nonExclusiveUserType}`}
                    bind:checked={
                        () => userTypes.includes(nonExclusiveUserType),
                        (checked) => {
                            if (!isOverrideMode) return;
                            if (checked) {
                                if (!userTypes.includes(nonExclusiveUserType)) {
                                    userTypes = [...userTypes, nonExclusiveUserType];
                                    // Set applyRulesAs to 'and' automatically since user type is now enabled
                                    applyRulesAs = 'and';
                                }
                            } else {
                                userTypes = userTypes.filter((t) => t !== nonExclusiveUserType);
                                // Clear any roles when unchecking the user type
                                userRoles = [];
                            }
                        }
                    }
                    disabled={!isOverrideMode}
                />
                <Label for={`general-${nonExclusiveUserType}`} class="font-medium">
                    Allow {nonExclusiveUserTypeLabel}
                </Label>
            </div>

            {#if isOverridden('userTypes')}
                <p class="text-xs text-muted-foreground">
                    Original: {getOriginalValue('userTypes')?.join(', ') || 'No user types'}
                </p>
            {/if}

            <!-- User Roles Section -->
            {#if userTypes.includes(nonExclusiveUserType)}
                <div class="ml-6 space-y-3">
                    <div class="flex items-center space-x-2">
                        <Label class="text-sm font-medium">User Roles (Optional)</Label>
                        <PopupHelp popoverClasses="w-[400px]">
                            <p>
                                Optionally restrict access to {nonExclusiveUserTypeDescription} who have specific roles.
                                If no roles are specified, any {nonExclusiveUserTypeDescription.replace(
                                    'users',
                                    'user'
                                )} will be granted access. If roles are specified, the user must be of the selected user
                                type AND have one of the specified roles.
                            </p>
                        </PopupHelp>
                    </div>

                    <List
                        classes="w-[300px] h-[120px]"
                        items={userRoles}
                        mapping={{
                            value: (item) => item as string,
                            label: (item) => item as string,
                        }}
                        allowSelection={true}
                        multiSelect={true}
                        emptyMessage="No user roles assigned - any role allowed"
                        addRemove={{
                            addItem: (item) => {
                                if (!isOverrideMode) return;
                                userRoles = [...userRoles, item as UserRole];
                            },
                            removeItem: (item) => {
                                if (!isOverrideMode) return;
                                userRoles = userRoles.filter((r) => r !== (item as UserRole));
                            },
                            predefinedOptions: {
                                items: ['pika:content-admin', 'pika:site-admin'] as UserRole[],
                                optionTypeName: 'role',
                                optionTypeNamePlural: 'roles',
                                mapping: {
                                    value: (item) => item as string,
                                    label: (item) => {
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
                        <p class="text-xs text-muted-foreground">
                            Original: {getOriginalValue('userRoles')?.join(', ') || 'No roles specified'}
                        </p>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
{/snippet}
