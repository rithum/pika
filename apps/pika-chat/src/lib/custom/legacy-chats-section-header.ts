/**
 * Legacy Chats Section Header Slot
 *
 * Sync-protected extension point for injecting a custom header component above
 * the legacy chats list in the sidebar. Override to supply a Svelte component
 * that renders any notes, branding, or callouts specific to the legacy system.
 *
 * Default: returns undefined — no header rendered (section starts with session list).
 *
 * The component receives no props from the framework; it is fully self-contained.
 * If you need context from the chat app, use Svelte's getContext() inside the component.
 */
import type { Component } from 'svelte';

/**
 * Returns an optional Svelte component to render as a header above the legacy
 * chats section in the sidebar.
 *
 * @returns A Svelte component constructor, or undefined for no header
 */
export function getLegacyChatsSectionHeader(): Component<Record<string, never>> | undefined {
    return undefined;
}
