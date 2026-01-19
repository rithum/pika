<script lang="ts">
    import type {
        InstructionAugmentationFeatureForChatApp,
        InstructionAugmentationType,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import {
        InstructionAugmentationTypeDisplayNames,
        InstructionAugmentationTypes,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import SimpleDropdown from 'pika-ux/pika/simple-dropdown/simple-dropdown.svelte';
    import { Label } from 'pika-ux/shadcn/label';

    interface Props {
        overriddenFeature: InstructionAugmentationFeatureForChatApp | undefined;
        originalFeature: InstructionAugmentationFeatureForChatApp | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        chatAppId: string;
        featureEnabled: boolean;
        disabled: boolean;
    }

    let {
        overriddenFeature = $bindable(),
        originalFeature,
        isOverrideMode,
        isOverridden,
        chatAppId,
        featureEnabled,
        disabled,
    }: Props = $props();

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    const defaultType: InstructionAugmentationType = 'llm-semantic-directive-search';

    $effect(() => {
        if (isOverrideMode) {
            ensureFeature();
        } else {
            overriddenFeature = undefined;
        }
    });

    function ensureFeature(): InstructionAugmentationFeatureForChatApp {
        if (!isOverrideMode) {
            throw new Error('InstructionAugmentationFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'instructionAugmentation',
                enabled: originalFeature?.enabled ?? false,
                type: originalFeature?.type ?? defaultType,
                ...originalFeature,
            } as InstructionAugmentationFeatureForChatApp;
        }

        return overriddenFeature;
    }

    function getTypeDisplayName(type: InstructionAugmentationType): string {
        switch (type) {
            case 'llm-semantic-directive-search':
                return InstructionAugmentationTypeDisplayNames['llm-semantic-directive-search'];
            default:
                return type;
        }
    }
</script>

<div class="space-y-4 max-w-[460px]">
    <div>
        <div class="space-y-4">
            <div>
                <Label for="augmentation-type">Augmentation Type</Label>
                <SimpleDropdown
                    bind:value={
                        () => {
                            if (featureToShow?.type) {
                                return { type: featureToShow.type };
                            }
                            return undefined;
                        },
                        (value) => {
                            if (isOverrideMode && overriddenFeature && value) {
                                overriddenFeature.type = (value as { type: InstructionAugmentationType }).type;
                            }
                        }
                    }
                    disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
                    inputPlaceholder="Select augmentation type..."
                    wrapperClasses="w-[320px] mt-1"
                    mapping={{
                        value: (item: { type: InstructionAugmentationType }) => item.type,
                        label: (item: { type: InstructionAugmentationType }) => getTypeDisplayName(item.type),
                    }}
                    options={InstructionAugmentationTypes.map((type) => ({ type }))}
                    dontShowSearchInput={true}
                    popupWidthClasses="w-[320px]"
                    allowClear={false}
                />
                <p class="text-xs text-muted-foreground mt-1">
                    Choose the type of instruction augmentation to apply to agent interactions.
                </p>
            </div>
        </div>
    </div>

    {#if isOverridden && originalFeature}
        <div class="p-3 border border-info/20 bg-info-bg rounded text-sm text-info">
            <div class="font-medium mb-1">Original Settings:</div>
            <div class="space-y-1">
                <div>
                    Type: {originalFeature.type ? getTypeDisplayName(originalFeature.type) : 'Not configured'}
                </div>
            </div>
        </div>
    {/if}
</div>
