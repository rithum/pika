<script lang="ts">
    import { assert } from '$lib/utils';
    import type { ApplyRulesAs, ChatApp, UserRole } from 'pika-shared/types/chatbot/chatbot-types';
    import { describeRole, type ResolvedAccessControlConfig } from './access-control-config';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from 'pika-ux/pika/simple-dropdown/simple-dropdown.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import { Checkbox } from 'pika-ux/shadcn/checkbox';
    import { Input } from 'pika-ux/shadcn/input';
    import { Label } from 'pika-ux/shadcn/label';
    import * as RadioGroup from 'pika-ux/shadcn/radio-group';

    interface Props {
        chatApp: ChatApp;
        chatAppOriginal: ChatApp;
        isOverrideMode: boolean;
        disabled?: boolean;
        accessControlConfig: ResolvedAccessControlConfig;
        entitySingular?: string;
    }

    let { chatApp = $bindable(), chatAppOriginal, isOverrideMode, disabled = false, accessControlConfig, entitySingular = 'account ID' }: Props = $props();

    let app = $derived(isOverrideMode ? chatApp : chatAppOriginal);
    let rulesToShow = $derived(app.override ?? app);
    let rulesOriginal = $derived(chatAppOriginal.override ?? chatAppOriginal);

    let additionalAccounts = $derived(app.override?.additionalExternalAccessControl ?? []);
    let additionalAccountsOriginal = $derived(chatAppOriginal.override?.additionalExternalAccessControl ?? []);

    let controlsDisabled = $derived(!isOverrideMode || disabled);

    let userTypes = $derived(rulesToShow?.userTypes ?? []);
    let userRoles = $derived(rulesToShow?.userRoles ?? []);

    let showApplyRulesAs = $derived(userTypes.length > 0 && userRoles.length > 0);

    function defaultApplyRulesAsIfNeeded() {
        assert(chatApp.override, 'chatApp.override must be defined');
        const bothPopulated = (chatApp.override.userTypes ?? []).length > 0 && (chatApp.override.userRoles ?? []).length > 0;
        if (!bothPopulated) {
            chatApp.override.applyRulesAs = undefined;
            return;
        }
        if (!chatApp.override.applyRulesAs) {
            chatApp.override.applyRulesAs = 'or';
        }
    }

    function toggleUserType(userType: 'internal-user' | 'external-user', checked: boolean) {
        assert(isOverrideMode, 'isOverrideMode must be true');
        assert(chatApp.override, 'chatApp.override must be defined');

        const current = chatApp.override.userTypes ?? [];
        const next = checked ? [...current.filter((t) => t !== userType), userType] : current.filter((t) => t !== userType);
        chatApp.override.userTypes = next.length > 0 ? next : undefined;
        defaultApplyRulesAsIfNeeded();
    }

    let roleDropdownValue = $state<UserRole | undefined>(undefined);
    let availableRoleOptions = $derived(accessControlConfig.predefinedRoles.filter((r) => !userRoles.includes(r)));

    function addRole(role: UserRole) {
        assert(isOverrideMode, 'isOverrideMode must be true');
        assert(chatApp.override, 'chatApp.override must be defined');

        const current = chatApp.override.userRoles ?? [];
        if (!current.includes(role)) {
            chatApp.override.userRoles = [...current, role];
        }
        defaultApplyRulesAsIfNeeded();
    }

    function removeRole(role: UserRole) {
        assert(isOverrideMode, 'isOverrideMode must be true');
        assert(chatApp.override, 'chatApp.override must be defined');

        chatApp.override.userRoles = (chatApp.override.userRoles ?? []).filter((r) => r !== role);
        defaultApplyRulesAsIfNeeded();
    }

    let newAccountId = $state('');
    let newAccountError = $state<string | undefined>(undefined);

    function addAccount() {
        assert(isOverrideMode, 'isOverrideMode must be true');
        assert(chatApp.override, 'chatApp.override must be defined');

        const value = newAccountId.trim();
        if (!value) {
            return;
        }
        const { accountIdRegex, accountIdPatternDescription } = accessControlConfig;
        if (accountIdRegex && !accountIdRegex.test(value)) {
            newAccountError = `Invalid ${entitySingular}: must match the expected format${accountIdPatternDescription ? ` (${accountIdPatternDescription})` : ''}.`;
            return;
        }

        const current = chatApp.override.additionalExternalAccessControl ?? [];
        if (!current.includes(value)) {
            chatApp.override.additionalExternalAccessControl = [...current, value];
        }
        newAccountId = '';
        newAccountError = undefined;
    }

    function removeAccount(id: string) {
        assert(isOverrideMode, 'isOverrideMode must be true');
        assert(chatApp.override, 'chatApp.override must be defined');

        chatApp.override.additionalExternalAccessControl = (chatApp.override.additionalExternalAccessControl ?? []).filter((a) => a !== id);
    }
</script>

