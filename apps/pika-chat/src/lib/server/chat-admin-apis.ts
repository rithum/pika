import type { ChatApp } from '@pika/shared/types/chatbot/chatbot-types';
import { appConfig } from './config';
import { invokeApi } from './invoke-api';
import { convertToJwtString } from '@pika/shared/util/jwt';

export async function getChatApp(chatAppId: string): Promise<ChatApp | undefined> {
    const response = await invokeApi({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/chat-app/${chatAppId}`,
        method: 'GET',
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: chatAppId, customUserData: undefined }, appConfig.jwtSecret)}`
        }
    });

    if (!response.body || !response.body.success) {
        throw new Error(`Error getting chat app from chat database for chatAppId ${chatAppId} with status code: ${response.statusCode} and error: ${response.body?.error}`);
    }

    return response.body.chatApp;
}
