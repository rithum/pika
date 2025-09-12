<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';
    import type { ToolDefinition, SemanticDirectiveForCreateOrUpdate } from 'pika-shared/types/chatbot/chatbot-types';
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

    let tools = $derived.by(() => {
        return iaState.allTools.filter(
            (tool) =>
                !iaState.searchQuery.scopes?.some(
                    (scope) => scope.scopeType === 'tool' && scope.scopeValue === tool.toolId
                )
        );
    });
</script>

<div class="flex flex-col gap-1 mr-4 pr-2">
    <div class="flex items-center gap-2 w-full">
        {#if mode !== 'edit'}
            <PopupHelp popoverClasses="text-xs w-auto p-1"
                >Show semantic directives scoped to the selected tool(s)</PopupHelp
            >
        {/if}
        <SimpleDropdown
            bind:value={
                () => {
                    if (mode === 'edit' && directive?.scopeType === 'tool') {
                        if (directive.scopeValue) {
                            return iaState.allTools.find((tool) => tool.toolId === directive.scopeValue) as
                                | ToolDefinition
                                | undefined;
                        } else {
                            return undefined as ToolDefinition | undefined;
                        }
                    } else {
                        return undefined as ToolDefinition | undefined;
                    }
                },
                (val) => {
                    if (!val) return;

                    if (mode === 'edit' && directive && directive.scopeType === 'tool') {
                        directive.scopeValue = val?.toolId ?? undefined;
                        onChange?.();
                    } else {
                        let changed = false;
                        if (val) {
                            if (iaState.searchQuery.scopes) {
                                if (
                                    !iaState.searchQuery.scopes.some(
                                        (s) => s.scopeType === 'tool' && s.scopeValue === val.toolId
                                    )
                                ) {
                                    iaState.searchQuery.scopes.push({
                                        scopeType: 'tool',
                                        scopeValue: val.toolId,
                                    });
                                    changed = true;
                                }
                            } else {
                                iaState.searchQuery.scopes = [
                                    {
                                        scopeType: 'tool',
                                        scopeValue: val.toolId,
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
                value: (item) => item.toolId,
                label: (item) => `${item.displayName} (${item.toolId})`,
                secondaryLabel: (item) => item.description,
            }}
            options={tools}
            dontShowSearchInput={false}
            inputPlaceholder={mode === 'edit' ? 'Add a tool scope value...' : 'Add a tool scope filter...'}
        />
    </div>
</div>
