<script lang="ts">
    import { invalidate } from '$app/navigation';
    import { page } from '$app/state';
    import { AppState } from '$client/app/app.state.svelte';
    import AppSettings from '$client/app/settings/app-settings.svelte';
    import { hasUserDataChanged } from '$lib/utils/user-data-version';
    import Button from '$ui/shadcn/button/button.svelte';
    import * as Dialog from '$ui/shadcn/dialog';
    import { Toaster } from '$ui/shadcn/sonner';
    import type {
        ChatAppLite,
        ChatUser,
        CustomDataUiRepresentation,
        HomePageSiteFeature,
        LogoutFeature,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import { setContext, type Snippet } from 'svelte';

    interface Props {
        data: {
            fetch: typeof fetch;
            user: ChatUser;
            userDataVersion: string;
            customDataUiRepresentation: CustomDataUiRepresentation | undefined;
            homePageSiteFeature: HomePageSiteFeature | undefined;
            logoutSiteFeature: LogoutFeature | undefined;
            chatApps: ChatAppLite[];
        };
        children?: Snippet<[]>;
    }

    const { data, children }: Props = $props();
    const svelteKitFetch = data.fetch;

    // Use reactive references instead of destructuring to ensure reactivity
    let user = $derived(data.user);
    let userDataVersion = $derived(data.userDataVersion);

    // Create AppState once and reuse it - this preserves cached state across user data updates
    let appState = $state<AppState>() as AppState;

    let unlisten: (() => void) | undefined;
    let userRefreshInterval: NodeJS.Timeout | undefined;
    let previousUserVersion = $state<string | undefined>(undefined);
    let visibilityState = $state<DocumentVisibilityState>('visible');

    // Internal users we refresh once a minute, external users we refresh once every 10 minutes
    let userRefreshIntervalMs = $derived(user.userType === 'internal-user' ? 60 * 1000 : 10 * 60 * 1000);

    // Create AppState immediately so child components can access it from context
    // Use $effect.pre() to run synchronously during initial render
    $effect.pre(() => {
        if (!appState) {
            // console.log('[Layout.svelte] Creating AppState (will be preserved across data updates)');
            appState = new AppState(
                svelteKitFetch,
                user,
                data.customDataUiRepresentation,
                data.homePageSiteFeature,
                data.logoutSiteFeature,
                data.chatApps
            );
            appState.page = page;
            setContext('appState', appState);
            previousUserVersion = userDataVersion;
        }
    });

    // Watch for user data changes and update AppState reactively (AppState is already created above)
    $effect(() => {
        // console.log('[Layout.svelte] User data effect running:', {
        //     userId: user.userId,
        //     previousVersion: previousUserVersion,
        //     newVersion: userDataVersion,
        //     hasChanged: hasUserDataChanged(previousUserVersion, userDataVersion),
        //     firstName: user.firstName,
        //     lastName: user.lastName,
        //     timestamp: new Date().toISOString(),
        // });

        // AppState should always exist by now (created synchronously above)
        if (!appState) {
            console.error('[Layout.svelte] AppState is unexpectedly undefined in effect');
            return;
        }

        if (hasUserDataChanged(previousUserVersion, userDataVersion)) {
            // console.log('[Layout.svelte] User data changed - updating existing AppState:', {
            //     previousVersion: previousUserVersion,
            //     newVersion: userDataVersion,
            //     userId: user.userId,
            //     firstName: user.firstName,
            //     lastName: user.lastName,
            //     userType: user.userType,
            //     roles: user.roles,
            // });

            appState.updateUser(user);
            appState.customDataUiRepresentation = data.customDataUiRepresentation;
            previousUserVersion = userDataVersion;

            // console.log('[Layout.svelte] AppState updated with new user data (preserved cached state)');
        } else {
            // console.log('[Layout.svelte] No user data changes detected - preserving existing AppState');
        }
    });

    $effect(() => {
        initialize();
        setupPeriodicUserRefresh();
    });

    async function initialize() {
        const crypto: Crypto = window.crypto;
        if (!crypto) {
            throw new Error('Crypto is not available');
        }
        if (!crypto.getRandomValues) {
            throw new Error('Crypto.getRandomValues is not available');
        }

        // await appState.initializeIdentity(crypto);
    }

    /**
     * Sets up periodic user data refresh to ensure client stays in sync
     * with server-side ChatUser changes detected in hooks.server.ts
     */
    function setupPeriodicUserRefresh() {
        startPolling();
    }

    function startPolling() {
        if (userRefreshInterval) return; // Already running

        // console.log('[Layout.svelte] Starting user data polling:', { intervalMs: userRefreshIntervalMs });

        userRefreshInterval = setInterval(async () => {
            // Only poll if tab is visible
            if (visibilityState === 'visible') {
                try {
                    // console.log('[Layout.svelte] Polling: invalidating user-data to trigger server refresh');

                    // Invalidate user data - should now trigger both parent and child layout server functions
                    await invalidate('app:user-data');

                    // console.log('[Layout.svelte] Polling: invalidate completed successfully');
                } catch (error) {
                    // console.error('[Layout.svelte] Error during periodic user refresh:', error);
                }
            } else {
                // console.log('[Layout.svelte] Polling: skipping refresh - tab not visible');
            }
        }, userRefreshIntervalMs);
    }

    function stopPolling() {
        if (userRefreshInterval) {
            clearInterval(userRefreshInterval);
            userRefreshInterval = undefined;
        }
    }

    function handleVisibilityChange() {
        if (visibilityState === 'visible') {
            // Tab became visible - resume polling and do immediate refresh
            // console.log('[Layout.svelte] Tab became visible - resuming user data polling');
            startPolling();
            // Do immediate refresh when user returns to get latest data
            invalidate('app:user-data').catch((error) => {
                console.error('[Layout.svelte] Error during immediate user refresh on visibility change:', error);
            });
        } else {
            // Tab became hidden - pause polling to save resources
            // console.log('[Layout.svelte] Tab became hidden - pausing user data polling');
            stopPolling();
        }
    }

    function onUnload() {
        if (unlisten) {
            unlisten();
        }
        stopPolling();
    }

    const handleKeydown = (e: KeyboardEvent) => {
        if (appState) {
            appState.checkForHotKey(e);
        }
    };
</script>

<svelte:window onunload={onUnload} onkeydown={handleKeydown} />
<svelte:document bind:visibilityState onvisibilitychange={handleVisibilityChange} />

{@render children?.()}

<AppSettings />

<Toaster position="top-center" richColors closeButton />

{#if appState && appState.features && appState.features.logout.enabled}
    <Dialog.Root
        bind:open={appState.showLogoutDialog}
        onOpenChange={() => {
            if (!appState.showLogoutDialog) {
                appState.showLogoutDialog = false;
            }
        }}
    >
        <Dialog.Content>
            <Dialog.Title>{appState.features.logout.dialogTitle}</Dialog.Title>

            {appState.features.logout.dialogDescription}
            <Dialog.Footer>
                <Button
                    variant="default"
                    onclick={() => {
                        window.location.href = '/logout-now';
                    }}>{appState.features.logout.dialogTitle}</Button
                >
                <Button
                    variant="outline"
                    onclick={() => {
                        appState.showLogoutDialog = false;
                    }}>Cancel</Button
                >
            </Dialog.Footer>
        </Dialog.Content>
    </Dialog.Root>
{/if}
