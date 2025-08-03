<script lang="ts">
    import List from '$ui/pika/list/list.svelte';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';
    import { Checkbox } from '$ui/shadcn/checkbox/index.js';
    import { Label } from '$ui/shadcn/label/index.js';
    import { assert } from '$lib/utils';
    import type { AccessRules, UserRole } from '@pika/shared/types/chatbot/chatbot-types';

    interface Props {
        rulesObj: AccessRules | undefined;
        rulesObjOriginal: AccessRules | undefined;
        isOverrideMode: boolean;
        // Configurable text props
        sectionTitle?: string;
        userTypesLabel?: string;
        userRolesLabel?: string;
        entityNameCapitalized?: string; // "Chat app", "Feature", etc.
        featureEnabled?: boolean;
        disabled?: boolean;
    }

    let {
        rulesObj = $bindable(),
        rulesObjOriginal,
        isOverrideMode,
        sectionTitle,
        userTypesLabel = 'User Types Allowed Access',
        userRolesLabel = 'User Roles Allowed Access',
        entityNameCapitalized = 'Chat app',
        featureEnabled = true,
        disabled = false,
    }: Props = $props();

    let rulesObjToShow = $derived(isOverrideMode ? rulesObj : rulesObjOriginal);
</script>

<section>
    {#if sectionTitle && sectionTitle.trim().length > 0}
        <h2 class="text-lg font-semibold mb-4">{sectionTitle}</h2>
    {/if}
    <div class="flex gap-4 justify-between">
        <div class="space-y-6">
            <div>
                <div class="text-sm font-medium mb-2">{userTypesLabel}</div>
                <div class="flex items-center gap-4">
                    <div class="flex items-center space-x-2">
                        <Checkbox
                            id="internal-user"
                            bind:checked={
                                () => (rulesObjToShow?.userTypes ?? []).includes('internal-user'),
                                () => {
                                    assert(isOverrideMode, 'isOverrideMode must be true');
                                    assert(rulesObj, 'rulesObjToShow must be defined');

                                    if (!rulesObj.userTypes) {
                                        rulesObj.userTypes = [];
                                    }

                                    if (rulesObj.userTypes.includes('internal-user')) {
                                        // Unchecking internal-user
                                        if (!rulesObj.userTypes.includes('external-user')) {
                                            // Can't uncheck if external-user is not checked
                                            return;
                                        }
                                        rulesObj.userTypes = rulesObj.userTypes.filter((t) => t !== 'internal-user');
                                    } else {
                                        // Checking internal-user
                                        rulesObj.userTypes = [...rulesObj.userTypes, 'internal-user'];
                                    }

                                    if (!rulesObj.applyRulesAs) {
                                        rulesObj.applyRulesAs = 'and';
                                    }
                                }
                            }
                            disabled={!featureEnabled ||
                                !isOverrideMode ||
                                !rulesObjToShow ||
                                !rulesObjToShow.enabled ||
                                ((rulesObjToShow.userTypes ?? []).length === 1 &&
                                    (rulesObjToShow.userTypes ?? []).includes('internal-user')) ||
                                disabled}
                        />
                        <Label for="internal-user">Internal Users</Label>
                    </div>
                    <div class="flex items-center space-x-2">
                        <Checkbox
                            id="external-user"
                            bind:checked={
                                () => (rulesObjToShow?.userTypes ?? []).includes('external-user'),
                                () => {
                                    assert(isOverrideMode, 'isOverrideMode must be true');
                                    assert(rulesObj, 'rulesObjToShow must be defined');

                                    if (!rulesObj.userTypes) {
                                        rulesObj.userTypes = [];
                                    }

                                    if (!rulesObj.applyRulesAs) {
                                        rulesObj.applyRulesAs = 'and';
                                    }

                                    if (rulesObj.userTypes.includes('external-user')) {
                                        // Unchecking external-user
                                        if (!rulesObj.userTypes.includes('internal-user')) {
                                            // Can't uncheck if internal-user is not checked
                                            return;
                                        }
                                        rulesObj.userTypes = rulesObj.userTypes.filter((t) => t !== 'external-user');
                                    } else {
                                        // Checking external-user
                                        rulesObj.userTypes = [...rulesObj.userTypes, 'external-user'];
                                    }
                                }
                            }
                            disabled={!featureEnabled ||
                                !isOverrideMode ||
                                !rulesObjToShow ||
                                !rulesObjToShow.enabled ||
                                ((rulesObjToShow?.userTypes ?? []).length === 1 &&
                                    (rulesObjToShow?.userTypes ?? []).includes('external-user')) ||
                                disabled}
                        />
                        <Label for="external-user">External Users</Label>
                    </div>
                </div>
                {#if isOverrideMode}
                    <p class="text-xs text-muted-foreground mt-1">
                        Original: {rulesObjOriginal?.userTypes?.join(', ') || 'None specified'}
                    </p>
                {/if}
            </div>

            <div>
                <span class="text-sm font-medium">{userRolesLabel}</span>
                <List
                    classes="w-[300px] h-[200px] mt-2"
                    items={rulesObjToShow?.userRoles ?? []}
                    mapping={{
                        value: (item) => item as string,
                        label: (item) => item as string,
                    }}
                    allowSelection={true}
                    multiSelect={true}
                    disabled={!featureEnabled || !isOverrideMode || !rulesObj?.enabled || disabled}
                    emptyMessage="No user roles assigned"
                    addRemove={{
                        addItem: (item) => {
                            assert(isOverrideMode, 'isOverrideMode must be true');
                            assert(rulesObj, 'rulesObjToShow must be defined');

                            if (!rulesObj.userRoles) {
                                rulesObj.userRoles = [];
                            }

                            rulesObj.userRoles = [...rulesObj.userRoles, item as UserRole];
                        },
                        removeItem: (item) => {
                            assert(isOverrideMode, 'isOverrideMode must be true');
                            assert(rulesObj, 'rulesObjToShow must be defined');

                            if (!rulesObj.userRoles) {
                                rulesObj.userRoles = [];
                            }

                            rulesObj.userRoles = rulesObj.userRoles.filter((r) => r !== (item as UserRole));
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
                {#if isOverrideMode}
                    <p class="text-xs text-muted-foreground mt-1">
                        Original: {rulesObjOriginal?.userRoles?.join(', ') || 'None specified'}
                    </p>
                {/if}
            </div>

            <div>
                <Label for="applyRulesAs">Apply Rules As</Label>
                <SimpleDropdown
                    bind:value={
                        () => rulesObjToShow?.applyRulesAs,
                        (value) => {
                            assert(isOverrideMode, 'isOverrideMode must be true');
                            assert(rulesObj, 'rulesObjToShow must be defined');

                            rulesObj.applyRulesAs = value;
                        }
                    }
                    classes="w-[300px]"
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
                    disabled={!featureEnabled || !isOverrideMode || !rulesObj?.enabled || disabled}
                />

                {#if isOverrideMode}
                    <p class="text-xs text-muted-foreground mt-1">
                        Original: {rulesObjOriginal?.applyRulesAs || 'None specified'}
                    </p>
                {/if}
            </div>
        </div>
        <div class="max-w-[300px] space-y-3">
            <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 class="text-sm font-medium text-blue-900 mb-2">Who Can Access</h3>
                <div class="text-sm text-blue-800">
                    {#if !rulesObjToShow?.enabled}
                        <p class="text-red-600 font-medium">{entityNameCapitalized} is disabled</p>
                    {:else if (rulesObjToShow?.userTypes ?? []).length === 0 && (rulesObjToShow?.userRoles ?? []).length === 0}
                        <p class="text-red-600 font-medium">No access - No user types or roles selected</p>
                    {:else if (rulesObjToShow?.userTypes ?? []).length === 0}
                        <p>
                            Users with any of these roles: <span class="font-medium"
                                >{(rulesObjToShow?.userRoles ?? []).join(', ')}</span
                            >
                        </p>
                    {:else if (rulesObjToShow?.userRoles ?? []).length === 0}
                        <p>
                            <span class="font-medium"
                                >any {(rulesObjToShow?.userTypes ?? [])
                                    .map((t) => t.replace('-', ' '))
                                    .join(' or ')}</span
                            > (any role)
                        </p>
                    {:else if rulesObjToShow?.applyRulesAs === 'and'}
                        <p>
                            any <span class="font-medium"
                                >{(rulesObjToShow?.userTypes ?? []).map((t) => t.replace('-', ' ')).join(' or ')}</span
                            >
                            who has {(rulesObjToShow?.userRoles ?? []).length === 1 ? 'the' : 'any one of these roles:'}
                            <span class="font-medium">
                                {(rulesObjToShow?.userRoles ?? []).length === 1
                                    ? (rulesObjToShow?.userRoles ?? [])[0] + ' role'
                                    : (rulesObjToShow?.userRoles ?? []).join(', ')}
                            </span>
                        </p>
                    {:else}
                        <p>
                            any <span class="font-medium"
                                >{(rulesObjToShow?.userTypes ?? []).map((t) => t.replace('-', ' ')).join(' or ')}</span
                            >, OR any user who has {(rulesObjToShow?.userRoles ?? []).length === 1
                                ? 'the'
                                : 'any one of these roles:'}
                            <span class="font-medium">
                                {(rulesObjToShow?.userRoles ?? []).length === 1
                                    ? (rulesObjToShow?.userRoles ?? [])[0] + ' role'
                                    : (rulesObjToShow?.userRoles ?? []).join(', ')}
                            </span>
                        </p>
                    {/if}

                    {#if rulesObjToShow?.enabled && ((rulesObjToShow?.userTypes ?? []).length > 0 || (rulesObjToShow?.userRoles ?? []).length > 0)}
                        <div class="mt-2 pt-2 border-t border-blue-200">
                            <p class="text-xs text-blue-600">
                                Access rule: <span class="font-medium"
                                    >{rulesObjToShow?.applyRulesAs?.toUpperCase()}</span
                                >
                                {#if rulesObjToShow?.applyRulesAs === 'and'}
                                    (user must meet both user type AND role criteria)
                                {:else}
                                    (user can meet either user type OR role criteria)
                                {/if}
                            </p>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
</section>
