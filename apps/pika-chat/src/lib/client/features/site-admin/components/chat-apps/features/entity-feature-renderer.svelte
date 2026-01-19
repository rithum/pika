<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { EntityFeatureForChatApp } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';

    interface Props {
        featureEnabled: boolean;
        overriddenFeature: EntityFeatureForChatApp | undefined;
        originalFeature: EntityFeatureForChatApp | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
    }

    const appState = getContext<AppState>('appState');
    const enabledAtSiteLevel = $derived.by(() => {
        const siteFeature = appState.siteAdmin.siteFeatures?.entity;
        return siteFeature?.enabled ?? false;
    });

    const entityAttributeName = $derived.by(() => {
        const siteFeature = appState.siteAdmin.siteFeatures?.entity;
        return siteFeature?.attributeName;
    });

    const entityDisplayName = $derived.by(() => {
        const siteFeature = appState.siteAdmin.siteFeatures?.entity;
        return siteFeature?.displayNameSingular || 'entity';
    });

    const message = $derived.by(() => {
        let result: string;

        if (enabledAtSiteLevel) {
            if (featureEnabled) {
                result = `The entity feature is enabled. Features applicable to entity (such as session sharing) will use the user's entity information.`;
            } else {
                if (isOverrideMode) {
                    result = `The entity feature has been overridden and turned off for this chat app.`;
                } else {
                    result = `The entity feature has been disabled by chat app configuration.`;
                }
            }
        } else {
            result =
                'The entity feature is disabled at the site level and may not be enabled for this chat app. You can enable it in the pika-config.ts file in the siteFeatures.entity section.';
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

    function ensureFeature(): EntityFeatureForChatApp {
        if (!isOverrideMode) {
            throw new Error('EntityFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'entity',
                enabled: originalFeature?.enabled ?? true, // Default to enabled if site level is enabled
                ...originalFeature,
            } as EntityFeatureForChatApp;
        }

        return overriddenFeature;
    }
</script>

<div class="space-y-2">
    <div>{message}</div>
    {#if enabledAtSiteLevel && featureEnabled}
        <div class="text-sm text-muted-foreground">
            <p><strong>Entity Attribute:</strong> {entityAttributeName}</p>
            <p><strong>Entity Name:</strong> {entityDisplayName}</p>
        </div>
    {/if}
    {#if enabledAtSiteLevel}
        <div class="text-sm text-muted-foreground bg-info-bg border border-info/20 rounded p-3">
            <p class="font-medium text-info">About Entity Feature</p>
            <p class="text-info/80">
                The entity feature provides organization-based access control and session sharing. When enabled:
            </p>
            <ul class="list-disc list-inside ml-2 text-info/80 mt-1">
                <li>Users are associated with their organizational entity (e.g., account, company)</li>
                <li>Shared sessions are scoped to the user's entity for security</li>
                <li>Admin interfaces can filter data by entity</li>
                <li>Internal users can access any shared content regardless of entity</li>
            </ul>
            <p class="text-info/80 mt-2">
                <strong>Note:</strong> Chat apps can only disable this feature, not modify the site-level entity configuration.
            </p>
        </div>
    {/if}
</div>
