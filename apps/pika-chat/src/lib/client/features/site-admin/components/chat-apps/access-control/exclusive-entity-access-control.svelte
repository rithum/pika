<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { assert } from '$lib/utils';
    import {
        type ChatApp,
        type SimpleOption,
        type UserRole,
        type UserType,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import List from 'pika-ux/pika/list/list.svelte';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import { Checkbox } from 'pika-ux/shadcn/checkbox';
    import { Label } from 'pika-ux/shadcn/label';
    import { getContext } from 'svelte';

    interface Props {
        chatApp: ChatApp;
        chatAppOriginal: ChatApp;
        isOverrideMode: boolean;
        chatAppId: string;
        exclusiveEntityOn: UserType[];
        disabled?: boolean;
    }

    let {
        chatApp = $bindable(),
        chatAppOriginal,
        isOverrideMode,
        chatAppId,
        exclusiveEntityOn = $bindable(),
        disabled = false,
    }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    let entityDisplaySingularLower = $derived.by(() => {
        let val =
            siteAdmin.siteFeatures?.entity?.enabled &&
            siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.enabled
                ? siteAdmin.siteFeatures?.entity?.displayNameSingular
                : undefined;
        if (val) {
            return val.charAt(0).toLowerCase() + val.slice(1);
        } else {
            return 'entity';
        }
    });

    let entityDisplaySingularUpper = $derived.by(() => {
        let val =
            siteAdmin.siteFeatures?.entity?.enabled &&
            siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.enabled
                ? siteAdmin.siteFeatures?.entity?.displayNameSingular
                : undefined;
        if (val) {
            return val.charAt(0).toUpperCase() + val.slice(1);
        } else {
            return 'Entity';
        }
    });

    let entityDisplayPluralLower = $derived.by(() => {
        let val =
            siteAdmin.siteFeatures?.entity?.enabled &&
            siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.enabled
                ? siteAdmin.siteFeatures?.entity?.displayNamePlural
                : undefined;
        if (val) {
            return val.charAt(0).toLowerCase() + val.slice(1);
        } else {
            return 'entities';
        }
    });

    let entityDisplayPluralUpper = $derived.by(() => {
        let val =
            siteAdmin.siteFeatures?.entity?.enabled &&
            siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.enabled
                ? siteAdmin.siteFeatures?.entity?.displayNamePlural
                : undefined;
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
    {#if !siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.enabled}
        <div class="p-3 bg-warning-bg border border-warning/20 rounded">
            <p class="text-sm text-warning">
                Support for entity access control is not enabled. Please enable it in the pika-config.ts file and
                redeploy the site, making sure to follow the instructions on how to setup the feature to work.
            </p>
        </div>
    {:else}
        <div class="space-y-6">
            {@render exclusiveEntityAccessControl(
                'internal-user',
                'internal-users-entity',
                `Restrict internal users to ONLY these ${entityDisplayPluralLower}`,
                chatApp,
                chatAppOriginal,
                exclusiveInternalAccessControlOptions
            )}

            {@render exclusiveEntityAccessControl(
                'external-user',
                'external-users-entity',
                `Restrict external users to ONLY these ${entityDisplayPluralLower}`,
                chatApp,
                chatAppOriginal,
                exclusiveExternalAccessControlOptions
            )}
        </div>
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
                    This overrides the role/type rules above for {userType === 'internal-user' ? 'internal' : 'external'} users
                    — while this list is non-empty, only {userType === 'internal-user' ? 'internal' : 'external'} users associated
                    with one of these {entityDisplayPluralLower} get access, and the rules above no longer apply to them. Uncheck
                    this (or remove every {entityDisplaySingularLower}) to go back to using the rules above for
                    {userType === 'internal-user' ? 'internal' : 'external'} users.
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
                        popupInputPlaceholder: `${siteAdmin.siteFeatures?.entity?.searchPlaceholderText ?? `Search for an ${entityDisplaySingularLower}`}...`,
                        optionTypeName: entityDisplaySingularUpper,
                        optionTypeNamePlural: entityDisplayPluralUpper,
                        loading: loadingEntities,
                    },
                }}
            />
        {/if}
    </div>
{/snippet}
