<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';
    import { Label } from '$ui/shadcn/label';
    import type { ChatApp } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';

    interface Props {
        chatAppId: string | undefined;
    }

    let { chatAppId = $bindable() }: Props = $props();
    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const sessionInsights = siteAdmin.sessionInsights;
</script>

<div class="flex flex-col gap-1 mr-4 pr-2">
    <div class="flex items-center gap-2 w-full">
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by chat app</PopupHelp>
        <SimpleDropdown
            bind:value={
                () => {
                    let result: ChatApp | undefined = undefined;
                    if (sessionInsights.searchQuery.chatAppId) {
                        result = (siteAdmin.chatApps ?? []).find(
                            (app) => app.chatAppId === sessionInsights.searchQuery.chatAppId
                        );
                    }
                    return result;
                },
                (val) => {
                    sessionInsights.searchQuery.chatAppId = val?.chatAppId ?? undefined;
                }
            }
            wrapperClasses="flex-1 w-full"
            popupWidthClasses="w-[420px]"
            mapping={{
                value: (item) => item.chatAppId,
                label: (item) => item.title,
                secondaryLabel: (item) => item.description,
            }}
            options={siteAdmin.chatApps}
            dontShowSearchInput={true}
            allowClear={true}
            inputPlaceholder="Filter by chat app..."
        />
    </div>
</div>
