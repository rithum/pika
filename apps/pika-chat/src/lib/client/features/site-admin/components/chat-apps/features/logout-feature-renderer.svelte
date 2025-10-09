<script lang="ts">
    import type { FeatureError, LogoutFeatureForChatApp } from 'pika-shared/types/chatbot/chatbot-types';
    import { Input } from 'pika-ux/shadcn/input';
    import { Label } from 'pika-ux/shadcn/label';
    import { Textarea } from 'pika-ux/shadcn/textarea';
    import GeneralAccessControl from '../access-control/general-access-control.svelte';

    interface Props {
        overriddenFeature: LogoutFeatureForChatApp | undefined;
        originalFeature: LogoutFeatureForChatApp | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        chatAppId: string;
        featureEnabled: boolean;
        setValid: (valid: boolean) => void;
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
                    desc: 'No users have been granted access to logout.  Correct this or disable feature.',
                    parentShouldIgnore: true,
                },
            ] as FeatureError[];
        }

        return [];
    });

    function ensureFeature(): LogoutFeatureForChatApp {
        if (!isOverrideMode) {
            throw new Error('LogoutFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'logout',
                enabled: originalFeature?.enabled ?? false,
                userTypes: originalFeature?.userTypes,
                userRoles: originalFeature?.userRoles,
                applyRulesAs: originalFeature?.applyRulesAs,
                menuItemTitle: 'Logout',
                dialogTitle: 'Logout',
                dialogDescription: 'Are you sure you want to logout?',
                ...originalFeature,
            } as LogoutFeatureForChatApp;
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
        <div class="space-y-4">
            <!-- Access Control -->
            <div class="border rounded-lg p-4">
                <GeneralAccessControl
                    bind:rulesObj={overriddenFeature}
                    rulesObjOriginal={originalFeature}
                    {isOverrideMode}
                    userTypesLabel="User Types Who Can Use this Feature"
                    userRolesLabel="User Roles Who Can Use this Feature"
                    entityNameCapitalized="Logout Feature"
                />
            </div>

            <!-- Text Configuration -->
            <div class="space-y-4">
                <div>
                    <Label for="menu-title">Menu Item Title</Label>
                    <Input
                        id="menu-title"
                        bind:value={
                            () => featureToShow?.menuItemTitle || 'Logout',
                            (value) => {
                                if (isOverrideMode) {
                                    featureToShow!.menuItemTitle = value;
                                }
                            }
                        }
                        placeholder="Logout"
                        disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
                        class="mt-1"
                    />
                </div>

                <div>
                    <Label for="dialog-title">Dialog Title</Label>
                    <Input
                        id="dialog-title"
                        bind:value={
                            () => featureToShow?.dialogTitle || 'Logout',
                            (value) => {
                                if (isOverrideMode) {
                                    featureToShow!.dialogTitle = value;
                                }
                            }
                        }
                        placeholder="Logout"
                        disabled={!featureEnabled || !isOverrideMode || disabled}
                        class="mt-1"
                    />
                </div>

                <div>
                    <Label for="dialog-description">Dialog Description</Label>
                    <Textarea
                        id="dialog-description"
                        bind:value={
                            () => featureToShow?.dialogDescription || 'Are you sure you want to logout?',
                            (value) => {
                                if (isOverrideMode) {
                                    featureToShow!.dialogDescription = value;
                                }
                            }
                        }
                        placeholder="Are you sure you want to logout?"
                        disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
                        rows={2}
                        class="mt-1"
                    />
                </div>
            </div>
        </div>
    </div>

    {#if isOverridden && originalFeature}
        <div class="p-3 border border-blue-200 bg-blue-50 rounded text-sm text-blue-800">
            <div class="font-medium mb-1">Original Settings:</div>
            <div class="space-y-1">
                <div>Enabled: {originalFeature.enabled ? 'Yes' : 'No'}</div>
                <div>Menu title: {originalFeature.menuItemTitle || 'Logout'}</div>
                <div>Dialog title: {originalFeature.dialogTitle || 'Logout'}</div>
                <div>Dialog description: {originalFeature.dialogDescription || 'Are you sure you want to logout?'}</div>
                <div>User types: {originalFeature.userTypes?.join(', ') || 'All'}</div>
                <div>User roles: {originalFeature.userRoles?.join(', ') || 'All'}</div>
            </div>
        </div>
    {/if}
</div>
