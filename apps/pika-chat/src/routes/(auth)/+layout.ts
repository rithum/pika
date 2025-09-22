import type { LoadEvent } from '@sveltejs/kit';
import type { ChatUser } from 'pika-shared/types/chatbot/chatbot-types';

export async function load({ fetch, data }: LoadEvent) {
    // Only fetch and return user data - AppState will be created once in the component
    // This ensures AppState isn't recreated on every invalidation, preserving cached state

    // console.log('[Layout.ts] Load function running:', { userId: data?.user?.userId, firstName: data?.user?.firstName });

    if (!data) {
        throw new Error('No data provided to layout load function');
    }

    // console.log('[Layout.ts] Returning user data (AppState will be created in component)');

    return {
        fetch, // Pass fetch to component so it can create AppState
        user: data.user as ChatUser,
        userDataVersion: data.userDataVersion,
        customDataUiRepresentation: data.customDataUiRepresentation,
        homePageSiteFeature: data.homePageSiteFeature,
        logoutSiteFeature: data.logoutSiteFeature,
        chatApps: data.chatApps
    };
}
