<script lang="ts">
    import { Label } from '$lib/components/ui/label';
    import { Checkbox } from '$lib/components/ui/checkbox';
    import type { UiCustomizationFeature } from '@pika/shared/types/chatbot/chatbot-types';
    import PopupHelp from '$lib/components/ui-pika/popup-help/popup-help.svelte';

    interface Props {
        overriddenFeature: UiCustomizationFeature | undefined;
        originalFeature: UiCustomizationFeature | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        chatAppId: string;
    }

    let { overriddenFeature = $bindable(), originalFeature, isOverrideMode, isOverridden, chatAppId }: Props = $props();

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    function ensureFeature(): UiCustomizationFeature {
        if (!isOverrideMode) {
            throw new Error('UiCustomizationFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'uiCustomization',
                enabled: originalFeature?.enabled ?? false,
                showChatHistoryInStandaloneMode: true,
                showUserRegionInLeftNav: true,
                ...originalFeature,
            } as UiCustomizationFeature;
        }

        return overriddenFeature;
    }

    function updateShowChatHistory(value: boolean) {
        if (!isOverrideMode) return;
        const feature = ensureFeature();
        feature.showChatHistoryInStandaloneMode = value;
    }

    function updateShowUserRegion(value: boolean) {
        if (!isOverrideMode) return;
        const feature = ensureFeature();
        feature.showUserRegionInLeftNav = value;
    }
</script>

<div class="space-y-4">
    <div>
        <div class="space-y-4">
            <!-- Chat History Option -->
            <div class="flex items-center space-x-2">
                <Checkbox
                    id="show-chat-history"
                    bind:checked={() => featureToShow?.showChatHistoryInStandaloneMode ?? true, updateShowChatHistory}
                    disabled={!isOverrideMode}
                />
                <Label for="show-chat-history">Show chat history in standalone mode</Label>
                <PopupHelp popoverClasses="w-60">
                    <div class="text-xs text-muted-foreground">
                        Standalone mode is a dedicated chat web site. Embedded mode is when the chat app is embedded in
                        another web site as a slide-in chat widget. Turn this on to allow users to see their chat
                        history in the left sidebar in standalone mode. Defaults to on.
                    </div>
                </PopupHelp>
            </div>
            <!-- User Region Option -->
            <div class="flex items-center space-x-2">
                <Checkbox
                    id="show-user-region"
                    bind:checked={() => featureToShow?.showUserRegionInLeftNav ?? true, updateShowUserRegion}
                    disabled={true}
                />
                <Label for="show-user-region">Show user region in left navigation</Label>
                <PopupHelp popoverClasses="w-60">
                    <div class="text-xs text-muted-foreground">
                        This feature is turned off at present and we are taking feedback on whether it is useful and
                        should be brought back.
                    </div>
                </PopupHelp>
            </div>
        </div>
    </div>

    {#if isOverridden && originalFeature}
        <div class="p-3 border border-blue-200 bg-blue-50 rounded text-sm text-blue-800">
            <div class="font-medium mb-1">Original Settings:</div>
            <div class="space-y-1">
                <div>Show chat history: {(originalFeature.showChatHistoryInStandaloneMode ?? true) ? 'Yes' : 'No'}</div>
                <div>Show user region: {(originalFeature.showUserRegionInLeftNav ?? true) ? 'Yes' : 'No'}</div>
            </div>
        </div>
    {/if}
</div>
