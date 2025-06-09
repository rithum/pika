import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import type { ChatApp } from '@pika/shared/types/chatbot/chatbot-types';
import { getChatApp } from '$lib/server/chat-admin-apis';

export const load: PageServerLoad = async ({ params }) => {
    const { chatAppId } = params;
    let chatApp: ChatApp | undefined;
    
    try {
        chatApp = await getChatApp(chatAppId);
    } catch (e) {
        if (e instanceof Error && e.message.includes('404')) {
            throw error(404, 'Chat app not found');
        }
        throw e;
    }

    if (!chatApp) {
        throw error(404, 'Chat app not found');
    }

    if (!chatApp.enabled) {
        throw error(404, 'Chat app is not enabled');
    }

    return {
        chatApp
    };
}; 