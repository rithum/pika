<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import SimpleDropdown from '$lib/components/ui-pika/simple-dropdown/simple-dropdown.svelte';
    import { type ChatApp, type UserType } from '@pika/shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import ConfigSection from '../../config-section.svelte';
    import ExclusiveEntityAccessControl from './exclusive-entity-access-control.svelte';
    import ExclusiveUserAccessControl from './exclusive-user-access-control.svelte';
    import GeneralAccessControl from './general-access-control.svelte';

    type AccessMode = 'general' | 'exclusive-entity' | 'exclusive-user';

    interface Props {
        chatApp: ChatApp;
        chatAppOriginal: ChatApp;
        isOverrideMode: boolean;
        accessExpanded: boolean;
        onToggleAccessSection: () => void;
        chatAppId: string;
        setValid: (valid: boolean) => void;
        disabled: boolean;
    }

    let {
        chatApp = $bindable(),
        chatAppOriginal,
        isOverrideMode,
        accessExpanded,
        onToggleAccessSection,
        chatAppId,
        setValid,
        disabled,
    }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    // User's intended access mode (state, not derived)
    let accessMode = $state<AccessMode>('general');
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

    // Initialize access mode based on existing data (only once)
    let initialized = $state(false);
    $effect(() => {
        if (!initialized) {
            const exclusiveUserIdAccessControl = app.override?.exclusiveUserIdAccessControl;
            const exclusiveExternalAccessControl = app.override?.exclusiveExternalAccessControl;
            const exclusiveInternalAccessControl = app.override?.exclusiveInternalAccessControl;

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

        const exclusiveExternalAccessControl = app.override?.exclusiveExternalAccessControl ?? [];
        const exclusiveInternalAccessControl = app.override?.exclusiveInternalAccessControl ?? [];
        const exclusiveUserIdAccessControl = app.override?.exclusiveUserIdAccessControl ?? [];

        if (accessMode === 'exclusive-entity') {
            if (exclusiveExternalAccessControl.length === 0 && exclusiveInternalAccessControl.length === 0) {
                errors.push(
                    `At least one ${entityDisplaySingularLower} must be specified for either internal or external users in exclusive ${entityDisplaySingularLower} mode.`
                );
            } else {
                if (exclusiveEntityOn.includes('internal-user') && exclusiveInternalAccessControl.length === 0) {
                    errors.push(
                        `Provide at least one ${entityDisplaySingularLower} for internal users or turn off exclusive internal users.`
                    );
                }

                if (exclusiveEntityOn.includes('external-user') && exclusiveExternalAccessControl.length === 0) {
                    errors.push(
                        `Provide at least one ${entityDisplaySingularLower} for external users or turn off exclusive external users.`
                    );
                }
            }
        } else if (accessMode === 'exclusive-user') {
            if (exclusiveUserIdAccessControl.length === 0) {
                errors.push('At least one user ID must be specified in exclusive user mode.');
            }
        } else if (accessMode === 'general') {
            const obj = (isOverrideMode ? chatApp.override : chatApp) ?? ({} as ChatApp);
            if ((obj.userTypes ?? []).length === 0 && (obj.userRoles ?? []).length === 0) {
                errors.push(
                    'At least one user type or role must be specified in general access mode or no one will be able to access the chat app.'
                );
            }
        }

        return errors;
    });

    // Clear incompatible data when access mode changes (only if initialized and in override mode)
    $effect(() => {
        if (!initialized || !isOverrideMode) return;

        if (!app.override) {
            app.override = { enabled: true };
        }

        // Clear data that doesn't apply to the new mode
        if (accessMode === 'general') {
            app.override.exclusiveExternalAccessControl = [];
            app.override.exclusiveInternalAccessControl = [];
            app.override.exclusiveUserIdAccessControl = [];
            exclusiveEntityOn = [];
        } else if (accessMode === 'exclusive-entity') {
            app.override.exclusiveUserIdAccessControl = [];
            app.userTypes = undefined;
            app.userRoles = undefined;
            app.applyRulesAs = undefined;
        } else if (accessMode === 'exclusive-user') {
            app.override.exclusiveExternalAccessControl = [];
            app.override.exclusiveInternalAccessControl = [];
            app.override.exclusiveUserIdAccessControl = [];
            exclusiveEntityOn = [];
            app.userTypes = undefined;
            app.userRoles = undefined;
            app.applyRulesAs = undefined;
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
            if ((app.userTypes ?? []).includes(userType)) {
                app.userTypes = (app.userTypes ?? []).filter((t) => t !== userType);
            }
        });
    });

    let exclusiveEntityOn = $state<UserType[]>([]);

    $effect(() => {
        setValid(validationErrors.length === 0);
    });
