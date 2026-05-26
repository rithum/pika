/**
 * Demo-Mode Menu Item Hook — sync-protected extension point.
 *
 * Controls whether an extra item is injected into the user-settings dropdown
 * in all four locations: chat titlebar, chat sidebar nav, site-admin titlebar,
 * and home-page settings. Override `getDemoModeMenuItem` to return a Svelte
 * component when demo mode is active. The component receives `appState` as a
 * prop and is responsible for its own label, icon, and onclick behavior. It
 * should render a <DropdownMenu.Item> from pika-ux/shadcn/dropdown-menu.
 *
 * Default: returns undefined — no extra item is rendered.
 */
import type { AppState } from '$client/app/app.state.svelte';
import type { Component } from 'svelte';

export type DemoModeMenuItemProps = { appState: AppState };

/**
 * Returns a Svelte component to render as an extra item in user-settings
 * dropdowns, or undefined if no extra item should be shown.
 */
export function getDemoModeMenuItem(): Component<DemoModeMenuItemProps> | undefined {
	return undefined;
}
