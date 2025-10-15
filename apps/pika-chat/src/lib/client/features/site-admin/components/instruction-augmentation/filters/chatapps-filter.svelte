<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { ChatAppLite, SemanticDirectiveForCreateOrUpdate } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from 'pika-ux/pika/simple-dropdown/simple-dropdown.svelte';
    import { getContext } from 'svelte';

    interface Props {
        mode?: 'filter' | 'edit';
        directive?: SemanticDirectiveForCreateOrUpdate;
        onChange?: () => void;
    }

    let { mode = 'filter', directive = $bindable(), onChange }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const iaState = siteAdmin.instructionAugmentation;

    let chatApps = $derived.by(() => {
        return siteAdmin.chatApps.filter(
            (app) =>
                !iaState.searchQuery.scopes?.some(
                    (scope) => scope.scopeType === 'chatapp' && scope.scopeValue === app.chatAppId
                )
        );
    });
</script>

<div class="flex flex-col gap-1 mr-4 pr-2">
    <div class="flex items-center gap-2 w-full">
        {#if mode === 'filter'}
            <PopupHelp popoverClasses="text-xs w-auto p-1"
                >Show semantic directives scoped to the selected chat app</PopupHelp
            >
        {/if}
        <SimpleDropdown
            bind:value={
                () => {
                    if (mode === 'edit' && directive?.scopeType === 'chatapp') {
                        if (directive.scopeValue) {
                            return siteAdmin.chatApps.find((app) => app.chatAppId === directive.scopeValue) as
                                | ChatAppLite
                                | undefined;
                        } else {
                            return undefined as ChatAppLite | undefined;
                        }
                    } else {
                        return undefined as ChatAppLite | undefined;
                    }
                },
                (val) => {
                    if (!val) return;

                    if (mode === 'edit' && directive && directive.scopeType === 'chatapp') {
                        directive.scopeValue = val?.chatAppId ?? undefined;
                        onChange?.();
                    } else {
                        let changed = false;
                        if (val) {
                            if (iaState.searchQuery.scopes) {
                                if (
                                    !iaState.searchQuery.scopes.some(
                                        (s) => s.scopeType === 'chatapp' && s.scopeValue === val.chatAppId
                                    )
                                ) {
                                    iaState.searchQuery.scopes.push({
                                        scopeType: 'chatapp',
                                        scopeValue: val.chatAppId,
                                    });
                                    changed = true;
                                }
                            } else {
                                iaState.searchQuery.scopes = [
                                    {
                                        scopeType: 'chatapp',
                                        scopeValue: val.chatAppId,
                                    },
                                ];
                                changed = true;
                            }
                        }
                        if (changed) {
                            iaState.searchQuery.directiveIds = undefined;
                        }
                    }
                }
            }
            wrapperClasses="flex-1 w-full"
            popupWidthClasses="w-[420px]"
            mapping={{
                value: (item) => item.chatAppId,
                label: (item) => item.title,
                secondaryLabel: (item) => item.description,
            }}
            options={chatApps}
            dontShowSearchInput={true}
            inputPlaceholder={mode === 'edit' ? 'Add a chat app scope value...' : 'Add a chat app scope filter...'}
        />
    </div>
</div>
