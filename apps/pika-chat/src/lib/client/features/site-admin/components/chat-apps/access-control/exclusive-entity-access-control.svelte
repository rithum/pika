<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import List from '$lib/components/ui-pika/list/list.svelte';
    import PopupHelp from '$lib/components/ui-pika/popup-help/popup-help.svelte';
    import { Checkbox } from '$lib/components/ui/checkbox';
    import { Label } from '$lib/components/ui/label';
    import { assert } from '$lib/utils';
    import {
        type ChatApp,
        type SimpleOption,
        type UserRole,
        type UserType,
    } from '@pika/shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';

    interface Props {
        chatApp: ChatApp;
        chatAppOriginal: ChatApp;
        isOverrideMode: boolean;
        chatAppId: string;
        exclusiveEntityOn: UserType[];
        validationErrors: string[];
        disabled?: boolean;
    }

    let {
        chatApp = $bindable(),
        chatAppOriginal,
        isOverrideMode,
        chatAppId,
        exclusiveEntityOn = $bindable(),
        validationErrors,
        disabled = false,
    }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    let app = $derived(isOverrideMode ? chatApp : chatAppOriginal);

    let entityDisplaySingularLower = $derived.by(() => {
        let val = siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.entityDisplayNameSingular;
        if (val) {
            return val.charAt(0).toLowerCase() + val.slice(1);
        } else {
            return 'entity';
        }
    });

    let entityDisplaySingularUpper = $derived.by(() => {
        let val = siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.entityDisplayNameSingular;
        if (val) {
            return val.charAt(0).toUpperCase() + val.slice(1);
        } else {
            return 'Entity';
        }
    });

    let entityDisplayPluralLower = $derived.by(() => {
        let val = siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.entityDisplayNamePlural;
        if (val) {
            return val.charAt(0).toLowerCase() + val.slice(1);
        } else {
            return 'entities';
        }
    });

    let entityDisplayPluralUpper = $derived.by(() => {
        let val = siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.entityDisplayNamePlural;
        if (val) {
            return val.charAt(0).toUpperCase() + val.slice(1);
        } else {
            return 'Entities';
        }
    });

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
</script>

