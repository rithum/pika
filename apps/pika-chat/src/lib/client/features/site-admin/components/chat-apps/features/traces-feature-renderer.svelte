<script lang="ts">
    import { Label } from '$lib/components/ui/label';
    import type { TracesFeatureForChatApp, UserRole, UserType } from '@pika/shared/types/chatbot/chatbot-types';
    import GeneralAccessControl from '../access-control/general-access-control.svelte';
    import PopupHelp from '$lib/components/ui-pika/popup-help/popup-help.svelte';
    import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
    import { assert } from '$lib/utils';

    interface Props {
        overriddenFeature: TracesFeatureForChatApp | undefined;
        originalFeature: TracesFeatureForChatApp | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        chatAppId: string;
        setValid: (valid: boolean) => void;
    }

    let {
        overriddenFeature = $bindable(),
        originalFeature,
        isOverrideMode,
        isOverridden,
        chatAppId,
        setValid,
    }: Props = $props();

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
            return ['No users have been granted access to basic traces.  Correct this or disable feature.'];
        }

        return [];
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
                userTypes:
                    originalFeature?.userTypes && originalFeature.userTypes.length > 0
                        ? originalFeature.userTypes
                        : ['internal-user'],
                userRoles: [],
                applyRulesAs: 'and',
                detailedTraces: undefined,
                ...originalFeature,
            } as TracesFeatureForChatApp;
        } else if (overriddenFeature.enabled && !overriddenFeature.userTypes) {
            overriddenFeature.userTypes = ['internal-user'];
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
        setValid(validErrors.length === 0);
    });
</script>

<div class="space-y-4">
    <div>
        {#if validErrors.length > 0}
            <div class="p-3 border border-red-200 bg-red-50 rounded text-sm text-red-800 mb-4">
                {#each validErrors as error}
                    <div>{error}</div>
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
                        disabled={!isOverrideMode || !overriddenFeature?.enabled}
                        bind:checked={
                            () => !!featureToShow?.detailedTraces?.enabled,
                            (value) => {
                                const f = ensureFeature();
                                if (value) {
                                    if (!f.detailedTraces) {
                                        f.detailedTraces = { enabled: true };
                                    }
                                    if (!f.detailedTraces.userTypes) {
                                        f.detailedTraces.userTypes = ['internal-user'];
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
                        bind:rulesObj={
                            () => featureToShow?.detailedTraces,
                            (value) => {
                                assert(isOverrideMode, 'isOverrideMode must be true');
                                assert(overriddenFeature, 'overriddenFeature must be defined');
                                if (value) {
                                    overriddenFeature.detailedTraces = value;
                                    if (!overriddenFeature.detailedTraces.userTypes) {
                                        overriddenFeature.detailedTraces.userTypes = ['internal-user'];
                                    }
                                } else {
                                    overriddenFeature.detailedTraces = undefined;
                                }
                            }
                        }
                        rulesObjOriginal={originalFeature?.detailedTraces}
                        {isOverrideMode}
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
