/**
 * Demo-Mode Banner Hook — sync-protected extension point.
 *
 * Controls whether a banner is rendered at the top of every authenticated
 * page. Override `getDemoBannerComponent` to return a Svelte component when
 * demo mode is active. The component receives `appState` as a prop.
 *
 * CSS contract: the framework reserves viewport space for the banner via the
 * `--demo-banner-h` CSS custom property (see app.css). When your banner
 * mounts, set `--demo-banner-h` on `<html>` (e.g. 32px) and toggle the
 * `.demo-mode-on` class so that `h-svh` / `h-screen` elements and the fixed
 * sidebar are offset correctly. Remove both when demo mode is off.
 *
 * Default: returns undefined — no banner is rendered.
 */
import type { AppState } from '$client/app/app.state.svelte';
import type { Component } from 'svelte';

export type DemoBannerProps = { appState: AppState };

/**
 * Returns a Svelte component to render as the demo-mode banner, or undefined
 * if no banner should be shown.
 */
export function getDemoBannerComponent(): Component<DemoBannerProps> | undefined {
	return undefined;
}