<div class="space-y-6">
    <div>
        <div class="text-sm font-medium mb-2">Who can access</div>
        <p class="text-xs text-muted-foreground mb-3">
            Each rule below is an independent way in — a user gets access if they match any one of them.
        </p>

        <div class="space-y-3">
            <div class="flex items-center space-x-2">
                <Checkbox
                    id="who-internal"
                    bind:checked={
                        () => userTypes.includes('internal-user'),
                        (value) => toggleUserType('internal-user', value === true)
                    }
                    disabled={controlsDisabled}
                />
                <Label for="who-internal">{accessControlConfig.internalUsersLabel}</Label>
            </div>

            <div class="flex items-center space-x-2">
                <Checkbox
                    id="who-external"
                    bind:checked={
                        () => userTypes.includes('external-user'),
                        (value) => toggleUserType('external-user', value === true)
                    }
                    disabled={controlsDisabled}
                />
                <Label for="who-external">All external users (any role)</Label>
            </div>

            <div>
                <div class="flex items-center gap-2 mb-2">
                    <Label class="text-sm font-medium">External users whose role matches</Label>
                    <PopupHelp popoverClasses="w-[400px]">
                        <p>
                            Grants access to any user with one of these roles, typically external roles such as partner or vendor.
                            Combine with the toggles above using AND/OR below.
                        </p>
                    </PopupHelp>
                </div>
                <SimpleDropdown
                    bind:value={
                        () => roleDropdownValue,
                        (val) => {
                            roleDropdownValue = undefined;
                            const role = Array.isArray(val) ? val[0] : val;
                            if (role) {
                                addRole(role);
                            }
                        }
                    }
                    mapping={{
                        value: (item) => item as string,
                        label: (item) => describeRole(item as string, accessControlConfig.roleLabels)
                    }}
                    options={availableRoleOptions}
                    optionTypeName="role"
                    optionTypeNamePlural="roles"
                    wrapperClasses="w-[400px]"
                    inputPlaceholder="Choose or provide a role..."
                    searchPlaceholder="Choose or enter a new role..."
                    disabled={controlsDisabled}
                    allowArbitraryValues={{
                        convertValueToType: (value: string) => value as UserRole
                    }}
                />
                <div class="mt-2 w-[400px] h-[110px] overflow-y-auto rounded-md border p-2">
                    {#if userRoles.length > 0}
                        <ul class="flex flex-wrap content-start gap-2">
                            {#each userRoles as role (role)}
                                <li class="flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-xs">
                                    {describeRole(role as string, accessControlConfig.roleLabels)}
                                    <button
                                        type="button"
                                        class="text-muted-foreground hover:text-destructive disabled:opacity-50"
                                        disabled={controlsDisabled}
                                        onclick={() => removeRole(role)}
                                        aria-label={`Remove role ${describeRole(role as string, accessControlConfig.roleLabels)}`}
                                    >
                                        &times;
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    {:else}
                        <p class="pt-8 text-center text-xs text-muted-foreground">No roles — role-based access is off</p>
                    {/if}
                </div>
                {#if isOverrideMode}
                    <p class="text-xs text-muted-foreground mt-1">
                        Original: {(rulesOriginal?.userRoles ?? []).join(', ') || 'None specified'}
                    </p>
                {/if}
            </div>

            {#if showApplyRulesAs}
                <div>
                    <Label class="text-sm font-medium">How to combine the type toggles with the role list above</Label>
                    <RadioGroup.Root
                        bind:value={
                            () => rulesToShow?.applyRulesAs ?? 'and',
                            (value) => {
                                assert(isOverrideMode, 'isOverrideMode must be true');
                                assert(chatApp.override, 'chatApp.override must be defined');
                                chatApp.override.applyRulesAs = value as ApplyRulesAs;
                            }
                        }
                        disabled={controlsDisabled}
                        class="mt-2"
                    >
                        <div class="flex items-center gap-2">
                            <RadioGroup.Item value="or" id="apply-rules-or" />
                            <Label for="apply-rules-or">
                                Users can match type OR role (most common — e.g. "internal users OR external partners")
                            </Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <RadioGroup.Item value="and" id="apply-rules-and" />
                            <Label for="apply-rules-and">Users must match type AND role</Label>
                        </div>
                    </RadioGroup.Root>
                    {#if isOverrideMode}
                        <p class="text-xs text-muted-foreground mt-1">Original: {rulesOriginal?.applyRulesAs ?? 'None specified'}</p>
                    {/if}
                </div>
            {/if}
        </div>
    </div>

    <div class="border-t pt-4">
        <div class="flex items-center gap-2 mb-1">
            <Label class="text-sm font-medium">
                Additional specific accounts{additionalAccounts.length > 0 ? ` (${additionalAccounts.length})` : ''}
            </Label>
            <PopupHelp popoverClasses="w-[400px]">
                <p>
                    These external accounts always have access, in addition to the rules above. A non-match here is not a
                    denial — it just means the rules above still apply normally to that account.
                </p>
            </PopupHelp>
        </div>
        <div class="flex gap-2 max-w-[400px] mt-2">
            <Input
                bind:value={newAccountId}
                placeholder={`Enter ${entitySingular}`}
                disabled={controlsDisabled}
                aria-invalid={!!newAccountError}
                onkeydown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        addAccount();
                    }
                }}
            />
            <Button type="button" variant="outline" size="sm" disabled={controlsDisabled} onclick={addAccount}>Add</Button>
        </div>
        {#if newAccountError}
            <p class="text-xs text-destructive mt-1">{newAccountError}</p>
        {/if}
        <div class="mt-2 w-[400px] h-[110px] overflow-y-auto rounded-md border p-2">
            {#if additionalAccounts.length === 0}
                <p class="pt-8 text-center text-xs text-muted-foreground">No accounts specified</p>
            {:else}
                <ul class="flex flex-wrap content-start gap-2">
                    {#each additionalAccounts as accountId (accountId)}
                        <li class="flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-xs">
                            {accountId}
                            <button
                                type="button"
                                class="text-muted-foreground hover:text-destructive disabled:opacity-50"
                                disabled={controlsDisabled}
                                onclick={() => removeAccount(accountId)}
                                aria-label={`Remove ${entitySingular} ${accountId}`}
                            >
                                &times;
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
        {#if isOverrideMode}
            <p class="text-xs text-muted-foreground mt-1">
                Original: {additionalAccountsOriginal.join(', ') || 'None specified'}
            </p>
        {/if}
    </div>
</div>
