<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { RecordOrUndef, SimpleOption } from 'pika-shared/types/chatbot/chatbot-types';
    import Combobox from 'pika-ux/pika/combobox/combobox.svelte';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import { getContext } from 'svelte';

    interface Props {
        sessionAttributes: RecordOrUndef;
    }

    let { sessionAttributes = $bindable() }: Props = $props();
    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const sessionInsights = siteAdmin.sessionInsights;
    let selectedEntity = $state<SimpleOption | undefined>(undefined);

    const featureEnabled = $derived(siteAdmin.siteFeatures?.entity?.enabled ?? false);

    // Initialize selectedEntity from sessionAttributes when available
    $effect(() => {
        const sessionAttributeName = siteAdmin.siteFeatures?.entity?.attributeName ?? 'entity';
        const currentValue = sessionAttributes?.[sessionAttributeName];

        if (currentValue && !selectedEntity) {
            // Find the entity in the retrieved entities to get the full SimpleOption
            const foundEntity = sessionInsights.entitiesRetrieved.find((e) => e.value === currentValue);
            if (foundEntity) {
                selectedEntity = foundEntity;
            } else {
                // If not found in retrieved list, create a SimpleOption from the value
                selectedEntity = {
                    value: currentValue,
                    label: currentValue,
                };
            }
        } else if (!currentValue && selectedEntity) {
            // Clear selection if sessionAttributes is cleared externally
            selectedEntity = undefined;
        }
    });
    const entitySingularUpper = $derived.by(() => {
        const result = siteAdmin.siteFeatures?.entity?.displayNameSingular ?? 'Entity';
        return result.charAt(0).toUpperCase() + result.slice(1);
    });
    const entitySingularLower = $derived.by(() => {
        const result = siteAdmin.siteFeatures?.entity?.displayNameSingular ?? 'entity';
        return result.charAt(0).toLowerCase() + result.slice(1);
    });
    const entityPluralUpper = $derived.by(() => {
        const result = siteAdmin.siteFeatures?.entity?.displayNamePlural ?? 'Entities';
        return result.charAt(0).toUpperCase() + result.slice(1);
    });
</script>

{#if featureEnabled}
    <div class="flex flex-col gap-1 w-full mr-4">
        <div class="flex items-center gap-2 w-full">
            <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by {entitySingularLower}</PopupHelp>
            <Combobox
                bind:value={
                    () => {
                        return selectedEntity;
                    },
                    (val) => {
                        selectedEntity = val;
                        const sessionAttributeName = siteAdmin.siteFeatures?.entity?.attributeName ?? 'entity';

                        if (val?.value) {
                            // Set the value
                            if (sessionAttributes) {
                                sessionAttributes[sessionAttributeName] = val.value;
                            } else {
                                sessionAttributes = {
                                    [sessionAttributeName]: val.value,
                                };
                            }
                        } else {
                            // Clear the value by deleting the key
                            if (sessionAttributes) {
                                delete sessionAttributes[sessionAttributeName];
                            }
                        }
                    }
                }
                mapping={{
                    value: (val) => val?.value ?? '',
                    label: (val) => val?.label ?? '',
                }}
                options={sessionInsights.valuesForEntityAutoComplete}
                onSearchValueChanged={(val) => sessionInsights.getValuesForEntityAutoComplete(val)}
                loading={sessionInsights.entityAutoCompleteSearchInProgress}
                optionTypeName={entitySingularUpper}
                optionTypeNamePlural={entityPluralUpper}
                minCharactersForSearch={2}
                allowClear={true}
                inputPlaceholder="Filter by {entitySingularUpper}..."
                showValueInListEntries={true}
                wrapperClasses="flex-1 w-full"
            />
        </div>
    </div>
{/if}
