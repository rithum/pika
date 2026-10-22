<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { assert } from '$lib/utils';
    import type { ChatApp, ChatUserLite } from 'pika-shared/types/chatbot/chatbot-types';
    import List from 'pika-ux/pika/list/list.svelte';
    import { Label } from 'pika-ux/shadcn/label';
    import { getContext } from 'svelte';

    interface Props {
        chatApp: ChatApp;
        chatAppOriginal: ChatApp;
        isOverrideMode: boolean;
        disabled?: boolean;
    }

    let { chatApp = $bindable(), chatAppOriginal, isOverrideMode, disabled = false }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    let app = $derived(isOverrideMode ? chatApp : chatAppOriginal);

    let loadingUsers = $derived(siteAdmin.siteAdminOperationInProgress['getValuesForUserAutoComplete']);
</script>

<div class="space-y-6">
    {#if !siteAdmin.siteFeatures?.siteAdmin?.supportSpecificUserAccessControl?.enabled}
        <div class="p-3 bg-warning-bg border border-warning/20 rounded">
            <p class="text-sm text-warning">
                Support for specific user access control is not enabled. Please enable it in the pika-config.ts file and
                redeploy the site, making sure to follow the instructions on how to setup the feature to work.
            </p>
        </div>
    {:else}
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
    {/if}
</div>