</script>

<ConfigSection
    title="Access Control"
    expanded={accessExpanded}
    onToggle={onToggleAccessSection}
    hasErrors={validationErrors.length > 0}
>
    <div class="space-y-6">
        <!-- Access Mode Selector -->
        <SimpleDropdown
            bind:value={accessMode}
            widthClasses="w-[300px]"
            disabled={!isOverrideMode || disabled}
            mapping={{
                value: (item) => item as string,
                label: (item) => {
                    if (item === 'general') {
                        return 'General Access Control';
                    } else if (item === 'exclusive-entity') {
                        return `Exclusive ${entityDisplaySingularUpper} Access`;
                    } else if (item === 'exclusive-user') {
                        return 'Exclusive User Access';
                    }
                    return '';
                },
                secondaryLabel: (item) => {
                    if (item === 'general') {
                        return 'This grants access based on user types and roles. Exclusive settings are not active.';
                    } else if (item === 'exclusive-entity') {
                        return `Grants access to users exclusively from specified ${entityDisplayPluralLower}. You can mix exclusive ${entityDisplaySingularLower} access for one user type with general access control for the other user type.`;
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
            <GeneralAccessControl
                bind:rulesObj={
                    () => (isOverrideMode ? chatApp.override : chatApp),
                    (value) => {
                        chatApp.override = value;
                        // console.log('here');
                        // assert(isOverrideMode, 'onRulesObjChange should only be called in override mode');
                        // assert(chatApp.override, 'chatApp.override should be defined');
                        // assert(value, 'value should be defined');
                        // console.log('value', value);
                        // let enabled: boolean;
                        // let userTypes: UserType[] | undefined;
                        // let userRoles: string[] | undefined;
                        // let applyRulesAs: ApplyRulesAs | undefined;
                        // if ('enabled' in value) {
                        //     enabled = value.enabled;
                        // } else {
                        //     enabled = true;
                        // }
                        // if ('userTypes' in value) {
                        //     userTypes = value.userTypes;
                        // }
                        // if ('userRoles' in value) {
                        //     userRoles = value.userRoles;
                        // }
                        // if ('applyRulesAs' in value) {
                        //     applyRulesAs = value.applyRulesAs;
                        // }
                        // chatApp.override.enabled = enabled;
                        // chatApp.override.userTypes = userTypes;
                        // chatApp.override.userRoles = userRoles;
                        // chatApp.override.applyRulesAs = applyRulesAs;
                    }
                }
                rulesObjOriginal={chatAppOriginal}
                {isOverrideMode}
                sectionTitle=""
            />
        {:else if accessMode === 'exclusive-entity'}
            <ExclusiveEntityAccessControl
                bind:chatApp
                {chatAppOriginal}
                bind:exclusiveEntityOn
                {isOverrideMode}
                {chatAppId}
                {validationErrors}
                {disabled}
            />
        {:else if accessMode === 'exclusive-user'}
            <ExclusiveUserAccessControl bind:chatApp {chatAppOriginal} {validationErrors} {isOverrideMode} {disabled} />
        {/if}
    </div>
</ConfigSection>
