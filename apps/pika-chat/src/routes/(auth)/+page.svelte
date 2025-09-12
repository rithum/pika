<script lang="ts">
    import { goto } from '$app/navigation';
    import type { AppState } from '$client/app/app.state.svelte';
    import { Button } from '$ui/shadcn/button';
    import * as DropdownMenu from '$ui/shadcn/dropdown-menu';
    import { Settings2 } from '$lib/icons/lucide';
    import type { ChatAppLite } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import type { PageData } from './$types';
    import CopyButton from '$ui/pika/copy-button/copy-button.svelte';

    const appState = getContext<AppState>('appState');

    const internalApps = $derived(
        appState.allChatApps.filter((app) => (app.userTypes ?? ['internal-user']).includes('internal-user'))
    );
    const externalApps = $derived(
        appState.allChatApps.filter((app) => (app.userTypes ?? ['internal-user']).includes('external-user'))
    );

    let userInfo = $derived.by(() => {
        const internalUser = appState.identity.user.userType === 'internal-user';
        const customDataUiRepresentation = appState.customDataUiRepresentation;
        const userId = appState.identity.user.userId;
        const firstName = appState.identity.user.firstName;
        const lastName = appState.identity.user.lastName;
        let result: { title: string; value: string }[] = [];

        if (internalUser && customDataUiRepresentation) {
            result.push({ title: customDataUiRepresentation.title, value: customDataUiRepresentation.value });
        }
        if (internalUser) {
            result.push({ title: 'User ID', value: userId });
        }
        if (firstName || lastName) {
            result.push({ title: 'User', value: `${firstName} ${lastName}` });
        }

        return result.length > 0 ? result : undefined;
    });

    // New derived values for cleaner organization
    const bothApps = $derived(
        appState.allChatApps.filter((app) => {
            const userTypes = app.userTypes ?? ['internal-user'];
            return userTypes.includes('internal-user') && userTypes.includes('external-user');
        })
    );
    const internalOnlyApps = $derived(
        appState.allChatApps.filter((app) => {
            const userTypes = app.userTypes ?? ['internal-user'];
            return userTypes.includes('internal-user') && !userTypes.includes('external-user');
        })
    );
    const externalOnlyApps = $derived(
        appState.allChatApps.filter((app) => {
            const userTypes = app.userTypes ?? ['internal-user'];
            return !userTypes.includes('internal-user') && userTypes.includes('external-user');
        })
    );

    const pageTitle = $derived(appState.homePageSiteFeature?.homePageTitle ?? 'Chat Apps');
    const welcomeMessage = $derived(appState.homePageSiteFeature?.welcomeMessage ?? 'Welcome to the chatbot app');
</script>

{#if appState.allChatApps && appState.allChatApps.length === 0}
    <div class="flex flex-col items-center justify-center min-h-screen p-8">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">{pageTitle}</h1>
        <h2 class="text-2xl font-bold">{welcomeMessage}</h2>
        <p class="text-gray-500">Navigate to the URL of the chat app you want to use.</p>
    </div>
{:else}
    <div class="bg-gray-50 min-h-screen">
        <!-- Page Header -->
        <div class="bg-white border-b border-gray-200">
            <div class="container mx-auto px-6 py-8 max-w-7xl flex justify-between items-center">
                <h1 class="text-4xl font-bold text-gray-900">{pageTitle}</h1>
                {@render settingsDropdown()}
            </div>
        </div>

        <!-- Main Content -->
        <div class="container mx-auto p-6 max-w-7xl pb-12">
            {#if appState.identity.isInternalUser}
                {#if bothApps.length > 0}
                    <div class="mb-12">
                        <h2 class="text-3xl font-bold text-gray-900 mb-2">Available to External Users</h2>
                        <p class="text-gray-600 mb-6">
                            Chat applications accessible by both internal team members and external users
                        </p>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {#each bothApps as app}
                                {@render chatAppCard(app, 'both')}
                            {/each}
                        </div>
                    </div>
                {/if}

                {#if internalOnlyApps.length > 0}
                    <div class="mb-12">
                        <h2 class="text-3xl font-bold text-gray-900 mb-2">Internal Team Only</h2>
                        <p class="text-gray-600 mb-6">Chat applications exclusively for internal team use</p>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {#each internalOnlyApps as app}
                                {@render chatAppCard(app, 'internal')}
                            {/each}
                        </div>
                    </div>
                {/if}

                {#if externalOnlyApps.length > 0}
                    <div class="mb-12">
                        <h2 class="text-3xl font-bold text-gray-900 mb-2">External Users Only</h2>
                        <p class="text-gray-600 mb-6">Chat applications designed specifically for external users</p>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {#each externalOnlyApps as app}
                                {@render chatAppCard(app, 'external')}
                            {/each}
                        </div>
                    </div>
                {/if}
            {:else}
                <div class="mb-12">
                    <h2 class="text-3xl font-bold text-gray-900 mb-2">Available Chat Apps</h2>
                    <p class="text-gray-600 mb-6">Select a chat application to get started</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {#each externalApps as app}
                            {@render chatAppCard(app)}
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

{#snippet chatAppCard(app: ChatAppLite, appType?: string)}
    <div
        class="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 overflow-hidden h-full flex flex-col"
    >
        <!-- Card Header -->
        <div class="p-6 pb-4 flex-grow">
            <div class="flex items-start justify-between mb-3">
                <h3 class="text-xl font-semibold text-gray-900 leading-tight">
                    {app.title}
                </h3>
                {#if appState.identity.isInternalUser && appType}
                    <div class="flex gap-1 flex-shrink-0 ml-3">
                        {#if appType === 'both'}
                            <span
                                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800"
                            >
                                External
                            </span>
                            <span
                                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                            >
                                Internal
                            </span>
                        {:else if appType === 'internal'}
                            <span
                                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                            >
                                Internal
                            </span>
                        {:else if appType === 'external'}
                            <span
                                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                            >
                                External
                            </span>
                        {/if}
                    </div>
                {/if}
            </div>

            <!-- Description placeholder - you may want to add this to your data -->
            <p class="text-gray-600 text-sm leading-relaxed">
                {app.description || 'AI-powered chat assistant to help with your questions and tasks.'}
            </p>
        </div>

        <!-- Card Footer -->
        <div class="px-6 pb-6 mt-auto">
            <Button
                href="/chat/{app.chatAppId}"
                class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors duration-200"
            >
                Launch Chat
            </Button>
        </div>
    </div>
{/snippet}

{#snippet settingsDropdown()}
    <DropdownMenu.Root>
        <DropdownMenu.Trigger>
            <div class="relative">
                <Button variant="ghost" size="icon" class="pl-0 pr-0 w-8"
                    ><Settings2 style="width: 1.3rem; height: 1.2rem;" /></Button
                >
            </div>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content class="min-w-48">
            {#if userInfo}
                <div class="flex flex-col p-2 bg-gray-100 rounded-md">
                    {#each userInfo as info}
                        <div class="mb-2">
                            <div class="text-sm text-gray-500">{info.title}</div>
                            <div class="font-semibold">
                                <CopyButton embedded={true}>{info.value}</CopyButton>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
            {#if appState.logoutSiteFeature?.enabled}
                <DropdownMenu.Group>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                        onclick={() => {
                            appState.showLogoutDialog = true;
                        }}>{appState.logoutSiteFeature?.menuItemTitle ?? 'Logout'}</DropdownMenu.Item
                    >
                </DropdownMenu.Group>
            {/if}
        </DropdownMenu.Content>
    </DropdownMenu.Root>
{/snippet}
