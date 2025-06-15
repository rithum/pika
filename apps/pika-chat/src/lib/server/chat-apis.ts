import type { ChatSession, ChatUser, ChatApp } from '@pika/shared/types/chatbot/chatbot-types';
import { invokeApi } from './invoke-api';
import { appConfig } from './config';
import { convertToJwtString } from './jwt';

export async function getChatUser(userId: string): Promise<ChatUser | undefined> {
    const response = await invokeApi({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/user`,
        method: 'GET',
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, authData: undefined })}`,
        },
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error getting user from chat database for userId ${userId} with status code: ${response.statusCode} and error: ${response.body?.error}`
        );
    }

    return response.body.user;
}

export async function createChatUser(user: ChatUser): Promise<ChatUser> {
    const response = await invokeApi({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/user`,
        method: 'POST',
        body: user,
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: user.userId, authData: undefined })}`,
        },
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error creating user in chat database for userId ${user.userId} with status code: ${response.statusCode} and error: ${response.body?.error}`
        );
    }

    return response.body.user;
}

export async function getChatSessions(userId: string, chatAppId: string): Promise<ChatSession[]> {
    const response = await invokeApi({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/conversations/${chatAppId}`,
        method: 'GET',
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, authData: undefined })}`,
        },
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error getting sessions from chat database for userId ${userId} and chatAppId ${chatAppId} with status code: ${response.statusCode} and error: ${response.body?.error} and body: ${JSON.stringify(response.body)}`
        );
    }

    return response.body.sessions;
}

export async function getChatMessages(sessionId: string, userId: string) {
    const response = await invokeApi({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/${sessionId}/messages`,
        method: 'GET',
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, authData: undefined })}`,
        },
    });
    return response.body;
}
