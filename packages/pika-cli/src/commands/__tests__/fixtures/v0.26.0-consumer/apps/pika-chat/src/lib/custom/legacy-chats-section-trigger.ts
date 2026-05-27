/**
 * Legacy Chats Section Trigger Hook
 *
 * Extension point for injecting a component into the sidebar navigation that
 * is rendered when legacy chats have not yet been loaded. Use this to present
 * a button, prompt, or any other UI that initiates the legacy session load.
 *
 * This file is protected from pika sync — your changes will be preserved when
 * you update from upstream.
 */
import type { Component } from 'svelte';

/**
 * Returns an optional Svelte component rendered in the sidebar when legacy
 * chats are in the unloaded state (before `loadLegacyChatsIfNeeded` has
 * returned `loaded: true`).
 *
 * Return a Svelte component to display a load trigger — for example, a button
 * that initiates a user-triggered legacy session fetch. Return `undefined`
 * (the default) to render nothing.
 *
 * The component receives no props.
 */
export function getLegacyChatsSectionTrigger(): Component<Record<string, never>> | undefined {
    return undefined;
}
