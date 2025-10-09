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
                        if (sessionAttributes) {
                            sessionAttributes[sessionAttributeName] = val?.value;
                        } else {
                            sessionAttributes = {
                                [sessionAttributeName]: val?.value,
                            };
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
