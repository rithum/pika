import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import type { ChatApp, ChatAppMode } from '@pika/shared/types/chatbot/chatbot-types';
import { getChatApp } from '$lib/server/chat-admin-apis';

export const load: PageServerLoad = async ({ params, url }) => {
    const { chatAppId } = params;
    const modeParam = url.searchParams.get('mode') || undefined;
    let chatApp: ChatApp | undefined;

    let mode: ChatAppMode | undefined;
    if (modeParam && modeParam !== 'fullpage' && modeParam !== 'embedded') {
        throw error(400, 'Invalid mode');
    }

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

    // Allow them to override the mode if they want to
    if (modeParam) {
        chatApp.mode = modeParam as ChatAppMode;
    }

    return {
        chatApp
    };
}; 