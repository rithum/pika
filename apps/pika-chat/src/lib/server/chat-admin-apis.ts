import type { ChatApp } from '@pika/shared/types/chatbot/chatbot-types';
import { appConfig } from './config';
import { invokeApi } from './invoke-api';
import { convertToJwtString } from './jwt';

export async function getChatApp(chatAppId: string): Promise<ChatApp | undefined> {
    const response = await invokeApi({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/chat-app/${chatAppId}`,
        method: 'GET',
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: chatAppId, authData: undefined })}`,
        },
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error getting chat app from chat database for chatAppId ${chatAppId} with status code: ${response.statusCode} and error: ${response.body?.error}`
        );
    }

    return response.body.chatApp;
}
