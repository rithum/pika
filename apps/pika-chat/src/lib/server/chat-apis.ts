import type {
    ChatMessagesResponse,
    ChatSession,
    ChatSessionsResponse,
    ChatUser,
    ChatUserAddOrUpdateResponse,
    ChatUserResponse,
    RecordOrUndef,
} from '@pika/shared/types/chatbot/chatbot-types';
import { convertToJwtString } from '@pika/shared/util/jwt';
import { appConfig } from './config';
import { invokeApi } from './invoke-api';

export async function getChatUser<T extends RecordOrUndef = undefined>(
    userId: string
): Promise<ChatUser<T> | undefined> {
    const response = await invokeApi<ChatUserResponse<T>>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/user`,
        method: 'GET',
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`,
        },
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error getting user from chat database for userId ${userId} with status code: ${response.statusCode} and error: ${response.body?.error}`
        );
    }

    return response.body.user;
}

export async function createChatUser<T extends RecordOrUndef = undefined>(user: ChatUser<T>): Promise<ChatUser<T>> {
    const response = await invokeApi<ChatUserAddOrUpdateResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/user`,
        method: 'POST',
        body: user,
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<T>({ userId: user.userId, customUserData: user.customData }, appConfig.jwtSecret)}`,
        },
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error creating user in chat database for userId ${user.userId} with status code: ${response.statusCode} and error: ${response.body?.error}`
        );
    }

    return response.body.user as ChatUser<T>;
}

export async function getChatSessions(userId: string, chatAppId: string): Promise<ChatSession[]> {
    const response = await invokeApi<ChatSessionsResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/conversations/${chatAppId}`,
        method: 'GET',
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`,
        },
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error getting sessions from chat database for userId ${userId} and chatAppId ${chatAppId} with status code: ${response.statusCode} and error: ${response.body?.error} and body: ${JSON.stringify(response.body)}`
        );
    }

    return response.body.sessions;
}

export async function getChatMessages(sessionId: string, userId: string): Promise<ChatMessagesResponse> {
    const response = await invokeApi<ChatMessagesResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/${sessionId}/messages`,
        method: 'GET',
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`,
        },
    });
    return response.body;
}
