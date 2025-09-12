<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import Combobox from '$ui/pika/combobox/combobox.svelte';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import type {
        SemanticDirectiveScope,
        SimpleOption,
        SemanticDirectiveForCreateOrUpdate,
    } from 'pika-shared/types/chatbot/chatbot-types';
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
                (!!directive && directive?.scopeType === 'entity') ||
                (!!scopeObj && scopeObj.scopeType === 'agent-entity' && typeof scopeObj.scopeValue === 'object')
            );
        } else {
            return (
                (mode === 'agent-entity' &&
                    scopeObj &&
                    scopeObj.scopeType === 'agent-entity' &&
                    typeof scopeObj.scopeValue === 'object') ||
                (mode === 'default' && scopeObj && scopeObj.scopeType === 'entity')
            );
        }
    });

    const appState = getContext<AppState>('appState');
    const iaState = appState.siteAdmin.instructionAugmentation;

    const featureEnabled = $derived(appState.siteAdmin.siteFeatures?.entity?.enabled ?? false);

    const entitySingularUpperIfExists = $derived.by(() => {
        const result = appState.siteAdmin.siteFeatures?.entity?.displayNameSingular;
        return result ? ` (${result.charAt(0).toUpperCase() + result.slice(1)})` : undefined;
    });

    const entitySingularUpper = $derived.by(() => {
        const result = appState.siteAdmin.siteFeatures?.entity?.displayNameSingular ?? 'Entity';
        return result.charAt(0).toUpperCase() + result.slice(1);
    });
    const entityPluralUpper = $derived.by(() => {
        const result = appState.siteAdmin.siteFeatures?.entity?.displayNamePlural ?? 'Entities';
        return result.charAt(0).toUpperCase() + result.slice(1);
    });
</script>

{#if featureEnabled && (mode === 'default' || isLegitAgentEntityScope)}
    <div class="flex flex-col gap-1 w-full mr-4">
        <div class="flex items-center gap-2 w-full">
            {#if mode !== 'edit'}
                <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by Entity{entitySingularUpperIfExists}</PopupHelp>
            {/if}
            <Combobox
                bind:value={
                    () => {
                        if (mode === 'edit') {
                            if (directive?.scopeType === 'entity') {
                                if (directive.scopeValue) {
                                    return { value: directive.scopeValue, label: directive.scopeValue } as SimpleOption;
                                } else {
                                    return undefined as SimpleOption | undefined;
                                }
                            }
                        } else if (directive?.scopeType === 'agent-entity') {
                            const val =
                                scopeObj && typeof scopeObj.scopeValue === 'object' && 'entity' in scopeObj.scopeValue
                                    ? scopeObj.scopeValue.entity
                                    : undefined;
                            return { value: val, label: val } as SimpleOption | undefined;
                        } else {
                            return undefined as SimpleOption | undefined;
                        }
                    },
                    (val) => {
                        if (!val) return;
                        if (mode === 'edit') {
                            if (directive && directive.scopeType === 'entity') {
                                directive.scopeValue = val?.value ?? undefined;
                                onChange?.();
                            } else if (directive?.scopeType === 'agent-entity') {
                                const obj = scopeObj!.scopeValue as Record<string, string | number>;
                                obj.entity = val?.value ?? undefined;
                                onChange?.();
                            }
                        } else {
                            let changed = false;
                            if (val) {
                                if (mode === 'default') {
                                    if (iaState.searchQuery.scopes) {
                                        if (
                                            !iaState.searchQuery.scopes.some(
                                                (scope) =>
                                                    scope.scopeType === 'entity' && scope.scopeValue === val.value
                                            )
                                        ) {
                                            iaState.searchQuery.scopes.push({
                                                scopeType: 'entity',
                                                scopeValue: val.value,
                                            });
                                            changed = true;
                                        }
                                    } else {
                                        iaState.searchQuery.scopes = [
                                            {
                                                scopeType: 'entity',
                                                scopeValue: val.value,
                                            },
                                        ];
                                        changed = true;
                                    }
                                } else if (isLegitAgentEntityScope) {
                                    const obj = scopeObj!.scopeValue as Record<string, string | number>;
                                    obj.entity = val.value;
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
                mapping={{
                    value: (val) => val?.value ?? '',
                    label: (val) => val?.label ?? '',
                }}
                options={iaState.valuesForEntityAutoComplete}
                onSearchValueChanged={(val) => iaState.getValuesForEntityAutoComplete(val)}
                loading={iaState.entityAutoCompleteSearchInProgress}
                optionTypeName={entitySingularUpper}
                optionTypeNamePlural={entityPluralUpper}
                minCharactersForSearch={2}
                inputPlaceholder={mode === 'edit'
                    ? `Add an entity${entitySingularUpperIfExists ?? ''} scope value...`
                    : `Add filter by Entity${entitySingularUpperIfExists ?? ''}...`}
                showValueInListEntries={true}
                wrapperClasses="flex-1 {mode === 'edit' ? 'w-[350px]' : 'w-[325px]'}"
            />
        </div>
    </div>
{/if}
