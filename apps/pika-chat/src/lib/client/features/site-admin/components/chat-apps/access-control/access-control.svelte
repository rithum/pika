<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import SimpleDropdown from '$lib/components/ui-pika/simple-dropdown/simple-dropdown.svelte';
    import { type ApplyRulesAs, type UserRole, type UserType } from '@pika/shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import ConfigSection from '../../config-section.svelte';
    import GeneralAccessControl from './general-access-control.svelte';
    import ExclusiveEntityAccessControl from './exclusive-entity-access-control.svelte';
    import ExclusiveUserAccessControl from './exclusive-user-access-control.svelte';

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
        chatAppId,
    }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    // User's intended access mode (state, not derived)
    let accessMode = $state<AccessMode>('general');

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
            userTypes = ensureNonEmptyUserTypes([]);
            userRoles = [];
            applyRulesAs = 'and';
        } else if (accessMode === 'exclusive-entity') {
            exclusiveUserIdAccessControl = [];
            userTypes = ensureNonEmptyUserTypes([]);
            userRoles = [];
            applyRulesAs = 'and';
        } else if (accessMode === 'exclusive-user') {
            exclusiveExternalAccessControl = [];
            exclusiveInternalAccessControl = [];
            exclusiveEntityOn = [];
            userTypes = ensureNonEmptyUserTypes([]);
            userRoles = [];
            applyRulesAs = 'and';
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
            <ExclusiveEntityAccessControl
                bind:userTypes
                bind:userRoles
                bind:applyRulesAs
                bind:enabled
                bind:exclusiveExternalAccessControl
                bind:exclusiveInternalAccessControl
                bind:exclusiveEntityOn
                {isOverrideMode}
                {isOverridden}
                {getOriginalValue}
                {chatAppId}
                {validationErrors}
            />
        {:else if accessMode === 'exclusive-user'}
            <ExclusiveUserAccessControl
                bind:enabled
                bind:exclusiveUserIdAccessControl
                {isOverrideMode}
                {isOverridden}
                {getOriginalValue}
                {validationErrors}
            />
        {/if}
    </div>
</ConfigSection>
