<script lang="ts">
    import SimpleDropdown from '$lib/components/ui-pika/simple-dropdown/simple-dropdown.svelte';
    import { Label } from '$lib/components/ui/label';
    import {
        VerifyResponseRetryableClassificationDescriptions,
        type RetryableVerifyResponseClassification,
        type UserRole,
        type UserType,
        type VerifyResponseFeatureForChatApp,
    } from '@pika/shared/types/chatbot/chatbot-types';
    import GeneralAccessControl from '../access-control/general-access-control.svelte';
    import PopupHelp from '$lib/components/ui-pika/popup-help/popup-help.svelte';

    interface Props {
        overriddenFeature: VerifyResponseFeatureForChatApp | undefined;
        originalFeature: VerifyResponseFeatureForChatApp | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        chatAppId: string;
    }

    let { overriddenFeature = $bindable(), originalFeature, isOverrideMode, isOverridden, chatAppId }: Props = $props();

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    const retryableClassificationDescriptions = $derived(
        Object.values(VerifyResponseRetryableClassificationDescriptions)
    );

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
                userTypes: originalFeature?.enabled ? ['internal-user'] : undefined,
                userRoles: [],
                applyRulesAs: 'and',
                ...originalFeature,
            } as VerifyResponseFeatureForChatApp;
        } else if (overriddenFeature.enabled && !overriddenFeature.userTypes) {
            overriddenFeature.userTypes = ['internal-user'];
        }

        return overriddenFeature;
    }
</script>

<div class="space-y-4">
    <div>
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
                    enabled={!!featureToShow?.enabled}
                    bind:userTypes={
                        () => featureToShow?.userTypes || [],
                        (value) => {
                            featureToShow!.userTypes = value;
                        }
                    }
                    bind:userRoles={
                        () => featureToShow?.userRoles || [],
                        (value) => {
                            if (value && value.length > 0) {
                                featureToShow!.userRoles = value;
                            } else {
                                featureToShow!.userRoles = undefined;
                            }
                        }
                    }
                    bind:applyRulesAs={
                        () => featureToShow?.applyRulesAs || 'and',
                        (value) => {
                            featureToShow!.applyRulesAs = value;
                        }
                    }
                    {isOverrideMode}
                    isOverridden={() => isOverridden}
                    getOriginalValue={(field) => {
                        if (field === 'enabled') return originalFeature?.enabled;
                        return undefined;
                    }}
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
