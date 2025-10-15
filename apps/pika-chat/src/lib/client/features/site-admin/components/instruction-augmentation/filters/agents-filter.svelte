<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type {
        AgentDefinition,
        SemanticDirectiveForCreateOrUpdate,
        SemanticDirectiveScope,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from 'pika-ux/pika/simple-dropdown/simple-dropdown.svelte';
    import { getContext } from 'svelte';

    interface Props {
        mode?: 'default' | 'agent-entity' | 'edit';
        scopeObj?: SemanticDirectiveScope;
        directive?: SemanticDirectiveForCreateOrUpdate;
        onChange?: () => void;
    }

    let { mode = 'default', scopeObj = $bindable(), directive = $bindable(), onChange }: Props = $props();
    let isLegitAgentEntityScope = $derived.by(() => {
        if (mode === 'edit') {
            return (
                (!!directive && directive?.scopeType === 'agent') ||
                (!!scopeObj && scopeObj.scopeType === 'agent-entity' && typeof scopeObj.scopeValue === 'object')
            );
        } else {
            return (
                (mode === 'agent-entity' &&
                    scopeObj &&
                    scopeObj.scopeType === 'agent-entity' &&
                    typeof scopeObj.scopeValue === 'object') ||
                (mode === 'default' && scopeObj && scopeObj.scopeType === 'agent')
            );
        }
    });

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const iaState = siteAdmin.instructionAugmentation;

    let agents = $derived.by(() => {
        return iaState.allAgents.filter(
            (agent) =>
                !iaState.searchQuery.scopes?.some((scope) => {
                    if (mode === 'default') {
                        return scope.scopeType === 'agent' && scope.scopeValue === agent.agentId;
                    }
                })
        );
    });
</script>

{#if mode === 'default' || isLegitAgentEntityScope}
    <div class="flex flex-col gap-1 mr-4 pr-2">
        <div class="flex items-center gap-2 w-full">
            {#if mode !== 'edit'}
                <PopupHelp popoverClasses="text-xs w-auto p-1"
                    >Show semantic directives scoped to the selected agent(s)</PopupHelp
                >
            {/if}
            <SimpleDropdown
                bind:value={
                    () => {
                        if (mode === 'edit') {
                            if (directive?.scopeType === 'agent') {
                                if (directive.scopeValue) {
                                    return agents.find((agent) => agent.agentId === directive.scopeValue) as
                                        | AgentDefinition
                                        | undefined;
                                } else {
                                    return undefined as AgentDefinition | undefined;
                                }
                            } else {
                                return undefined as AgentDefinition | undefined;
                            }
                        } else if (directive?.scopeType === 'agent-entity') {
                            const val =
                                scopeObj && typeof scopeObj.scopeValue === 'object' && 'agent' in scopeObj.scopeValue
                                    ? scopeObj.scopeValue.agent
                                    : undefined;
                            return agents.find((agent) => agent.agentId === val) as AgentDefinition | undefined;
                        } else {
                            return undefined as AgentDefinition | undefined;
                        }
                    },
                    (val) => {
                        if (!val) return;

                        if (mode === 'edit' && directive && directive.scopeType === 'agent') {
                            directive.scopeValue = val?.agentId ?? undefined;
                            onChange?.();
                        } else {
                            let changed = false;
                            if (val) {
                                if (mode === 'default') {
                                    if (iaState.searchQuery.scopes) {
                                        if (
                                            !iaState.searchQuery.scopes.some(
                                                (s) => s.scopeType === 'agent' && s.scopeValue === val.agentId
                                            )
                                        ) {
                                            iaState.searchQuery.scopes.push({
                                                scopeType: 'agent',
                                                scopeValue: val.agentId,
                                            });
                                            changed = true;
                                        }
                                    } else {
                                        iaState.searchQuery.scopes = [
                                            {
                                                scopeType: 'agent',
                                                scopeValue: val.agentId,
                                            },
                                        ];
                                        changed = true;
                                    }
                                } else if (isLegitAgentEntityScope) {
                                    const obj = scopeObj!.scopeValue as Record<string, string | number>;
                                    obj.agent = val.agentId;
                                } else {
                                    throw new Error('Invalid scope object');
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
                    value: (item) => item.agentId,
                    label: (item) => item.agentId,
                    secondaryLabel: (item) =>
                        item.basePrompt
                            ? item.basePrompt.length > 100
                                ? item.basePrompt.substring(0, 100) + '...'
                                : item.basePrompt
                            : '',
                }}
                options={agents}
                dontShowSearchInput={false}
                inputPlaceholder={mode === 'edit' ? 'Add an agent scope value...' : 'Add an agent scope filter...'}
            />
        </div>
    </div>
{/if}
