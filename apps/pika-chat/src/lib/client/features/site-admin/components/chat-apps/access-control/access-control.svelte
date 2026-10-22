<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { ChatApp, UserType } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import ConfigSection from '../../config-section.svelte';
    import { accessControlConfigFromSiteFeatures } from './access-control-config';
    import { summarizeAccessControl, summarizeHomeTileVisibility, validateAccessControl } from './access-control-summary';
    import ExclusiveEntityAccessControl from './exclusive-entity-access-control.svelte';
    import ExclusiveUserAccessControl from './exclusive-user-access-control.svelte';
    import HomePageTileControl from './home-page-tile-control.svelte';
    import WhoCanAccessBuilder from './who-can-access-builder.svelte';

    interface Props {
        chatApp: ChatApp;
        chatAppOriginal: ChatApp;
        isOverrideMode: boolean;
        accessExpanded: boolean;
        onToggleAccessSection: () => void;
        chatAppId: string;
        setValid: (valid: boolean) => void;
        disabled: boolean;
    }

    let {
        chatApp = $bindable(),
        chatAppOriginal,
        isOverrideMode,
        accessExpanded,
        onToggleAccessSection,
        chatAppId,
        setValid,
        disabled,
    }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    let app = $derived(isOverrideMode ? chatApp : chatAppOriginal);

    let rulesForSummary = $derived(app.override ?? app);

    let accessControlConfig = $derived(accessControlConfigFromSiteFeatures(siteAdmin.siteFeatures));
    let entitySingular = $derived(siteAdmin.siteFeatures?.entity?.displayNameSingular || 'account ID');

    let entityDisplayPluralLower = $derived.by(() => {
        const val =
            siteAdmin.siteFeatures?.entity?.enabled && siteAdmin.siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.enabled
                ? siteAdmin.siteFeatures?.entity?.displayNamePlural
                : undefined;
        return val ? val.charAt(0).toLowerCase() + val.slice(1) : 'accounts';
    });

    let summary = $derived(summarizeAccessControl(rulesForSummary, entityDisplayPluralLower, accessControlConfig));
    let validation = $derived(validateAccessControl(rulesForSummary, accessControlConfig));

    // Mirrors the server's `override?.userTypes || chatApp.userTypes || []`: an empty override wins.
    let effectiveAppUserTypes = $derived((app.override?.userTypes || app.userTypes || []) as UserType[]);
    let siteTileRules = $derived(siteAdmin.siteFeatures?.homePage?.linksToChatApps?.userChatAppRules);
    let tileSummary = $derived(
        summarizeHomeTileVisibility(
            { ...rulesForSummary, homePageFilterRules: app.override?.homePageFilterRules ?? undefined },
            effectiveAppUserTypes,
            siteTileRules
        )
    );

    $effect(() => {
        setValid(validation.errors.length === 0);
    });

    let exclusiveEntityOn = $state<UserType[]>([]);
    let exclusiveEntityOnInitialized = $state(false);
    $effect(() => {
        if (exclusiveEntityOnInitialized) return;
        const next: UserType[] = [];
        if ((app.override?.exclusiveInternalAccessControl ?? []).length > 0) {
            next.push('internal-user');
        }
        if ((app.override?.exclusiveExternalAccessControl ?? []).length > 0) {
            next.push('external-user');
        }
        exclusiveEntityOn = next;
        exclusiveEntityOnInitialized = true;
    });
</script>

<ConfigSection title="Access Control" expanded={accessExpanded} onToggle={onToggleAccessSection} hasErrors={validation.errors.length > 0}>
    <div class="flex gap-6">
        <div class="flex-1 space-y-6">
            <WhoCanAccessBuilder bind:chatApp {chatAppOriginal} {isOverrideMode} {disabled} {accessControlConfig} {entitySingular} />

            <HomePageTileControl bind:chatApp {chatAppOriginal} {isOverrideMode} {disabled} {effectiveAppUserTypes} siteRules={siteTileRules} />

            <div class="border border-warning/40 bg-warning-bg/40 rounded-lg p-4 space-y-2">
                <h3 class="text-sm font-semibold text-warning">Restriction / pilot mode</h3>
                <p class="text-xs text-muted-foreground">
                    Optional. Restrict a population to ONLY the accounts listed here — this overrides the role/type rules
                    above for that population. Leave both empty (no accounts listed) to use the rules above normally.
                </p>
                <ExclusiveEntityAccessControl bind:chatApp {chatAppOriginal} bind:exclusiveEntityOn {isOverrideMode} {chatAppId} {disabled} />
            </div>

            <div class="border border-destructive/40 bg-danger-bg/40 rounded-lg p-4 space-y-2">
                <h3 class="text-sm font-semibold text-destructive">Exclusive user ID access (nuclear option)</h3>
                <p class="text-xs text-muted-foreground">
                    Optional. If you list any user IDs here, ONLY those user IDs — internal or external — get access.
                    Everything else on this page, above and below, is ignored while this list is non-empty.
                </p>
                <ExclusiveUserAccessControl bind:chatApp {chatAppOriginal} {isOverrideMode} {disabled} />
            </div>
        </div>

        <div class="w-[320px] shrink-0 space-y-3">
            <div class="p-3 bg-info-bg border border-info/20 rounded-lg">
                <h3 class="text-sm font-medium text-foreground mb-2">Who can access</h3>
                <ul class="space-y-1 text-sm text-info list-disc list-inside">
                    {#each summary.lines as line}
                        <li class={line.tone === 'danger' ? 'text-destructive font-medium list-none' : line.tone === 'warning' ? 'text-warning font-medium' : ''}>
                            {line.text}
                        </li>
                    {/each}
                </ul>
            </div>

            <div class="p-3 bg-info-bg border border-info/20 rounded-lg">
                <h3 class="text-sm font-medium text-foreground mb-2">Home page tile</h3>
                <ul class="space-y-1 text-sm text-info list-disc list-inside">
                    {#each tileSummary.lines as line}
                        <li class={line.tone === 'warning' ? 'text-warning font-medium' : ''}>{line.text}</li>
                    {/each}
                </ul>
            </div>

            {#if summary.warnings.length > 0 || tileSummary.warnings.length > 0}
                <div class="p-3 bg-warning-bg border border-warning/30 rounded-lg space-y-1">
                    {#each [...summary.warnings, ...tileSummary.warnings] as warning}
                        <p class="text-xs text-warning">{warning}</p>
                    {/each}
                </div>
            {/if}

            {#if validation.errors.length > 0}
                <div class="p-3 bg-danger-bg border border-destructive/20 rounded">
                    {#each validation.errors as error}
                        <p class="text-sm text-destructive">{error}</p>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</ConfigSection>
