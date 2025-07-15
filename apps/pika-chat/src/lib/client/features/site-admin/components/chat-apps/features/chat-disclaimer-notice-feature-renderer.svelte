<script lang="ts">
    import { Label } from '$lib/components/ui/label';
    import { Textarea } from '$lib/components/ui/textarea';
    import { Button } from '$lib/components/ui/button';
    import type { ChatDisclaimerNoticeFeatureForChatApp } from '@pika/shared/types/chatbot/chatbot-types';

    interface Props {
        overriddenFeature: ChatDisclaimerNoticeFeatureForChatApp | undefined;
        originalFeature: ChatDisclaimerNoticeFeatureForChatApp | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        chatAppId: string;
    }

    let { overriddenFeature = $bindable(), originalFeature, isOverrideMode, isOverridden, chatAppId }: Props = $props();

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    const defaultNotice = `This AI-powered chat is here to help, but it may not always be accurate. For urgent or complex issues, please contact customer support. The company isn't liable for problems caused by relying solely on this chat.`;

    $effect(() => {
        if (isOverrideMode) {
            ensureFeature();
        } else {
            overriddenFeature = undefined;
        }
    });

    function ensureFeature(): ChatDisclaimerNoticeFeatureForChatApp {
        if (!isOverrideMode) {
            throw new Error('ChatDisclaimerNoticeFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'chatDisclaimerNotice',
                enabled: originalFeature?.enabled ?? false,
                notice: originalFeature?.enabled ? (originalFeature?.notice ?? defaultNotice) : undefined,
                ...originalFeature,
            } as ChatDisclaimerNoticeFeatureForChatApp;
        } else if (overriddenFeature.enabled && !overriddenFeature.notice) {
            overriddenFeature.notice = originalFeature?.notice ?? defaultNotice;
        }

        return overriddenFeature;
    }
</script>

<div class="space-y-4">
    <div>
        <div class="space-y-4">
            <div>
                <Label for="notice-text">Disclaimer Text</Label>
                <Textarea
                    id="notice-text"
                    bind:value={
                        () => featureToShow?.notice,
                        (value) => {
                            if (isOverrideMode) {
                                featureToShow!.notice = value;
                            }
                        }
                    }
                    placeholder="Enter your disclaimer notice..."
                    disabled={!isOverrideMode || !overriddenFeature?.enabled}
                    rows={4}
                    class="mt-1"
                />
            </div>
        </div>
    </div>

    {#if isOverridden && originalFeature}
        <div class="p-3 border border-blue-200 bg-blue-50 rounded text-sm text-blue-800">
            <div class="font-medium mb-1">Original Settings:</div>
            <div class="space-y-1">
                <div>
                    Notice: {originalFeature.notice
                        ? `"${originalFeature.notice.substring(0, 100)}${originalFeature.notice.length > 100 ? '...' : ''}"`
                        : 'None'}
                </div>
            </div>
        </div>
    {/if}
</div>
