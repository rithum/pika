<script lang="ts">
    import { Construction, FileCode2, Loader, MessageSquareText, RefreshCw, Server, Trash2 } from '$icons/lucide';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { PikaBadge } from '$ui/pika/pika-badge';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';
    import { Badge } from '$ui/shadcn/badge';
    import { Button } from '$ui/shadcn/button';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$ui/shadcn/card';
    import ConfirmDialog from '$ui/pika/confirm-dialog/confirm-dialog.svelte';
    import * as PikaTabs from '$ui/pika/pika-tabs';
    import { getContext } from 'svelte';
    import { toast } from 'svelte-sonner';
    import type {
        ClearConverseLambdaCacheRequest,
        ClearSvelteKitCacheType,
        ClearConverseLambdaCacheType,
    } from 'pika-shared/types/chatbot/chatbot-types';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    let showConfirmClearSvelteKitCacheDialog = $state(false);
    let showConfirmClearConverseLambdaCacheDialog = $state(false);
    let svelteKitCacheTypeToClear = $state<ClearSvelteKitCacheType | undefined>(undefined);
    let converseLambdaCacheTypeToClear = $state<ClearConverseLambdaCacheType | undefined>(undefined);
    let agentIdToClear = $state<string | undefined>(undefined);
    let chatAppIdToClear = $state<string | undefined>(undefined);

    const svelteKitCacheInfo = [
        {
            name: 'Chat Apps',
            type: 'chatAppCache' as ClearSvelteKitCacheType,
            description: 'Caches chat app lookup results and matching rules in the webapp',
            ttl: '5 minutes',
            icon: MessageSquareText,
            maxSize: 50000,
        },
        {
            name: 'Tag Definitions',
            type: 'tagDefinitionsCache' as ClearSvelteKitCacheType,
            description: 'Caches tag definitions used in both chat apps and the admin pages of the webapp',
            ttl: '10 minutes',
            icon: FileCode2,
            maxSize: 25000,
        },
        {
            name: 'Instruction Assistance Config',
            type: 'instructionAssistanceConfigCache' as ClearSvelteKitCacheType,
            description: 'Caches instruction assistance config (default instructions retrieved from SSM) in the webapp',
            ttl: '1 hour',
            icon: Construction,
            maxSize: 1,
        },
    ];

    const converseLambdaCacheInfo = [
        {
            name: 'Tag Definitions',
            type: 'tagDefinitions' as ClearConverseLambdaCacheType,
            description: 'Caches tag definitions used in the Converse lambda function',
            ttl: '10 minutes',
            icon: FileCode2,
            maxSize: 50,
        },
        {
            name: 'Instruction Assistance Config',
            type: 'instructionAssistanceConfig' as ClearConverseLambdaCacheType,
            description:
                'Caches instruction assistance config (default instructions retrieved from SSM) in the Converse lambda function',
            ttl: '10 minutes',
            icon: Construction,
            maxSize: 50,
        },
    ];

    async function clearSvelteKitCache(cacheType: ClearSvelteKitCacheType, execute = false) {
        if (!execute) {
            svelteKitCacheTypeToClear = cacheType;
            showConfirmClearSvelteKitCacheDialog = true;
            return;
        }
        try {
            //TODO: change the UI to allow the clearing of a specific chat app from the cache by
            // passing chatAppId to the command in this case (when not passing chatAppId and type is chatAppCache
            // we clear all chat apps from the cache)
            await siteAdmin.sendSiteAdminCommand({
                command: 'clearSvelteKitCaches',
                cacheType,
            });
            toast.success(`Successfully cleared ${cacheType === 'all' ? 'all caches' : cacheType}`);
        } catch (error) {
            console.error('Error clearing SvelteKit cache:', error);
            toast.error('Failed to clear cache');
        }
    }

    async function clearAgentFromConverseCache(chatAppId: string, agentId: string, execute = false) {
        if (!execute) {
            chatAppIdToClear = chatAppId;
            agentIdToClear = agentId;
            showConfirmClearConverseLambdaCacheDialog = true;
            return;
        }
        try {
            await siteAdmin.sendSiteAdminCommand({
                command: 'clearConverseLambdaCache',
                cacheType: 'agent',
                chatAppId,
                agentId,
            });
            toast.success(`Successfully cleared agent from converse lambda: ${agentId}`);
        } catch (error) {
            console.error('Error clearing agent from converse lambda:', error);
            toast.error('Failed to clear agent from converse lambda');
        }
    }

    async function clearConverseLambdaCache(cacheType: ClearConverseLambdaCacheType, execute = false) {
        if (!execute) {
            agentIdToClear = undefined;
            chatAppIdToClear = undefined;
            converseLambdaCacheTypeToClear = cacheType;
            showConfirmClearConverseLambdaCacheDialog = true;
            return;
        }
        try {
            await siteAdmin.sendSiteAdminCommand({
                command: 'clearConverseLambdaCache',
                cacheType,
            });
            toast.success(`Successfully cleared cache for converse lambda: ${cacheType}`);
        } catch (error) {
            console.error('Error clearing converse lambda cache:', error);
            toast.error('Failed to clear converse lambda cache');
        }
    }

    siteAdmin.setPageTitle('Cache Management');
</script>

