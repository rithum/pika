<script lang="ts">
    import { goto } from '$app/navigation';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { SessionInsightsFeature } from 'pika-shared/types/chatbot/chatbot-types';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import { getContext } from 'svelte';

    interface Props {
        featureEnabled: boolean;
        overriddenFeature: SessionInsightsFeature | undefined;
        originalFeature: SessionInsightsFeature | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
    }

    const appState = getContext<AppState>('appState');
    const enabledAtSiteLevel = $derived.by(() => {
        const siteFeature = appState.siteAdmin.siteFeatures?.sessionInsights;
        return siteFeature?.enabled ?? false;
    });

    const message = $derived.by(() => {
        let result: string;

        if (enabledAtSiteLevel) {
            if (featureEnabled) {
                result = 'The session insights feature is enabled.';
            } else {
                if (isOverrideMode) {
                    result = 'The session insights feature has been overridden and turned off for this chat app.';
                } else {
                    result = 'The session insights feature has been disabled by chat app configuration.';
                }
            }
        } else {
            result =
                'The session insights feature is disabled at the site level and may not be enabled for this chat app.  You can enable it in the pika-config.ts file in the siteAdmin.sessionInsights section.';
        }

        return result;
    });

    let { overriddenFeature = $bindable(), originalFeature, isOverrideMode, featureEnabled }: Props = $props();

    $effect(() => {
        if (isOverrideMode) {
            ensureFeature();
        } else {
            overriddenFeature = undefined;
        }
    });

    function ensureFeature(): SessionInsightsFeature {
        if (!isOverrideMode) {
            throw new Error('SessionInsightsFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'sessionInsights',
                enabled: originalFeature?.enabled ?? false,
                ...originalFeature,
            } as SessionInsightsFeature;
        }

        return overriddenFeature;
    }
</script>

<div class="space-y-2">
    <div>{message}</div>
    {#if enabledAtSiteLevel}
        <div>
            If you want to view the results of the session insights in this admin website, then you need to turn it on
            in the pika-config.ts file in the siteAdmin.sessionInsights section.

            <div class="mt-4">
                <Button
                    variant="link"
                    class="text-primary"
                    onclick={() => {
                        goto('/admin/session-insights');
                    }}
                >
                    Go to Session Insights
                </Button>
            </div>
        </div>
    {/if}
</div>
