<script lang="ts">
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';
    import { Label } from '$ui/shadcn/label';
    import {
        VerifyResponseRetryableClassificationDescriptions,
        type FeatureError,
        type VerifyResponseFeatureForChatApp,
    } from '@pika/shared/types/chatbot/chatbot-types';
    import GeneralAccessControl from '../access-control/general-access-control.svelte';

    interface Props {
        overriddenFeature: VerifyResponseFeatureForChatApp | undefined;
        originalFeature: VerifyResponseFeatureForChatApp | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        chatAppId: string;
        setValid: (valid: boolean) => void;
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
        setValid,
        disabled,
    }: Props = $props();

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    const retryableClassificationDescriptions = $derived(
        Object.values(VerifyResponseRetryableClassificationDescriptions)
    );

    let validErrors = $derived.by(() => {
        const mode = isOverrideMode;
        const ovFeature = overriddenFeature;
        const orFeature = originalFeature;
        const feature = mode ? ovFeature : orFeature;

        if (
            feature &&
            feature.enabled &&
            (feature.userRoles ?? []).length == 0 &&
            (feature.userTypes ?? []).length == 0
        ) {
            return [
                {
                    desc: 'No users have been granted access to verify response.  Correct this or disable feature.',
                    parentShouldIgnore: true,
                },
            ] as FeatureError[];
        }

        return [];
    });

    $effect(() => {
        if (isOverrideMode) {
            ensureFeature();
        } else {
            overriddenFeature = undefined;
        }
    });

    function ensureFeature(): VerifyResponseFeatureForChatApp {
        if (!isOverrideMode) {
            throw new Error('VerifyResponseFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'verifyResponse',
                enabled: originalFeature?.enabled ?? false,
                autoRepromptThreshold: undefined,
                userTypes: originalFeature?.userTypes,
                userRoles: originalFeature?.userRoles,
                applyRulesAs: originalFeature?.applyRulesAs,
                ...originalFeature,
            } as VerifyResponseFeatureForChatApp;
        }

        return overriddenFeature;
    }

    $effect(() => {
        setValid(validErrors.filter((error) => !error.parentShouldIgnore).length === 0);
    });
</script>

<div class="space-y-4">
    <div>
        {#if validErrors.length > 0}
            <div class="p-3 border border-red-200 bg-red-50 rounded text-sm text-red-800 mb-4">
                {#each validErrors as error}
                    <div>{error.desc}</div>
                {/each}
            </div>
        {/if}
        <div class="space-y-5">
            <!-- Auto-reprompt threshold -->
            <div>
                <div class="flex items-center gap-2 mb-1">
                    <Label for="threshold">Auto-reprompt Threshold</Label>
                    <PopupHelp popoverClasses="w-60">
                        <p class="text-xs text-muted-foreground mb-2">
                            Choose when to automatically re-prompt the AI to improve responses.
                        </p>
                        <p class="text-xs text-muted-foreground mb-2">
                            If not set, we will not automatically re-prompt to get an improved result.
                        </p>
                        <p class="text-xs text-muted-foreground">
                            The threshold works for the value selected and any value below it. So if you select B, then
                            we will automatically re-prompt if the response is B, C, or F. If you select C, then we will
                            automatically re-prompt if the response is C or F and so on.
                        </p>
                    </PopupHelp>
                </div>
                <SimpleDropdown
                    bind:value={
                        () => {
                            if (featureToShow?.autoRepromptThreshold) {
                                return VerifyResponseRetryableClassificationDescriptions[
                                    featureToShow.autoRepromptThreshold
                                ];
                            } else {
                                return undefined;
                            }
                        },
                        (value) => {
                            const feature = ensureFeature();
                            if (value) {
                                feature.autoRepromptThreshold = value.classification;
                            } else {
                                feature.autoRepromptThreshold = undefined;
                            }
                        }
                    }
                    disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
                    inputPlaceholder="Select threshold..."
                    widthClasses="w-[320px]"
                    mapping={{
                        value: (item) => item.classification,
                        label: (item) => item.label,
                        secondaryLabel: (item) => item.description,
                    }}
                    options={retryableClassificationDescriptions}
                    dontShowSearchInput={true}
                    showValueInListEntries={true}
                    popupWidthClasses="w-[320px]"
                    allowClear={true}
                />
            </div>

            <!-- Access Control -->
            <div>
                <GeneralAccessControl
                    {featureEnabled}
                    {disabled}
                    bind:rulesObj={overriddenFeature}
                    rulesObjOriginal={originalFeature}
                    {isOverrideMode}
                    userTypesLabel="User Types Who Can Use this Feature"
                    userRolesLabel="User Roles Who Can Use this Feature"
                    entityNameCapitalized="Verify Response"
                />
            </div>
        </div>
    </div>

    {#if isOverridden && originalFeature}
        <div class="p-3 border border-blue-200 bg-blue-50 rounded text-sm text-blue-800">
            <div class="font-medium mb-1">Original Settings:</div>
            <div class="space-y-1">
                <div>Enabled: {originalFeature.enabled ? 'Yes' : 'No'}</div>
                <div>Auto-reprompt threshold: {originalFeature.autoRepromptThreshold || 'Not Set'}</div>
                <div>User types: {originalFeature.userTypes?.join(', ') || 'None specified'}</div>
                <div>User roles: {originalFeature.userRoles?.join(', ') || 'None specified'}</div>
            </div>
        </div>
    {/if}
</div>