<PikaTabs.Root value="webapp" class="max-w-[1300px] m-6">
    <PikaTabs.List>
        <PikaTabs.Trigger value="webapp">WebApp Caches</PikaTabs.Trigger>
        <PikaTabs.Trigger value="converseLambda">Converse Lambda Caches</PikaTabs.Trigger>
        <PikaTabs.Trigger value="agents">Agents</PikaTabs.Trigger>
    </PikaTabs.List>
    <PikaTabs.Content value="webapp">
        <Card>
            <CardHeader>
                <div class="flex justify-between">
                    <div class="flex flex-col gap-1">
                        <CardTitle>SvelteKit WebApp Server Caches</CardTitle>
                        <CardDescription>Clear cached data on the SvelteKit server for the webapp</CardDescription>
                    </div>
                    <div>
                        <Button variant="outline" size="sm" onclick={() => clearSvelteKitCache('all')}>
                            <RefreshCw class="w-3 h-3 mr-1" />
                            Clear All Webapp Caches
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {#each svelteKitCacheInfo as cache}
                        <Card>
                            <CardHeader class="pb-2">
                                <CardTitle class="flex items-center gap-2 text-base">
                                    <cache.icon class="w-4 h-4" />
                                    {cache.name}
                                </CardTitle>
                                <CardDescription class="text-sm">
                                    {cache.description}
                                </CardDescription>
                            </CardHeader>
                            <CardContent class="space-y-3">
                                <div class="flex flex-wrap gap-1">
                                    <PikaBadge variant="secondary">TTL: {cache.ttl}</PikaBadge>
                                    <PikaBadge variant="outline">Max Size: {cache.maxSize.toLocaleString()}</PikaBadge>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    class="w-full"
                                    onclick={() => clearSvelteKitCache(cache.type)}
                                    disabled={siteAdmin.siteAdminOperationInProgress.clearSvelteKitCaches}
                                >
                                    <Trash2 class="w-3 h-3 mr-1" />
                                    Clear Cache
                                </Button>
                            </CardContent>
                        </Card>
                    {/each}
                </div>
            </CardContent>
        </Card>
    </PikaTabs.Content>
    <PikaTabs.Content value="converseLambda">
        <Card>
            <CardHeader>
                <div class="flex justify-between">
                    <div class="flex flex-col gap-1">
                        <CardTitle>Converse Lambda Caches</CardTitle>
                        <CardDescription
                            >Clear cached data on the Converse lambda function (main lambda that handles all chat app
                            requests)</CardDescription
                        >
                    </div>
                    <div>
                        <Button variant="outline" size="sm" onclick={() => clearConverseLambdaCache('all')}>
                            <RefreshCw class="w-3 h-3 mr-1" />
                            Clear All Converse Lambda Caches
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {#each converseLambdaCacheInfo as cache}
                        <Card>
                            <CardHeader class="pb-2">
                                <CardTitle class="flex items-center gap-2 text-base">
                                    <cache.icon class="w-4 h-4" />
                                    {cache.name}
                                </CardTitle>
                                <CardDescription class="text-sm">
                                    {cache.description}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    class="w-full"
                                    onclick={() => clearConverseLambdaCache(cache.type)}
                                    disabled={siteAdmin.siteAdminOperationInProgress.clearConverseLambdaCache}
                                >
                                    <Trash2 class="w-3 h-3 mr-1" />
                                    Clear Cache
                                </Button>
                            </CardContent>
                        </Card>
                    {/each}
                </div>
            </CardContent>
        </Card>
    </PikaTabs.Content>
    <PikaTabs.Content value="agents">
        <Card>
            <CardHeader>
                <CardTitle>Agents</CardTitle>
                <CardDescription>Clear cached agents in the primary Converse lambda function.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {#each siteAdmin.chatApps as chatApp}
                        <Card>
                            <CardHeader class="pb-2">
                                <CardTitle class="text-base">
                                    {chatApp.title || chatApp.chatAppId}
                                </CardTitle>
                                <CardDescription class="text-sm">
                                    Agent ID: {chatApp.agentId}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div class="flex flex-wrap gap-1 mb-3">
                                    <Badge variant={chatApp.enabled ? 'default' : 'secondary'}>
                                        {chatApp.enabled ? 'Enabled' : 'Disabled'}
                                    </Badge>
                                    {#if chatApp.userTypes?.length}
                                        <Badge variant="outline">
                                            {chatApp.userTypes.join(', ')}
                                        </Badge>
                                    {/if}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    class="w-full"
                                    onclick={() => clearAgentFromConverseCache(chatApp.chatAppId, chatApp.agentId)}
                                    disabled={siteAdmin.siteAdminOperationInProgress.clearConverseLambdaCache}
                                >
                                    <Trash2 class="w-3 h-3 mr-1" />
                                    Clear Lambda Cache
                                </Button>
                            </CardContent>
                        </Card>
                    {/each}
                </div>
            </CardContent>
        </Card>
    </PikaTabs.Content>
</PikaTabs.Root>

<ConfirmDialog
    bind:open={showConfirmClearSvelteKitCacheDialog}
    title="Clear Cache?"
    message="Are you sure you want to clear this cache? This action cannot be undone."
    onyes={() => {
        if (svelteKitCacheTypeToClear) {
            clearSvelteKitCache(svelteKitCacheTypeToClear, true);
        }
        showConfirmClearSvelteKitCacheDialog = false;
    }}
/>

<ConfirmDialog
    bind:open={showConfirmClearConverseLambdaCacheDialog}
    title="Clear Cache?"
    message="Are you sure you want to clear this cache? This action cannot be undone."
    onyes={() => {
        if (converseLambdaCacheTypeToClear) {
            if (agentIdToClear && chatAppIdToClear) {
                clearAgentFromConverseCache(chatAppIdToClear, agentIdToClear, true);
            } else {
                clearConverseLambdaCache(converseLambdaCacheTypeToClear, true);
            }
        }
        showConfirmClearConverseLambdaCacheDialog = false;
    }}
/>
