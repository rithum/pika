<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { NameValuePair } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from 'pika-ux/pika/simple-dropdown/simple-dropdown.svelte';
    import { getContext } from 'svelte';

    interface Props {
        flagged: boolean | undefined;
    }

    let { flagged = $bindable() }: Props = $props();
    const appState = getContext<AppState>('appState');

    const values: NameValuePair<boolean>[] = [
        { value: true, name: 'Flagged' },
        { value: false, name: 'Not Flagged' },
    ];
</script>

<div class="flex flex-col gap-1 mr-4 pr-2">
    <div class="flex items-center gap-2 w-full">
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by flagged for human review</PopupHelp>
        <SimpleDropdown
            bind:value={
                () => {
                    return values.find((v) => v.value === flagged);
                },
                (val) => {
                    if (flagged !== val?.value) {
                        flagged = val?.value ?? undefined;
                    }
                }
            }
            wrapperClasses="w-full flex-1"
            popupWidthClasses="w-[420px]"
            mapping={{
                value: (item) => (item.value === undefined ? '' : item.value.toString()),
                label: (item) => item.name,
            }}
            options={values}
            dontShowSearchInput={true}
            allowClear={true}
            inputPlaceholder="Filter by flagged for human review..."
        />
    </div>
</div>
