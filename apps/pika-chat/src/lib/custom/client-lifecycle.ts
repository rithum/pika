/**
 * Client Lifecycle Hooks
 *
 * Extension point for running custom client-side code during layout initialization
 * and periodic polling. The core layout imports and calls these hooks at the right times.
 *
 * To ENABLE custom lifecycle hooks:
 *   Export onInit and/or onPoll functions (as shown below).
 *
 * To DISABLE custom lifecycle hooks:
 *   export const onInit = null;
 *   export const onPoll = null;
 */
import type { AppState } from '$client/app/app.state.svelte';

/**
 * Called once during layout $effect (alongside initialize and setupPeriodicUserRefresh).
 * Use this for one-time client-side initialization that needs to run on page load.
 */
export async function onInit(_appState: AppState, _stage: string, _fetchFn: typeof fetch): Promise<void> {
	// No op on purpose.  This is where add your custom initialization code.
}

/**
 * Called on each polling interval after invalidate('app:user-data').
 * Use this to keep custom client-side state current between server refreshes.
 */
export async function onPoll(_appState: AppState, _stage: string, _fetchFn: typeof fetch): Promise<void> {
	// No op on purpose.  This is where add your custom polling code.
}