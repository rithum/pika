<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import List from '$lib/components/ui-pika/list/list.svelte';
    import { Label } from '$lib/components/ui/label';
    import type { ChatUserLite } from '@pika/shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';

    interface Props {
        enabled: boolean;
        exclusiveUserIdAccessControl: string[];
        isOverrideMode: boolean;
        isOverridden: (field: string) => boolean;
        getOriginalValue: (field: string) => any;
        validationErrors: string[];
    }

    let {
        enabled = $bindable(),
        exclusiveUserIdAccessControl = $bindable(),
        isOverrideMode,
        isOverridden,
        getOriginalValue,
        validationErrors,
    }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    let loadingUsers = $derived(siteAdmin.siteAdminOperationInProgress['getValuesForUserAutoComplete']);
</script>

<div class="space-y-6">
    {#if !siteAdmin.siteFeatures?.siteAdmin?.supportSpecificUserAccessControl?.enabled}
        <div class="p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p class="text-sm text-yellow-800">
                Support for specific user access control is not enabled. Please enable it in the pika-config.ts file and
                redeploy the site, making sure to follow the instructions on how to setup the feature to work.
            </p>
        </div>
    {:else}
        <div class="flex gap-10">
            <div class="flex-1 space-y-4">
                <Label class="text-sm font-medium">Users</Label>
                <List
                    classes="w-[300px] h-[200px]"
                    items={exclusiveUserIdAccessControl as unknown as ChatUserLite[]}
                    mapping={{
                        value: (item) => (typeof item === 'string' ? item : item.userId),
                        label: (item) =>
                            typeof item === 'string'
                                ? item
                                : item.firstName && item.lastName
                                  ? `${item.firstName} ${item.lastName}`
                                  : item.userId,
                    }}
                    allowSelection={true}
                    multiSelect={true}
                    emptyMessage="No users specified"
                    addRemove={{
                        addItem: (item) => {
                            const value = typeof item === 'string' ? item : item.userId;
                            if (!exclusiveUserIdAccessControl.includes(value)) {
                                const newArray = [...exclusiveUserIdAccessControl, value];
                                exclusiveUserIdAccessControl = newArray;
                            }
                        },
                        removeItem: (item) => {
                            const value = typeof item === 'string' ? item : item.userId;
                            const newArray = exclusiveUserIdAccessControl.filter((r) => r !== value);
                            exclusiveUserIdAccessControl = newArray;
                        },
                        search: {
                            onSearchValueChanged: async (value) => {
                                await siteAdmin.sendSiteAdminCommand({
                                    command: 'getValuesForUserAutoComplete',
                                    valueProvidedByUser: value,
                                });
                            },
                            options: siteAdmin.valuesForAutoCompleteForUserAccessControl ?? [],
                            minCharactersForSearch: 3,
                            showValueInListEntries: true,
                            popupInputPlaceholder: 'Search for a user...',
                            optionTypeName: 'user',
                            optionTypeNamePlural: 'users',
                            loading: loadingUsers,
                        },
                    }}
                />

                {#if isOverridden('exclusiveUserIdAccessControl')}
                    <p class="text-xs text-muted-foreground">
                        Original: {getOriginalValue('exclusiveUserIdAccessControl')?.length || 0} user IDs
                    </p>
                {/if}
            </div>

            <div class="max-w-[300px] space-y-3">
                {@render exclusiveUserAccessWhoCanAccess()}
            </div>
        </div>
    {/if}
</div>

{#snippet exclusiveUserAccessWhoCanAccess()}
    <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 class="text-sm font-medium text-blue-900 mb-2">Who Can Access</h3>
        <div class="text-sm text-blue-800">
            {#if !enabled}
                <p class="text-red-600 font-medium">Chat app is disabled</p>
            {:else if exclusiveUserIdAccessControl.length === 0}
                <p class="text-red-600 font-medium">No access - No users specified</p>
            {:else}
                <ul class="space-y-1 list-disc list-inside">
                    Only these users will be granted access:
                    {#each exclusiveUserIdAccessControl as userId, index}
                        <span class="font-medium">{userId}</span>
                        {#if index < exclusiveUserIdAccessControl.length - 1}
                            <span class="text-muted-foreground">, </span>
                        {/if}
                    {/each}
                </ul>
            {/if}
        </div>
    </div>
{/snippet}
