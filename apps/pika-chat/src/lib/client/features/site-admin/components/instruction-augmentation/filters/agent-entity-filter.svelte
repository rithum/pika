<script lang="ts">
    import { ChevronsUpDown } from '$icons/lucide';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import { Button } from '$ui/shadcn/button';
    import * as Popover from '$ui/shadcn/popover';
    import { Separator } from '$ui/shadcn/separator';
    import type {
        SemanticDirectiveForCreateOrUpdate,
        SemanticDirectiveScope,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import Scope from '../scope.svelte';
    import AgentsFilter from './agents-filter.svelte';
    import EntityFilter from './entity-filter.svelte';

    interface Props {
        mode?: 'filter' | 'edit';
        directive?: SemanticDirectiveForCreateOrUpdate;
        onChange?: () => void;
    }

    let { mode = 'filter', directive = $bindable(), onChange }: Props = $props();

    const unsetValue = '???';
    const appState = getContext<AppState>('appState');
    const iaState = appState.siteAdmin.instructionAugmentation;
    let open = $state(false);

    let scope = $state<SemanticDirectiveScope>({
        scopeType: 'agent-entity',
        scopeValue: { agent: unsetValue, entity: unsetValue },
    });

    const featureEnabled = $derived(appState.siteAdmin.siteFeatures?.entity?.enabled ?? false);

    const entitySingularUpperIfExists = $derived.by(() => {
        const result = appState.siteAdmin.siteFeatures?.entity?.displayNameSingular;
        return result ? ` (${result.charAt(0).toUpperCase() + result.slice(1)})` : undefined;
    });

    const readyToAddFilter = $derived.by(() => {
        const obj = scope.scopeValue as Record<string, string | number>;
        return obj.agent && obj.entity && obj.agent !== unsetValue && obj.entity !== unsetValue;
    });

    const editDisplayValue = $derived.by(() => {
        if (directive?.scopeValue) {
            const obj = directive?.scopeValue as Record<string, string | number>;
            return `${obj.agent} + ${obj.entity}`;
        } else {
            return undefined;
        }
    });
</script>

{#if featureEnabled}
    <div class="flex flex-col gap-1 mr-4 pr-2">
        <div class="flex items-center gap-2 w-full">
            {#if mode !== 'edit'}
                <PopupHelp popoverClasses="text-xs w-auto p-1">
                    Filter by Agent + Entity{entitySingularUpperIfExists}
                </PopupHelp>
            {/if}
            <Popover.Root
                bind:open
                onOpenChange={(val) => {
                    if (!val) {
                        scope = { scopeType: 'agent-entity', scopeValue: { agent: unsetValue, entity: unsetValue } };
                    }
                }}
            >
                <Popover.Trigger id="feedback-type-filter-label">
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="outline"
                            size="sm"
                            class="flex flex-1 truncate items-center justify-between h-9 "
                        >
                            {#if mode === 'edit'}
                                {#if !editDisplayValue}
                                    <span class="flex-1 min-w-0 truncate flex items-center text-muted-foreground">
                                        {mode === 'edit'
                                            ? 'Set Agent + Entity value...'
                                            : `Add filter by Agent + Entity${entitySingularUpperIfExists ?? ''}...`}
                                    </span>
                                {:else}
                                    <span class="flex-1 min-w-0 truncate flex items-center">
                                        {editDisplayValue}
                                    </span>
                                {/if}
                            {:else}
                                <span class="flex-1 min-w-0 truncate flex items-center text-muted-foreground">
                                    Add filter by Agent + Entity{entitySingularUpperIfExists ?? ''}...
                                </span>
                            {/if}
                            <ChevronsUpDown class="shrink-0 opacity-50" />
                        </Button>
                    {/snippet}
                </Popover.Trigger>
                <Popover.Content class="p-0 h-[220px] w-[400px]">
                    <div class="flex flex-row">
                        <div class="flex flex-col w-[400px]">
                            <div class="pl-4 pr-1 flex items-center justify-end">
                                <div class="mt-2 mb-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        class="h-6"
                                        onclick={() => {
                                            open = false;
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        disabled={!readyToAddFilter}
                                        size="sm"
                                        class="h-6"
                                        onclick={() => {
                                            if (mode === 'edit') {
                                                if (directive && directive.scopeType === 'agent-entity') {
                                                    directive.scopeValue = {
                                                        ...(scope.scopeValue as Record<string, string | number>),
                                                    };
                                                    onChange?.();
                                                }
                                                open = false;
                                            } else {
                                                let changed = false;
                                                const obj = scope.scopeValue as Record<string, string | number>;
                                                if (iaState.searchQuery.scopes) {
                                                    if (
                                                        !iaState.searchQuery.scopes.some(
                                                            (s) =>
                                                                s.scopeType === 'agent-entity' &&
                                                                typeof s.scopeValue === 'object' &&
                                                                s.scopeValue.agent === obj.agent &&
                                                                s.scopeValue.entity === obj.entity
                                                        )
                                                    ) {
                                                        iaState.searchQuery.scopes.push({
                                                            scopeType: 'agent-entity',
                                                            scopeValue: {
                                                                agent: obj.agent,
                                                                entity: obj.entity,
                                                            },
                                                        });
                                                        changed = true;
                                                    }
                                                } else {
                                                    iaState.searchQuery.scopes = [
                                                        {
                                                            scopeType: 'agent-entity',
                                                            scopeValue: {
                                                                agent: obj.agent,
                                                                entity: obj.entity,
                                                            },
                                                        },
                                                    ];
                                                    changed = true;
                                                }
                                                open = false;
                                                if (changed) {
                                                    iaState.searchQuery.directiveIds = undefined;
                                                }
                                            }
                                        }}
                                    >
                                        {mode === 'edit' ? 'Set Value' : 'Add Filter'}
                                    </Button>
                                </div>
                            </div>
                            <Separator />
                            <div class="p-4 pr-2 flex flex-col gap-4">
                                <div>
                                    <Scope {scope} />
                                </div>
                                <AgentsFilter
                                    scopeObj={scope}
                                    mode={mode === 'edit' ? 'edit' : 'agent-entity'}
                                    {directive}
                                />
                                <EntityFilter
                                    scopeObj={scope}
                                    mode={mode === 'edit' ? 'edit' : 'agent-entity'}
                                    {directive}
                                />
                            </div>
                        </div>
                    </div>
                </Popover.Content>
            </Popover.Root>
        </div>
    </div>
{/if}
