<script lang="ts">
    import { invalidate } from '$app/navigation';
    import { page } from '$app/state';
    import { AppState } from '$client/app/app.state.svelte';
    import { MarkdownRendererFactory } from '$client/app/markdown-renderer-factory';
    import AppSettings from '$client/app/settings/app-settings.svelte';
    import { onInit, onPoll } from '$lib/custom/client-lifecycle';
    import { CustomLogoutDialog } from '$lib/custom/logout-dialog';
    import { getDemoBannerComponent } from '$lib/custom/demo-mode-banner';
    import { getUserRefreshIntervalMs } from '$lib/custom/polling-interval';
    import { hasUserDataChanged } from '$lib/utils/user-data-version';
    import type {
        ChatAppLite,
        ChatUser,
        CustomDataUiRepresentation,
        HomePageSiteFeature,
        LogoutFeature,
        ShowToastOptions,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import { Toaster } from 'pika-ux/shadcn/sonner';
    import { setContext, untrack, type Snippet } from 'svelte';
    import { toast } from 'svelte-sonner';

    interface Props {
        data: {
            fetch: typeof fetch;
            user: ChatUser;
            userDataVersion: string;
            customDataUiRepresentation: CustomDataUiRepresentation | undefined;
            homePageSiteFeature: HomePageSiteFeature | undefined;
            logoutSiteFeature: LogoutFeature | undefined;
            chatApps: ChatAppLite[];
            stage: string;
        };
        children?: Snippet<[]>;
    }

    const { data, children }: Props = $props();
    const svelteKitFetch = data.fetch;

    // Use reactive references instead of destructuring to ensure reactivity
    let user = $derived(data.user);
    let userDataVersion = $derived(data.userDataVersion);

    // Create factory for markdown rendering - reused across the entire app
    const markdownRendererFactory = new MarkdownRendererFactory();

    // Create AppState once and reuse it - this preserves cached state across user data updates
    let appState = $state<AppState>() as AppState;

    let unlisten: (() => void) | undefined;
    let userRefreshInterval: NodeJS.Timeout | undefined;
    let previousUserVersion = $state<string | undefined>(undefined);
    let visibilityState = $state<DocumentVisibilityState>('visible');

    const DemoBannerComponent = getDemoBannerComponent();

    // Polling cadence — override getUserRefreshIntervalMs in polling-interval.ts to customize
    let userRefreshIntervalMs = $derived(getUserRefreshIntervalMs(user));

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
                data.chatApps,
                showToast,
                markdownRendererFactory
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
        // untrack prevents the $effect from subscribing to reactive state read
        // inside onInit (e.g., appState.identity.user), which would cause an
        // infinite loop: onInit reads user -> updateUser mutates user -> $effect re-runs
        untrack(() => {
            if (onInit) {
                onInit(appState, data.stage, svelteKitFetch).catch(() => {
                    // Swallow errors from custom hooks - don't break the app
                });
            }
        });
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

                    // Run custom polling hook if configured
                    if (onPoll) {
                        await onPoll(appState, data.stage, svelteKitFetch);
                    }

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

    function showToast(message: string, options: ShowToastOptions) {
        const duration = options.duration === 'infinite' ? Number.POSITIVE_INFINITY : options.duration;
        toast[options.type](message, {
            duration: duration,
        });
    }
</script>

<svelte:window onunload={onUnload} onkeydown={handleKeydown} />
<svelte:document bind:visibilityState onvisibilitychange={handleVisibilityChange} />

{#if DemoBannerComponent && appState}
    <svelte:component this={DemoBannerComponent} {appState} />
{/if}

{@render children?.()}

<AppSettings />

<Toaster position="top-center" richColors closeButton />

{#if appState && appState.logoutSiteFeature && appState.logoutSiteFeature.enabled}
    {#if CustomLogoutDialog}
        <!-- Use custom logout dialog from registry -->
        <CustomLogoutDialog
            open={appState.showLogoutDialog}
            onOpenChange={(open) => {
                appState.showLogoutDialog = open;
            }}
            logoutFeature={appState.logoutSiteFeature}
            stage={data.stage}
        />
    {:else}
        <!-- Default logout dialog -->
        <Dialog.Root
            bind:open={appState.showLogoutDialog}
            onOpenChange={() => {
                if (!appState.showLogoutDialog) {
                    appState.showLogoutDialog = false;
                }
            }}
        >
            <Dialog.Content class="w-[800px] max-w-[400px] sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
                <Dialog.Title>{appState.logoutSiteFeature.dialogTitle ?? 'Logout'}</Dialog.Title>

                {appState.logoutSiteFeature.dialogDescription ?? 'Are you sure you want to logout?'}
                <Dialog.Footer>
                    <Button
                        variant="default"
                        onclick={() => {
                            window.location.href = '/logout-now';
                        }}>{appState.logoutSiteFeature.dialogTitle ?? 'Logout'}</Button
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
{/if}
