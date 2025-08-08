<script lang="ts">
    import { Label } from '$ui/shadcn/label';
    import Combobox from '$ui/pika/combobox/combobox.svelte';
    import type { ChatUserLite, NameValuePair } from '@pika/shared/types/chatbot/chatbot-types';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { getContext } from 'svelte';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';

    interface Props {
        userId: string | undefined;
    }

    let { userId = $bindable() }: Props = $props();
    const appState = getContext<AppState>('appState');
    const sessionInsights = appState.siteAdmin.sessionInsights;
</script>

<div class="flex flex-col gap-1 w-full mr-4">
    <div class="flex items-center gap-2 w-full">
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by user</PopupHelp>
        <Combobox
            bind:value={
                () => {
                    let result: ChatUserLite | undefined = undefined;

                    if (userId) {
                        result = { userId };
                    }

                    return result;
                },
                (val) => {
                    userId = val?.userId ?? undefined;
                }
            }
            mapping={{
                value: (val) => val?.userId ?? '',
                label: (val) => val?.userId ?? '',
            }}
            options={sessionInsights.valuesForUserAutoComplete}
            onSearchValueChanged={(val) => sessionInsights.getValuesForUserAutoComplete(val)}
            loading={sessionInsights.userAutoCompleteSearchInProgress}
            optionTypeName="user"
            optionTypeNamePlural="users"
            minCharactersForSearch={3}
            allowClear={true}
            inputPlaceholder="Filter by user..."
            wrapperClasses="flex-1 w-full"
        />
    </div>
</div>
