<script lang="ts">
    import { Label } from '$lib/components/ui/label';
    import { Input } from '$lib/components/ui/input';
    import { Textarea } from '$lib/components/ui/textarea';
    import type { LogoutFeatureForChatApp, UserType, UserRole } from '@pika/shared/types/chatbot/chatbot-types';
    import GeneralAccessControl from '../access-control/general-access-control.svelte';

    interface Props {
        overriddenFeature: LogoutFeatureForChatApp | undefined;
        originalFeature: LogoutFeatureForChatApp | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        chatAppId: string;
    }

    let { overriddenFeature = $bindable(), originalFeature, isOverrideMode, isOverridden, chatAppId }: Props = $props();

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    function ensureFeature(): LogoutFeatureForChatApp {
        if (!isOverrideMode) {
            throw new Error('LogoutFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'logout',
                enabled: originalFeature?.enabled ?? false,
                userTypes:
                    originalFeature?.userTypes && originalFeature.userTypes.length > 0
                        ? originalFeature.userTypes
                        : ['internal-user'],
                userRoles: [],
                applyRulesAs: 'and',
                menuItemTitle: 'Logout',
                dialogTitle: 'Logout',
                dialogDescription: 'Are you sure you want to logout?',
                ...originalFeature,
            } as LogoutFeatureForChatApp;
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
</script>

<div class="space-y-4">
    <div>
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
                        disabled={!isOverrideMode || !overriddenFeature?.enabled}
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
                        disabled={!isOverrideMode}
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
                        disabled={!isOverrideMode || !overriddenFeature?.enabled}
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
