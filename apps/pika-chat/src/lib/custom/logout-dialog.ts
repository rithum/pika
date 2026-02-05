/**
 * Custom Logout Dialog Registry
 *
 * This module controls whether a custom logout dialog is used.
 *
 * To ENABLE custom logout (redirect to / after logout):
 *   import CustomLogoutDialog from './components/CustomLogoutDialog.svelte';
 *   export { CustomLogoutDialog };
 *
 * To DISABLE custom logout (use default behavior - redirect to /login):
 *   export const CustomLogoutDialog: CustomLogoutDialogComponent = null;
 */
import type { Component } from 'svelte';
import type { LogoutFeature } from 'pika-shared/types/chatbot/chatbot-types';

export interface CustomLogoutDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    logoutFeature: LogoutFeature | undefined;
    stage: string;
}

export type CustomLogoutDialogComponent = Component<CustomLogoutDialogProps> | null;

export const CustomLogoutDialog: CustomLogoutDialogComponent = null;
