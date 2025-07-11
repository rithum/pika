<script lang="ts">
    import { getContext, type Snippet } from 'svelte';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { Button } from '$lib/components/ui/button';
    import { Badge } from '$lib/components/ui/badge';
    import { Separator } from '$lib/components/ui/separator';
    import { Settings2, House, Users, Shield, Eye, TriangleAlert, CircleCheck, LogOut, UserCog } from '$icons/lucide';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    interface Props {
        pageHeaderRight: Snippet<[]>;
    }

    let { pageHeaderRight = $bindable() }: Props = $props();

    pageHeaderRight = pageHeaderRightSnippet;

    const features = $derived(siteAdmin.siteFeatures);

    function formatUserTypes(userTypes?: string[]): string {
        if (!userTypes || userTypes.length === 0) return 'All users';
        return userTypes.join(', ');
    }

    function formatUserRoles(userRoles?: string[]): string {
        if (!userRoles || userRoles.length === 0) return 'No specific roles';
        return userRoles.join(', ');
    }

    function getStatusBadge(enabled: boolean | undefined) {
        return enabled ? 'Enabled' : 'Disabled';
    }

    function getStatusVariant(enabled: boolean | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
        return enabled ? 'default' : 'secondary';
    }
</script>

<div class="space-y-6 p-6">
    <!-- Home Page Configuration -->
    <div class="bg-card rounded-lg border p-6">
        <div class="flex items-center gap-2 mb-4">
            <House class="h-5 w-5 text-muted-foreground" />
            <h2 class="text-lg font-semibold">Home Page Configuration</h2>
        </div>

        {#if features?.homePage}
            <div class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Page Title</span>
                        <p class="text-sm mt-1">{features.homePage.homePageTitle || 'Default title'}</p>
                    </div>
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Welcome Message</span>
                        <p class="text-sm mt-1">{features.homePage.welcomeMessage || 'Default welcome message'}</p>
                    </div>
                </div>

                {#if features.homePage.linksToChatApps}
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Chat App Links Configuration</span>
                        <div class="mt-2 space-y-2">
                            {#each features.homePage.linksToChatApps.userChatAppRules as rule, index}
                                <div class="bg-muted/50 rounded p-3 text-sm">
                                    <div class="flex items-center gap-2 mb-1">
                                        <span class="font-medium">Rule {index + 1}</span>
                                    </div>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <span class="text-muted-foreground">User Types:</span>
                                            <span class="ml-1">{formatUserTypes(rule.userTypes)}</span>
                                        </div>
                                        <div>
                                            <span class="text-muted-foreground">Can See Chat Apps:</span>
                                            <span class="ml-1">{formatUserTypes(rule.chatAppUserTypes)}</span>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        {:else}
            <p class="text-sm text-muted-foreground">Home page configuration not set</p>
        {/if}
    </div>

    <Separator />

    <!-- User Data Overrides -->
    <div class="bg-card rounded-lg border p-6">
        <div class="flex items-center gap-2 mb-4">
            <UserCog class="h-5 w-5 text-muted-foreground" />
            <h2 class="text-lg font-semibold">User Data Overrides</h2>
            <Badge variant={getStatusVariant(features?.userDataOverrides?.enabled)}>
                {getStatusBadge(features?.userDataOverrides?.enabled)}
            </Badge>
        </div>

        {#if features?.userDataOverrides?.enabled}
            <div class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Allowed User Types</span>
                        <p class="text-sm mt-1">{formatUserTypes(features.userDataOverrides.userTypes)}</p>
                    </div>
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Menu Item Title</span>
                        <p class="text-sm mt-1">{features.userDataOverrides.menuItemTitle || 'Override User Data'}</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Dialog Title</span>
                        <p class="text-sm mt-1">{features.userDataOverrides.dialogTitle || 'Override User Data'}</p>
                    </div>
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Dialog Description</span>
                        <p class="text-sm mt-1">
                            {features.userDataOverrides.dialogDescription || 'Default description'}
                        </p>
                    </div>
                </div>

                {#if features.userDataOverrides.promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing && features.userDataOverrides.promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing.length > 0}
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Required Custom Data Attributes</span>
                        <div class="flex flex-wrap gap-1 mt-1">
                            {#each features.userDataOverrides.promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing as attr}
                                <Badge variant="outline" class="text-xs">{attr}</Badge>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        {:else}
            <p class="text-sm text-muted-foreground">User data overrides feature is disabled</p>
        {/if}
    </div>

    <Separator />

    <!-- Content Admin -->
    <div class="bg-card rounded-lg border p-6">
        <div class="flex items-center gap-2 mb-4">
            <Shield class="h-5 w-5 text-muted-foreground" />
            <h2 class="text-lg font-semibold">Content Admin</h2>
            <Badge variant={getStatusVariant(features?.contentAdmin?.enabled)}>
                {getStatusBadge(features?.contentAdmin?.enabled)}
            </Badge>
        </div>

        {#if features?.contentAdmin?.enabled}
            <p class="text-sm text-muted-foreground">
                Content admin feature allows designated users with the <code class="bg-muted px-1 rounded"
                    >pika:content-admin</code
                > role to view chat sessions and messages for any user in the system for debugging and support purposes.
            </p>
        {:else}
            <p class="text-sm text-muted-foreground">Content admin feature is disabled</p>
        {/if}
    </div>

    <Separator />

    <!-- Traces Feature -->
    <div class="bg-card rounded-lg border p-6">
        <div class="flex items-center gap-2 mb-4">
            <Eye class="h-5 w-5 text-muted-foreground" />
            <h2 class="text-lg font-semibold">Traces Feature</h2>
            <Badge variant={getStatusVariant(features?.traces?.enabled)}>
                {getStatusBadge(features?.traces?.enabled)}
            </Badge>
        </div>

        {#if features?.traces?.enabled}
            <div class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Allowed User Types</span>
                        <p class="text-sm mt-1">{formatUserTypes(features.traces.userTypes)}</p>
                    </div>
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Allowed User Roles</span>
                        <p class="text-sm mt-1">{formatUserRoles(features.traces.userRoles)}</p>
                    </div>
                </div>

                {#if features.traces.detailedTraces}
                    <div>
                        <h3 class="text-sm font-medium mb-2">Detailed Traces Configuration</h3>
                        <div class="bg-muted/50 rounded p-3">
                            <div class="flex items-center gap-2 mb-2">
                                <Badge variant={getStatusVariant(features.traces.detailedTraces.enabled)}>
                                    {getStatusBadge(features.traces.detailedTraces.enabled)}
                                </Badge>
                            </div>
                            {#if features.traces.detailedTraces.enabled}
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <span class="text-muted-foreground">User Types:</span>
                                        <span class="ml-1"
                                            >{formatUserTypes(features.traces.detailedTraces.userTypes)}</span
                                        >
                                    </div>
                                    <div>
                                        <span class="text-muted-foreground">User Roles:</span>
                                        <span class="ml-1"
                                            >{formatUserRoles(features.traces.detailedTraces.userRoles)}</span
                                        >
                                    </div>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        {:else}
            <p class="text-sm text-muted-foreground">Traces feature is disabled</p>
        {/if}
    </div>

    <Separator />

    <!-- Chat Disclaimer Notice -->
    <div class="bg-card rounded-lg border p-6">
        <div class="flex items-center gap-2 mb-4">
            <TriangleAlert class="h-5 w-5 text-muted-foreground" />
            <h2 class="text-lg font-semibold">Chat Disclaimer Notice</h2>
            <Badge variant={getStatusVariant(!!features?.chatDisclaimerNotice?.notice)}>
                {features?.chatDisclaimerNotice?.notice ? 'Configured' : 'Not Configured'}
            </Badge>
        </div>

        {#if features?.chatDisclaimerNotice?.notice}
            <div>
                <span class="text-sm font-medium text-muted-foreground">Disclaimer Text</span>
                <div class="mt-2 p-3 bg-muted/50 rounded text-sm">
                    {features.chatDisclaimerNotice.notice}
                </div>
            </div>
        {:else}
            <p class="text-sm text-muted-foreground">No disclaimer notice configured</p>
        {/if}
    </div>

    <Separator />

    <!-- Verify Response Feature -->
    <div class="bg-card rounded-lg border p-6">
        <div class="flex items-center gap-2 mb-4">
            <CircleCheck class="h-5 w-5 text-muted-foreground" />
            <h2 class="text-lg font-semibold">Verify Response Feature</h2>
            <Badge variant={getStatusVariant(features?.verifyResponse?.enabled)}>
                {getStatusBadge(features?.verifyResponse?.enabled)}
            </Badge>
        </div>

        {#if features?.verifyResponse?.enabled}
            <div class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Auto-Reprompt Threshold</span>
                        <p class="text-sm mt-1">{features.verifyResponse.autoRepromptThreshold || 'Not set'}</p>
                    </div>
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Allowed User Types</span>
                        <p class="text-sm mt-1">{formatUserTypes(features.verifyResponse.userTypes)}</p>
                    </div>
                    <div>
                        <span class="text-sm font-medium text-muted-foreground">Allowed User Roles</span>
                        <p class="text-sm mt-1">{formatUserRoles(features.verifyResponse.userRoles)}</p>
                    </div>
                </div>

                {#if features.verifyResponse.autoRepromptThreshold}
                    <div class="bg-muted/50 rounded p-3">
                        <p class="text-sm">
                            <span class="font-medium">Auto-reprompt behavior:</span>
                            The system will automatically retry responses with quality grade
                            <Badge variant="outline" class="mx-1">{features.verifyResponse.autoRepromptThreshold}</Badge
                            >
                            or lower to improve response quality.
                        </p>
                    </div>
                {/if}
            </div>
        {:else}
            <p class="text-sm text-muted-foreground">Verify response feature is disabled</p>
        {/if}
    </div>

    <Separator />

    <!-- Logout Feature -->
    <div class="bg-card rounded-lg border p-6">
        <div class="flex items-center gap-2 mb-4">
            <LogOut class="h-5 w-5 text-muted-foreground" />
            <h2 class="text-lg font-semibold">Logout Feature</h2>
            <Badge variant={getStatusVariant(features?.logout?.enabled)}>
                {getStatusBadge(features?.logout?.enabled)}
            </Badge>
        </div>

        {#if features?.logout?.enabled}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <span class="text-sm font-medium text-muted-foreground">Menu Item Title</span>
                    <p class="text-sm mt-1">{features.logout.menuItemTitle || 'Logout'}</p>
                </div>
                <div>
                    <span class="text-sm font-medium text-muted-foreground">Dialog Title</span>
                    <p class="text-sm mt-1">{features.logout.dialogTitle || 'Logout'}</p>
                </div>
                <div>
                    <span class="text-sm font-medium text-muted-foreground">Dialog Description</span>
                    <p class="text-sm mt-1">
                        {features.logout.dialogDescription || 'Are you sure you want to logout?'}
                    </p>
                </div>
            </div>
        {:else}
            <p class="text-sm text-muted-foreground">Logout feature is disabled</p>
        {/if}
    </div>

    <Separator />

    <!-- Site Admin Feature -->
    <div class="bg-card rounded-lg border p-6">
        <div class="flex items-center gap-2 mb-4">
            <Settings2 class="h-5 w-5 text-muted-foreground" />
            <h2 class="text-lg font-semibold">Site Admin Feature</h2>
            <Badge variant={getStatusVariant(features?.siteAdmin?.websiteEnabled)}>
                {getStatusBadge(features?.siteAdmin?.websiteEnabled)}
            </Badge>
        </div>

        {#if features?.siteAdmin?.websiteEnabled}
            <p class="text-sm text-muted-foreground">
                Site admin website is enabled. Users with the <code class="bg-muted px-1 rounded">pika:site-admin</code>
                role can access administrative features for managing chat app access control and overrides.
            </p>
        {:else}
            <p class="text-sm text-muted-foreground">Site admin website is disabled</p>
        {/if}
    </div>
</div>

{#snippet pageHeaderRightSnippet()}
    <Button variant="ghost" size="icon" class="pl-0 pr-0 w-8">
        <Settings2 style="width: 1.3rem; height: 1.2rem;" />
    </Button>
{/snippet}
