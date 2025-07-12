<script lang="ts">
    import { Checkbox } from '$lib/components/ui/checkbox/index.js';
    import { Label } from '$lib/components/ui/label/index.js';
    import List from '$lib/components/ui-pika/list/list.svelte';
    import SimpleDropdown from '$lib/components/ui-pika/simple-dropdown/simple-dropdown.svelte';
    import type { ApplyRulesAs, UserRole } from '@pika/shared/types/chatbot/chatbot-types';

    interface Props {
        userTypes: string[];
        userRoles: UserRole[];
        applyRulesAs: ApplyRulesAs;
        enabled: boolean;
        isOverrideMode: boolean;
        isOverridden: (field: string) => boolean;
        getOriginalValue: (field: string) => any;
        // Configurable text props
        sectionTitle?: string;
        userTypesLabel?: string;
        userRolesLabel?: string;
        entityNameCapitalized?: string; // "Chat app", "Feature", etc.
    }

    let {
        userTypes = $bindable(),
        userRoles = $bindable(),
        applyRulesAs = $bindable(),
        enabled = $bindable(),
        isOverrideMode,
        isOverridden,
        getOriginalValue,
        sectionTitle = 'Access Control',
        userTypesLabel = 'User Types Allowed Access',
        userRolesLabel = 'User Roles Allowed Access',
        entityNameCapitalized = 'Chat app',
    }: Props = $props();
</script>

<section>
    <h2 class="text-lg font-semibold mb-4">{sectionTitle}</h2>
    <div class="flex gap-4 justify-between">
        <div class="space-y-6">
            <div>
                <div class="text-sm font-medium mb-2">{userTypesLabel}</div>
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
                <span class="text-sm font-medium">{userRolesLabel}</span>
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
                        <p class="text-red-600 font-medium">{entityNameCapitalized} is disabled</p>
                    {:else if userTypes.length === 0 && userRoles.length === 0}
                        <p class="text-red-600 font-medium">No access - No user types or roles selected</p>
                    {:else if userTypes.length === 0}
                        <p>
                            Users with any of these roles: <span class="font-medium">{userRoles.join(', ')}</span>
                        </p>
                    {:else if userRoles.length === 0}
                        <p>
                            <span class="font-medium">any {userTypes.map((t) => t.replace('-', ' ')).join(' or ')}</span
                            > (any role)
                        </p>
                    {:else if applyRulesAs === 'and'}
                        <p>
                            any <span class="font-medium">{userTypes.map((t) => t.replace('-', ' ')).join(' or ')}</span
                            >
                            who has {userRoles.length === 1 ? 'the' : 'any one of these roles:'}
                            <span class="font-medium">
                                {userRoles.length === 1 ? userRoles[0] + ' role' : userRoles.join(', ')}
                            </span>
                        </p>
                    {:else}
                        <p>
                            any <span class="font-medium">{userTypes.map((t) => t.replace('-', ' ')).join(' or ')}</span
                            >, OR any user who has {userRoles.length === 1 ? 'the' : 'any one of these roles:'}
                            <span class="font-medium">
                                {userRoles.length === 1 ? userRoles[0] + ' role' : userRoles.join(', ')}
                            </span>
                        </p>
                    {/if}

                    {#if enabled && (userTypes.length > 0 || userRoles.length > 0)}
                        <div class="mt-2 pt-2 border-t border-blue-200">
                            <p class="text-xs text-blue-600">
                                Access rule: <span class="font-medium">{applyRulesAs.toUpperCase()}</span>
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
        </div>
    </div>
</section>
