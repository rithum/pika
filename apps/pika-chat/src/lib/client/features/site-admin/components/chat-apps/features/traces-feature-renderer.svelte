<script lang="ts">
    import PopupHelp from '$lib/components/ui-pika/popup-help/popup-help.svelte';
    import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
    import { Label } from '$lib/components/ui/label';
    import { assert } from '$lib/utils';
    import type { FeatureError, TracesFeatureForChatApp } from '@pika/shared/types/chatbot/chatbot-types';
    import GeneralAccessControl from '../access-control/general-access-control.svelte';

    interface Props {
        overriddenFeature: TracesFeatureForChatApp | undefined;
        originalFeature: TracesFeatureForChatApp | undefined;
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
        setValid,
        featureEnabled,
        disabled,
    }: Props = $props();

    let validErrors = $derived.by(() => {
        const mode = isOverrideMode;
        const ovFeature = overriddenFeature;
        const orFeature = originalFeature;
        const feature = mode ? ovFeature : orFeature;
        let errors: FeatureError[] = [];

        if (feature && feature.enabled) {
            if ((feature.userRoles ?? []).length == 0 && (feature.userTypes ?? []).length == 0) {
                errors.push({
                    desc: 'No users have been granted access to basic traces.  Correct this or disable feature.',
                    parentShouldIgnore: true,
                });
            }
            if (
                feature.detailedTraces?.enabled &&
                (feature.detailedTraces?.userRoles ?? []).length == 0 &&
                (feature.detailedTraces?.userTypes ?? []).length == 0
            ) {
                errors.push({
                    desc: 'No users have been granted access to detailed traces.  Correct this or disable feature.',
                    parentShouldIgnore: true,
                });
            }
        }

        return errors;
    });

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    // Keep state variables for GeneralAccessControl compatibility
    // let enabled = $state(false);
    // let userTypes = $state<UserType[]>([]);
    // let userRoles = $state<UserRole[]>([]);
    // let applyRulesAs = $state<'and' | 'or'>('and');

    // // Detailed traces settings
    // let detailedEnabled = $state(false);
    // let detailedUserTypes = $state<UserType[]>([]);
    // let detailedUserRoles = $state<UserRole[]>([]);
    // let detailedApplyRulesAs = $state<'and' | 'or'>('and');

    function ensureFeature(): TracesFeatureForChatApp {
        if (!isOverrideMode) {
            throw new Error('TracesFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'traces',
                enabled: originalFeature?.enabled ?? false,
                userTypes: originalFeature?.userTypes,
                userRoles: originalFeature?.userRoles,
                applyRulesAs: originalFeature?.applyRulesAs,
                detailedTraces: undefined,
                ...originalFeature,
            } as TracesFeatureForChatApp;
        }

        return overriddenFeature;
    }

    $effect(() => {
        if (isOverrideMode) {
            ensureFeature();
        } else {
            overriddenFeature = undefined;
        }
    });

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
        <div class="space-y-6">
            <!-- Basic Traces Access Control -->
            <div class="border rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <Label class="text-md font-semibold">Basic Traces</Label>
                    <PopupHelp popoverClasses="w-60">
                        <p class="text-xs text-muted-foreground mb-2">Shows orchestration and failure traces.</p>
                    </PopupHelp>
                </div>
                <GeneralAccessControl
                    bind:rulesObj={overriddenFeature}
                    rulesObjOriginal={originalFeature}
                    {isOverrideMode}
                    {disabled}
                    userTypesLabel="User Types Who Can Use this Feature"
                    userRolesLabel="User Roles Who Can Use this Feature"
                    entityNameCapitalized="Basic Traces"
                />
            </div>

            <!-- Detailed Traces Access Control -->
            <div class="border rounded-lg p-4">
                <div class="flex items-center gap-2 mb-4">
                    <Label class="text-md font-semibold">Detailed Traces</Label>
                    <PopupHelp popoverClasses="w-60">
                        <p class="text-xs text-muted-foreground mb-2">
                            Shows detailed parameter traces including exact values passed to tools (requires Basic
                            Traces to be enabled).
                        </p>
                    </PopupHelp>
                </div>
                <div class="flex items-center gap-2 mb-6">
                    <Checkbox
                        id="enable-detailed-traces-checkbox"
                        disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
                        bind:checked={
                            () => !!featureToShow?.detailedTraces?.enabled,
                            (value) => {
                                const f = ensureFeature();
                                if (value) {
                                    if (!f.detailedTraces) {
                                        f.detailedTraces = { enabled: true };
                                    }
                                } else {
                                    f.detailedTraces = undefined;
                                }
                            }
                        }
                    />
                    <Label for="enable-detailed-traces-checkbox">Enable Detailed Traces</Label>
                </div>
                {#if featureToShow?.detailedTraces?.enabled}
                    <GeneralAccessControl
                        {featureEnabled}
                        bind:rulesObj={
                            () => featureToShow?.detailedTraces,
                            (value) => {
                                assert(isOverrideMode, 'isOverrideMode must be true');
                                assert(overriddenFeature, 'overriddenFeature must be defined');
                                if (value) {
                                    overriddenFeature.detailedTraces = value;
                                } else {
                                    overriddenFeature.detailedTraces = undefined;
                                }
                            }
                        }
                        rulesObjOriginal={originalFeature?.detailedTraces}
                        {isOverrideMode}
                        {disabled}
                        userTypesLabel="User Types Who Can Use this Feature"
                        userRolesLabel="User Roles Who Can Use this Feature"
                        entityNameCapitalized="Detailed Traces"
                    />
                {/if}
            </div>
        </div>
    </div>

    {#if isOverridden && originalFeature}
        <div class="p-3 border border-blue-200 bg-blue-50 rounded text-sm text-blue-800">
            <div class="font-medium mb-1">Original Settings:</div>
            <div class="space-y-1">
                <div>Basic traces enabled: {originalFeature.enabled ? 'Yes' : 'No'}</div>
                <div>Basic traces user types: {originalFeature.userTypes?.join(', ') || 'All'}</div>
                <div>Detailed traces enabled: {originalFeature.detailedTraces?.enabled ? 'Yes' : 'No'}</div>
                {#if originalFeature.detailedTraces?.enabled}
                    <div>
                        Detailed traces user types: {originalFeature.detailedTraces.userTypes?.join(', ') || 'All'}
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>