<div class="space-y-6">
    <div class="flex gap-10">
        {#if !siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.enabled}
            <div class="p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p class="text-sm text-yellow-800">
                    Support for entity access control is not enabled. Please enable it in the pika-config.ts file and
                    redeploy the site, making sure to follow the instructions on how to setup the feature to work.
                </p>
            </div>
        {:else}
            <div class="flex-1 space-y-6">
                {@render exclusiveEntityAccessControl(
                    'internal-user',
                    'internal-users-entity',
                    `Exclusive Internal User ${entityDisplayPluralUpper}`,
                    chatApp,
                    chatAppOriginal,
                    exclusiveInternalAccessControlOptions
                )}

                {@render exclusiveEntityAccessControl(
                    'external-user',
                    'external-users-entity',
                    `Exclusive External User ${entityDisplayPluralUpper}`,
                    chatApp,
                    chatAppOriginal,
                    exclusiveExternalAccessControlOptions
                )}
            </div>

            <div class="max-w-[300px] space-y-3">
                {@render exclusiveEntityAccessWhoCanAccess()}
            </div>
        {/if}
    </div>

    <!-- General Access Control for Non-Exclusive User Type -->
    {#if exclusiveEntityOn.length === 1}
        {@render generalAccessControlForNonExclusiveUserType()}
    {/if}
</div>

{#snippet exclusiveEntityAccessControl(
    userType: UserType,
    checkboxId: string,
    label: string,
    chatApp: ChatApp,
    chatAppOriginal: ChatApp,
    autoCompleteOptions: any[]
)}
    {@const accessControlArray =
        userType === 'internal-user'
            ? isOverrideMode
                ? (chatApp.override?.exclusiveInternalAccessControl ?? [])
                : (chatAppOriginal.override?.exclusiveInternalAccessControl ?? [])
            : isOverrideMode
              ? (chatApp.override?.exclusiveExternalAccessControl ?? [])
              : (chatAppOriginal.override?.exclusiveExternalAccessControl ?? [])}

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
                            assert(isOverrideMode, 'isOverrideMode must be true');
                            assert(chatApp.override, 'chatApp.override must be defined');

                            if (userType === 'internal-user') {
                                chatApp.override.exclusiveInternalAccessControl = [];
                            } else {
                                chatApp.override.exclusiveExternalAccessControl = [];
                            }
                        }
                    }
                }
                disabled={!isOverrideMode || disabled}
            />
            <Label for={checkboxId} class="font-medium">{label}</Label>
            <PopupHelp popoverClasses="w-[400px]">
                <p>
                    Only {userType === 'internal-user' ? 'internal' : 'external'} users associated with the specified
                    {entityDisplayPluralLower} will be granted access. You must specify at least one {entityDisplaySingularLower}
                    or unselect this option. Either this or the "Exclusive {userType === 'internal-user'
                        ? 'External'
                        : 'Internal'}
                    {entityDisplayPluralUpper}" option must be selected.
                </p>
            </PopupHelp>
        </div>
        {#if exclusiveEntityOn.includes(userType)}
            <List
                classes="w-[300px] h-[200px]"
                items={accessControlArray as unknown as SimpleOption[]}
                mapping={{
                    value: (item) => (typeof item === 'string' ? item : item.value),
                    label: (item) => (typeof item === 'string' ? item : (item.label ?? item.value)),
                }}
                allowSelection={true}
                multiSelect={true}
                disabled={!isOverrideMode || disabled}
                emptyMessage={`No ${entityDisplayPluralLower} specified`}
                addRemove={{
                    addItem: (item) => {
                        assert(isOverrideMode, 'isOverrideMode must be true');
                        assert(chatApp.override, 'chatApp.override must be defined');

                        const value = typeof item === 'string' ? item : item.value;

                        if (userType === 'internal-user') {
                            if (!chatApp.override.exclusiveInternalAccessControl) {
                                chatApp.override.exclusiveInternalAccessControl = [];
                            }
                            chatApp.override.exclusiveInternalAccessControl.push(value);
                        } else {
                            if (!chatApp.override.exclusiveExternalAccessControl) {
                                chatApp.override.exclusiveExternalAccessControl = [];
                            }
                            chatApp.override.exclusiveExternalAccessControl.push(value);
                        }
                    },
                    removeItem: (item) => {
                        assert(isOverrideMode, 'isOverrideMode must be true');
                        assert(chatApp.override, 'chatApp.override must be defined');

                        const value = typeof item === 'string' ? item : item.value;

                        if (userType === 'internal-user') {
                            if (!chatApp.override.exclusiveInternalAccessControl) {
                                return;
                            }
                            chatApp.override.exclusiveInternalAccessControl =
                                chatApp.override.exclusiveInternalAccessControl.filter((r) => r !== value);
                        } else {
                            if (!chatApp.override.exclusiveExternalAccessControl) {
                                return;
                            }
                            chatApp.override.exclusiveExternalAccessControl =
                                chatApp.override.exclusiveExternalAccessControl.filter((r) => r !== value);
                        }
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
                        popupInputPlaceholder: `${siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.searchPlaceholderText ?? `Search for an ${entityDisplaySingularLower}`}...`,
                        optionTypeName: entityDisplaySingularUpper,
                        optionTypeNamePlural: entityDisplayPluralUpper,
                        loading: loadingEntities,
                    },
                }}
            />
        {/if}
    </div>
{/snippet}

{#snippet exclusiveEntityAccessWhoCanAccess()}
    <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 class="text-sm font-medium text-blue-900 mb-2">Who Can Access</h3>
        <div class="text-sm text-blue-800">
            {#if !app.enabled}
                <p class="text-red-600 font-medium">Chat app is disabled</p>
            {:else if !exclusiveEntityOn.includes('internal-user') && !exclusiveEntityOn.includes('external-user')}
                <p class="text-red-600 font-medium">
                    No access - No user types enabled for exclusive {entityDisplaySingularLower} access
                </p>
            {:else}
                <ul class="space-y-1 list-disc list-inside">
                    {#if exclusiveEntityOn.includes('internal-user')}
                        {#if (app.override?.exclusiveInternalAccessControl ?? []).length > 0}
                            <li>
                                <span class="font-medium">Internal users</span> from these {entityDisplayPluralLower}:
                                <span class="font-medium"
                                    >{(app.override?.exclusiveInternalAccessControl ?? []).join(', ')}</span
                                >
                            </li>
                        {:else}
                            <li class="text-red-600">
                                <span class="font-medium">Internal users</span> (no {entityDisplayPluralLower} specified
                                - incomplete configuration)
                            </li>
                        {/if}
                    {/if}

                    {#if exclusiveEntityOn.includes('external-user')}
                        {#if (app.override?.exclusiveExternalAccessControl ?? []).length > 0}
                            <li>
                                <span class="font-medium">External users</span> from these
                                {entityDisplayPluralLower}:
                                <span class="font-medium"
                                    >{(app.override?.exclusiveExternalAccessControl ?? []).join(', ')}</span
                                >
                            </li>
                        {:else}
                            <li class="text-red-600">
                                <span class="font-medium">External users</span> (no {entityDisplayPluralLower} specified
                                - incomplete configuration)
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

                        {#if (app.override?.userTypes ?? []).includes(nonExclusiveUserType)}
                            <li>
                                {#if (app.override?.userRoles ?? []).length > 0}
                                    <span class="font-medium">{nonExclusiveUserTypeLabel}</span> with one of these
                                    roles:
                                    <span class="font-medium">{(app.override?.userRoles ?? []).join(', ')}</span>
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
            Configure access for {nonExclusiveUserTypeDescription} who are not governed by exclusive {entityDisplaySingularLower}
            restrictions.
        </p>

        <div class="space-y-4">
            <!-- User Type Checkbox -->
            <div class="flex items-center space-x-2">
                <Checkbox
                    id={`general-${nonExclusiveUserType}`}
                    bind:checked={
                        () => (app.override?.userTypes ?? []).includes(nonExclusiveUserType),
                        (checked) => {
                            assert(isOverrideMode, 'isOverrideMode must be true');
                            assert(chatApp.override, 'chatApp.override must be defined');

                            if (checked) {
                                if (!(chatApp.override?.userTypes ?? []).includes(nonExclusiveUserType)) {
                                    chatApp.override.userTypes = [
                                        ...(chatApp.override?.userTypes ?? []),
                                        nonExclusiveUserType,
                                    ];
                                    // Set applyRulesAs to 'and' automatically since user type is now enabled
                                    chatApp.override.applyRulesAs = 'and';
                                }
                            } else {
                                chatApp.override.userTypes = (chatApp.override?.userTypes ?? []).filter(
                                    (t) => t !== nonExclusiveUserType
                                );
                                // Clear any roles when unchecking the user type
                                chatApp.override.userRoles = [];
                            }
                        }
                    }
                    disabled={!isOverrideMode || disabled}
                />
                <Label for={`general-${nonExclusiveUserType}`} class="font-medium">
                    Allow {nonExclusiveUserTypeLabel}
                </Label>
            </div>

            {#if isOverrideMode}
                <p class="text-xs text-muted-foreground">
                    Original: {(chatAppOriginal.override?.userTypes ?? []).join(', ') || 'No user types'}
                </p>
            {/if}

            <!-- User Roles Section -->
            {#if (app.override?.userTypes ?? []).includes(nonExclusiveUserType)}
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
                        classes="w-[300px] h-[200px]"
                        items={app.override?.userRoles ?? []}
                        mapping={{
                            value: (item) => item as string,
                            label: (item) => item as string,
                        }}
                        allowSelection={true}
                        multiSelect={true}
                        disabled={!isOverrideMode || disabled}
                        emptyMessage="No user roles assigned - any role allowed"
                        addRemove={{
                            addItem: (item) => {
                                assert(isOverrideMode, 'isOverrideMode must be true');
                                assert(chatApp.override, 'chatApp.override must be defined');

                                if (!chatApp.override.userRoles) {
                                    chatApp.override.userRoles = [];
                                }
                                chatApp.override.userRoles.push(item as UserRole);
                            },
                            removeItem: (item) => {
                                assert(isOverrideMode, 'isOverrideMode must be true');
                                assert(chatApp.override, 'chatApp.override must be defined');

                                if (!chatApp.override.userRoles) {
                                    return;
                                }
                                chatApp.override.userRoles = (chatApp.override.userRoles ?? []).filter(
                                    (r) => r !== (item as UserRole)
                                );
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

                    {#if isOverrideMode}
                        <p class="text-xs text-muted-foreground">
                            Original: {(chatAppOriginal.override?.userRoles ?? []).join(', ') || 'No roles specified'}
                        </p>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
{/snippet}
