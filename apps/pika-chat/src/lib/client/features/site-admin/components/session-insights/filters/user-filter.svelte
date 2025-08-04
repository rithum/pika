<script lang="ts">
    import { Label } from '$ui/shadcn/label';
    import Combobox from '$ui/pika/combobox/combobox.svelte';
    import type { ChatUserLite, NameValuePair } from '@pika/shared/types/chatbot/chatbot-types';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { getContext } from 'svelte';

    interface Props {
        userId: string | undefined;
    }

    let { userId = $bindable() }: Props = $props();
    const appState = getContext<AppState>('appState');
    const sessionInsights = appState.siteAdmin.sessionInsights;
</script>

<div class="flex flex-col gap-2">
    <Label class="text-sm font-medium text-muted-foreground">User</Label>
    <!-- onValueChanged={valueChanged} -->
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
        widthClasses="w-[320px]"
        minCharactersForSearch={3}
    />
</div>
