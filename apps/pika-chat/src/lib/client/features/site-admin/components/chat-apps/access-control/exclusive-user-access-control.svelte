<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import List from '$ui/pika/list/list.svelte';
    import { Label } from '$ui/shadcn/label';
    import { assert } from '$lib/utils';
    import type { ChatApp, ChatUserLite } from '@pika/shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';

    interface Props {
        chatApp: ChatApp;
        chatAppOriginal: ChatApp;
        isOverrideMode: boolean;
        validationErrors: string[];
        disabled: boolean;
    }

    let {
        chatApp = $bindable(),
        chatAppOriginal,
        isOverrideMode,
        validationErrors,
        disabled = false,
    }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    let app = $derived(isOverrideMode ? chatApp : chatAppOriginal);

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
                    items={(app.override?.exclusiveUserIdAccessControl ?? []) as unknown as ChatUserLite[]}
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
                    disabled={!isOverrideMode || disabled}
                    emptyMessage="No users specified"
                    addRemove={{
                        addItem: (item) => {
                            assert(isOverrideMode, 'isOverrideMode must be true');
                            assert(chatApp.override, 'chatApp.override must be defined');

                            if (!chatApp.override.exclusiveUserIdAccessControl) {
                                chatApp.override.exclusiveUserIdAccessControl = [];
                            }

                            const value = typeof item === 'string' ? item : item.userId;
                            if (!chatApp.override.exclusiveUserIdAccessControl.includes(value)) {
                                chatApp.override.exclusiveUserIdAccessControl.push(value);
                            }
                        },
                        removeItem: (item) => {
                            assert(isOverrideMode, 'isOverrideMode must be true');
                            assert(chatApp.override, 'chatApp.override must be defined');

                            if (!chatApp.override.exclusiveUserIdAccessControl) {
                                return;
                            }

                            const value = typeof item === 'string' ? item : item.userId;
                            if (chatApp.override.exclusiveUserIdAccessControl.includes(value)) {
                                chatApp.override.exclusiveUserIdAccessControl =
                                    chatApp.override.exclusiveUserIdAccessControl.filter((r) => r !== value);
                            }
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

                {#if isOverrideMode}
                    <p class="text-xs text-muted-foreground">
                        Original: {(chatAppOriginal.override?.exclusiveUserIdAccessControl ?? []).length} user IDs
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
            {#if !app.enabled}
                <p class="text-red-600 font-medium">Chat app is disabled</p>
            {:else if (app.override?.exclusiveUserIdAccessControl ?? []).length === 0}
                <p class="text-red-600 font-medium">No access - No users specified</p>
            {:else}
                <ul class="space-y-1 list-disc list-inside">
                    Only these users will be granted access:
                    {#each app.override?.exclusiveUserIdAccessControl ?? [] as userId, index}
                        <span class="font-medium">{userId}</span>
                        {#if index < (app.override?.exclusiveUserIdAccessControl ?? []).length - 1}
                            <span class="text-muted-foreground">, </span>
                        {/if}
                    {/each}
                </ul>
            {/if}
        </div>
    </div>
{/snippet}
