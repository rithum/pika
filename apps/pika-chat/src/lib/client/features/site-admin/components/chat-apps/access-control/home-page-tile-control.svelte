<script lang="ts">
    import { assert } from '$lib/utils';
    import type { ChatApp, UserChatAppRule, UserType } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import { Label } from 'pika-ux/shadcn/label';
    import * as RadioGroup from 'pika-ux/shadcn/radio-group';
    import { evaluateHomeTileForPopulation } from './access-control-summary';

    interface Props {
        chatApp: ChatApp;
        chatAppOriginal: ChatApp;
        isOverrideMode: boolean;
        disabled?: boolean;
        /** The app's effective userTypes (override.userTypes || chatApp.userTypes) — what the tile rules compare against. */
        effectiveAppUserTypes: UserType[];
        /** Site-wide default rules, if known (siteFeatures.homePage.linksToChatApps.userChatAppRules). */
        siteRules: UserChatAppRule[] | undefined;
    }

    let { chatApp = $bindable(), chatAppOriginal, isOverrideMode, disabled = false, effectiveAppUserTypes, siteRules }: Props = $props();

    let controlsDisabled = $derived(!isOverrideMode || disabled);

    type TilePreset = 'everyone' | 'internal-only' | 'hidden' | 'site-default';

    const RULE_INTERNAL: UserChatAppRule = { userTypes: ['internal-user'], chatAppUserTypes: ['internal-user', 'external-user'] };
    const RULE_EXTERNAL: UserChatAppRule = { userTypes: ['external-user'], chatAppUserTypes: ['internal-user', 'external-user'] };

    function classify(rules: UserChatAppRule[] | undefined | null): TilePreset | 'custom' {
        if (rules === undefined || rules === null) {
            return 'site-default';
        }
        const internalVisible = evaluateHomeTileForPopulation('internal-user', effectiveAppUserTypes, rules);
        const externalVisible = evaluateHomeTileForPopulation('external-user', effectiveAppUserTypes, rules);
        if (internalVisible && externalVisible) return 'everyone';
        if (internalVisible && !externalVisible) return 'internal-only';
        if (!internalVisible && !externalVisible) return 'hidden';
        return 'custom';
    }

    let currentPreset = $derived(classify(chatApp.override?.homePageFilterRules as UserChatAppRule[] | undefined | null));
    let originalPreset = $derived(classify(chatAppOriginal.override?.homePageFilterRules as UserChatAppRule[] | undefined | null));

    function applyPreset(preset: TilePreset) {
        assert(isOverrideMode, 'isOverrideMode must be true');
        assert(chatApp.override, 'chatApp.override must be defined');

        if (preset === 'site-default') {
            // null, not undefined, so the removal survives JSON serialization of the save request.
            (chatApp.override as unknown as Record<string, unknown>).homePageFilterRules = null;
        } else if (preset === 'everyone') {
            chatApp.override.homePageFilterRules = [RULE_INTERNAL, RULE_EXTERNAL];
        } else if (preset === 'internal-only') {
            chatApp.override.homePageFilterRules = [RULE_INTERNAL];
        } else {
            chatApp.override.homePageFilterRules = [];
        }
    }

    let siteDefaultEffect = $derived.by(() => {
        if (!siteRules) {
            return 'site rules not visible to this page';
        }
        const internalVisible = evaluateHomeTileForPopulation('internal-user', effectiveAppUserTypes, siteRules);
        const externalVisible = evaluateHomeTileForPopulation('external-user', effectiveAppUserTypes, siteRules);
        const visibleTo = [internalVisible ? 'internal users' : undefined, externalVisible ? 'external users' : undefined].filter(Boolean);
        return visibleTo.length > 0 ? `currently: tile shows for ${visibleTo.join(' and ')}` : 'currently: hidden for everyone';
    });
</script>

<div class="border-t pt-4">
    <div class="flex items-center gap-2 mb-1">
        <Label class="text-sm font-medium">Home page tile</Label>
        <PopupHelp popoverClasses="w-[420px]">
            <p>
                Whether this chat app's tile appears on the chat home page, per population. Independent of access:
                the tile only ever shows to users who already pass the access rules above, and hiding the tile does
                not revoke access — direct links keep working.
            </p>
        </PopupHelp>
    </div>
    {#if currentPreset === 'custom'}
        <p class="text-xs text-warning mb-2">
            Custom tile rules are configured (visible to external users only). Picking an option below replaces them.
        </p>
    {/if}
    <RadioGroup.Root
        bind:value={
            () => (currentPreset === 'custom' ? '' : currentPreset),
            (value) => {
                if (value) {
                    applyPreset(value as TilePreset);
                }
            }
        }
        disabled={controlsDisabled}
        class="mt-1"
    >
        <div class="flex items-center gap-2">
            <RadioGroup.Item value="everyone" id="tile-everyone" />
            <Label for="tile-everyone">Show to everyone who has access (recommended)</Label>
        </div>
        <div class="flex items-center gap-2">
            <RadioGroup.Item value="internal-only" id="tile-internal-only" />
            <Label for="tile-internal-only">Internal users only</Label>
        </div>
        <div class="flex items-center gap-2">
            <RadioGroup.Item value="hidden" id="tile-hidden" />
            <Label for="tile-hidden">Hidden — reachable by direct link only</Label>
        </div>
        <div class="flex items-center gap-2">
            <RadioGroup.Item value="site-default" id="tile-site-default" />
            <Label for="tile-site-default">Use site default rules ({siteDefaultEffect})</Label>
        </div>
    </RadioGroup.Root>
    {#if isOverrideMode}
        <p class="text-xs text-muted-foreground mt-1">
            Original: {originalPreset === 'custom' ? 'custom rules' : originalPreset}
        </p>
    {/if}
</div>
