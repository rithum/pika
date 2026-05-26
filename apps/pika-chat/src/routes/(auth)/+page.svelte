<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import { getDemoModeMenuItem } from '$lib/custom/demo-mode-menu-item';
    import Settings2 from '$icons/lucide/settings-2';
    import Search from '$icons/lucide/search';
    import ArrowRight from '$icons/lucide/arrow-right';
    import type { ChatAppLite } from 'pika-shared/types/chatbot/chatbot-types';
    import CopyButton from 'pika-ux/pika/copy-button/copy-button.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import * as DropdownMenu from 'pika-ux/shadcn/dropdown-menu';
    import { getContext, onMount } from 'svelte';

    const appState = getContext<AppState>('appState');
    const DemoModeMenuComponent = getDemoModeMenuItem();

    // Search state
    let searchQuery = $state('');

    // Logo URL based on light/dark mode
    let logoUrl = $state<string | null>(null);

    function updateLogoUrl() {
        const logoConfig = appState.homePageSiteFeature?.logo;

        // If explicitly set to null, hide logo
        if (logoConfig === null) {
            logoUrl = null;
            return;
        }

        // If not configured, use default
        if (logoConfig === undefined) {
            logoUrl = '/pika-logo-default.png';
            return;
        }

        // If string, use directly
        if (typeof logoConfig === 'string') {
            logoUrl = logoConfig;
            return;
        }

        // Object with light/dark
        const isDark = document.documentElement.classList.contains('dark');
        logoUrl = isDark && logoConfig.dark ? logoConfig.dark : logoConfig.light;
    }

    onMount(() => {
        updateLogoUrl();

        // Watch for dark mode changes
        const observer = new MutationObserver(() => {
            updateLogoUrl();
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        return () => observer.disconnect();
    });

    // Get apps visible to current user
    const visibleApps = $derived.by(() => {
        if (appState.identity.isInternalUser) {
            return appState.allChatApps;
        }
        // External users only see external apps
        return appState.allChatApps.filter((app) => (app.userTypes ?? ['internal-user']).includes('external-user'));
    });

    // Filtered apps based on search
    const filteredApps = $derived.by(() => {
        if (!searchQuery.trim()) return visibleApps;
        const query = searchQuery.toLowerCase();
        return visibleApps.filter(
            (app) =>
                app.title.toLowerCase().includes(query) ||
                (app.description && app.description.toLowerCase().includes(query))
        );
    });

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

    // Page configuration with defaults
    const pageTitle = $derived(appState.homePageSiteFeature?.homePageTitle ?? 'AI Assistants');
    const subtitle = $derived(
        appState.homePageSiteFeature?.subtitle ??
            appState.homePageSiteFeature?.welcomeMessage ??
            'Select an assistant to get started'
    );
    const logoHeight = $derived(appState.homePageSiteFeature?.logoHeight ?? 48);
    const logoGap = $derived(appState.homePageSiteFeature?.logoGap ?? 16);
    const defaultAssistantIcon = $derived(appState.homePageSiteFeature?.defaultAssistantIcon);
    const assistantIconSize = $derived(appState.homePageSiteFeature?.assistantIconSize ?? 24);

    // Search visibility - auto-show at 6+ assistants
    const showSearch = $derived.by(() => {
        const searchEnabled = appState.homePageSiteFeature?.searchEnabled ?? 'auto';
        if (searchEnabled === 'auto') {
            return visibleApps.length >= 6;
        }
        return searchEnabled;
    });

    // Helper to check if app is internal-only (for badge display to internal users)
    function isInternalOnly(app: ChatAppLite): boolean {
        const userTypes = app.userTypes ?? ['internal-user'];
        return userTypes.includes('internal-user') && !userTypes.includes('external-user');
    }

    // Get the icon for an assistant (app-specific, then global default, then sparkle)
    function getAssistantIcon(app: ChatAppLite): string | null {
        return app.icon ?? defaultAssistantIcon ?? null;
    }
</script>

<div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="border-b border-border bg-card">
        <div class="container mx-auto px-6 py-6 max-w-6xl">
            <div class="flex items-center justify-between">
                <!-- Logo and Title -->
                <div class="flex items-center" style="gap: {logoGap}px;">
                    {#if logoUrl}
                        <img src={logoUrl} alt="" class="home-page-logo" style="height: {logoHeight}px;" />
                    {/if}
                    <h1 class="text-2xl font-bold text-foreground">{pageTitle}</h1>
                </div>

                <!-- Settings -->
                {@render settingsDropdown()}
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto px-6 py-8 max-w-6xl">
        {#if visibleApps.length === 0}
            <!-- Empty State -->
            <div class="text-center py-12">
                <div class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-4">
                    {@render defaultSparklesIcon('w-7 h-7 text-muted-foreground')}
                </div>
                <h2 class="text-xl font-semibold text-foreground mb-2">No Assistants Available</h2>
                <p class="text-muted-foreground max-w-md mx-auto">
                    There are no AI assistants configured for your account. Please contact your administrator.
                </p>
            </div>
        {:else}
            <!-- Hero Section -->
            <div class="text-center mb-8">
                <h2 class="text-xl font-semibold text-foreground mb-1">Choose an AI Assistant</h2>
                <p class="text-muted-foreground max-w-2xl mx-auto">{subtitle}</p>
            </div>

            <!-- Search Bar -->
            {#if showSearch}
                <div class="max-w-xl mx-auto mb-8">
                    <div class="relative">
                        <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <input
                            type="text"
                            bind:value={searchQuery}
                            placeholder="Search assistants..."
                            class="w-full pl-12 pr-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
                        />
                    </div>
                </div>
            {/if}

            <!-- Assistant Cards Grid -->
            {#if filteredApps.length === 0}
                <div class="text-center py-12">
                    <p class="text-muted-foreground">No assistants match your search.</p>
                    <button onclick={() => (searchQuery = '')} class="text-primary hover:underline mt-2">
                        Clear search
                    </button>
                </div>
            {:else}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {#each filteredApps as app (app.chatAppId)}
                        {@render assistantCard(app)}
                    {/each}
                </div>

                <!-- Results count when searching -->
                {#if searchQuery.trim()}
                    <p class="text-center text-sm text-muted-foreground mt-8">
                        Showing {filteredApps.length} of {visibleApps.length} assistants
                    </p>
                {/if}
            {/if}
        {/if}
    </main>
</div>

{#snippet assistantCard(app: ChatAppLite)}
    {@const iconUrl = getAssistantIcon(app)}
    <a
        href="/chat/{app.chatAppId}"
        class="group block bg-card rounded-xl border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-200 overflow-hidden"
    >
        <div class="p-6">
            <!-- Header with icon and badge -->
            <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-3">
                    <div
                        class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                    >
                        {#if iconUrl}
                            <img
                                src={iconUrl}
                                alt=""
                                class="object-contain"
                                style="width: {assistantIconSize}px; height: {assistantIconSize}px;"
                            />
                        {:else}
                            {@render defaultSparklesIcon(assistantIconSize)}
                        {/if}
                    </div>
                    <h3 class="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                        {app.title}
                    </h3>
                </div>

                <!-- Internal-only badge for internal users -->
                {#if appState.identity.isInternalUser && isInternalOnly(app)}
                    <span
                        class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground"
                    >
                        Internal
                    </span>
                {/if}
            </div>

            <!-- Description -->
            <p class="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-2">
                {app.description || 'AI-powered assistant to help with your questions and tasks.'}
            </p>

            <!-- Footer with CTA -->
            <div
                class="flex items-center text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <span>Launch Assistant</span>
                <ArrowRight class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
            </div>
        </div>
    </a>
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
                {#each userInfo as info}
                    <DropdownMenu.Label class="font-normal py-1">
                        <div class="text-xs text-muted-foreground">{info.title}</div>
                        <div class="font-medium">
                            <CopyButton embedded={true}>{info.value}</CopyButton>
                        </div>
                    </DropdownMenu.Label>
                {/each}
                <DropdownMenu.Separator />
            {/if}
            {#if DemoModeMenuComponent}
                <svelte:component this={DemoModeMenuComponent} {appState} />
            {/if}
            {#if appState.logoutSiteFeature?.enabled}
                <DropdownMenu.Item
                    onclick={() => {
                        appState.showLogoutDialog = true;
                    }}>{appState.logoutSiteFeature?.menuItemTitle ?? 'Logout'}</DropdownMenu.Item
                >
            {/if}
        </DropdownMenu.Content>
    </DropdownMenu.Root>
{/snippet}

{#snippet defaultSparklesIcon(size: number | string)}
    {@const sizeStyle = typeof size === 'number' ? `width: ${size}px; height: ${size}px;` : ''}
    {@const sizeClass = typeof size === 'string' ? size : ''}
    <svg class={sizeClass} style={sizeStyle} fill="currentColor" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M 26.6875 12.6602 C 26.9687 12.6602 27.1094 12.4961 27.1797 12.2383 C 27.9062 8.3242 27.8594 8.2305 31.9375 7.4570 C 32.2187 7.4102 32.3828 7.2461 32.3828 6.9648 C 32.3828 6.6836 32.2187 6.5195 31.9375 6.4726 C 27.8828 5.6524 28.0000 5.5586 27.1797 1.6914 C 27.1094 1.4336 26.9687 1.2695 26.6875 1.2695 C 26.4062 1.2695 26.2656 1.4336 26.1953 1.6914 C 25.3750 5.5586 25.5156 5.6524 21.4375 6.4726 C 21.1797 6.5195 20.9922 6.6836 20.9922 6.9648 C 20.9922 7.2461 21.1797 7.4102 21.4375 7.4570 C 25.5156 8.2774 25.4687 8.3242 26.1953 12.2383 C 26.2656 12.4961 26.4062 12.6602 26.6875 12.6602 Z M 15.3438 28.7852 C 15.7891 28.7852 16.0938 28.5039 16.1406 28.0821 C 16.9844 21.8242 17.1953 21.8242 23.6641 20.5821 C 24.0860 20.5117 24.3906 20.2305 24.3906 19.7852 C 24.3906 19.3633 24.0860 19.0586 23.6641 18.9883 C 17.1953 18.0977 16.9609 17.8867 16.1406 11.5117 C 16.0938 11.0899 15.7891 10.7852 15.3438 10.7852 C 14.9219 10.7852 14.6172 11.0899 14.5703 11.5352 C 13.7969 17.8164 13.4687 17.7930 7.0469 18.9883 C 6.6250 19.0821 6.3203 19.3633 6.3203 19.7852 C 6.3203 20.2539 6.6250 20.5117 7.1406 20.5821 C 13.5156 21.6133 13.7969 21.7774 14.5703 28.0352 C 14.6172 28.5039 14.9219 28.7852 15.3438 28.7852 Z M 31.2344 54.7305 C 31.8438 54.7305 32.2891 54.2852 32.4062 53.6524 C 34.0703 40.8086 35.8750 38.8633 48.5781 37.4570 C 49.2344 37.3867 49.6797 36.8945 49.6797 36.2852 C 49.6797 35.6758 49.2344 35.2070 48.5781 35.1133 C 35.8750 33.7070 34.0703 31.7617 32.4062 18.9180 C 32.2891 18.2852 31.8438 17.8633 31.2344 17.8633 C 30.6250 17.8633 30.1797 18.2852 30.0860 18.9180 C 28.4219 31.7617 26.5938 33.7070 13.9140 35.1133 C 13.2344 35.2070 12.7891 35.6758 12.7891 36.2852 C 12.7891 36.8945 13.2344 37.3867 13.9140 37.4570 C 26.5703 39.1211 28.3281 40.8321 30.0860 53.6524 C 30.1797 54.2852 30.6250 54.7305 31.2344 54.7305 Z"
        />
    </svg>
{/snippet}

<style>
    .home-page-logo {
        width: auto;
        object-fit: contain;
    }

    .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
</style>
