import {
    BaseRequestData,
    ChatMessage,
    ChatMessageForCreate,
    ChatMessageResponse,
    ChatMessagesResponse,
    ChatSessionsResponse,
    ChatTitleUpdateRequest,
    ChatUser,
    ChatUserAddOrUpdateResponse,
    ChatUserResponse,
    ConverseRequest
} from '@pika/shared/types/chatbot/chatbot-types';
import { apiGatewayFunctionDecorator, APIGatewayProxyEventPika } from '@pika/shared/util/api-gateway-utils';

import { HttpStatusError } from '@pika/shared/util/http-status-error';
import { addUser, getUserByUserId, updateUser } from '../../lib/chat-ddb';
import { addChatMessage, getChatMessages, getChatSession, getUserSessions, getUserSessionsByChatAppId, updateSessionTitle } from '../../lib/chat-apis';
import { UnauthorizedError } from '../../lib/unauthorized-error';
import { getValueFromParameterStore } from '../../lib/ssm';
import { extractFromJwtString } from '@pika/shared/util/jwt';

// This variable is stored in the lamdbda context and will survive across invocations so we
// only need to get it once until the lambda is restarted
let jwtSecret: string | undefined;

type userObjFnTypeHandler<T, U> = (event: APIGatewayProxyEventPika<T>, user: ChatUser) => Promise<U>;
type userIdFnTypeHandler<T, U> = (event: APIGatewayProxyEventPika<T>, userId: string) => Promise<U>;

const routes: Record<string, { handler: userObjFnTypeHandler<any, any> | userIdFnTypeHandler<any, any>; passUserObj: boolean }> = {
    'GET:/api/chat/user': {
        handler: handleGetUser,
        passUserObj: false
    },
    'POST:/api/chat/user': {
        handler: handleCreateOrUpdateUser,
        passUserObj: false
    },
    'GET:/api/chat/{sessionId}/messages': {
        handler: handleGetChatMessages,
        passUserObj: true
    },
    'POST:/api/chat/{sessionId}/message': {
        handler: handleAddChatMessage,
        passUserObj: true
    },
    'GET:/api/chat/conversations': {
        handler: handleGetUserSessions,
        passUserObj: true
    },
    'POST:/api/chat/{sessionId}/title': {
        handler: handleUpdateSessionTitle,
        passUserObj: true
    },
    'GET:/api/chat/conversations/{chatAppId}': {
        handler: handleGetUserSessionsByChatAppId,
        passUserObj: true
    }
};

/**
 * This will be decorated by the apiGatewayFunctionDecorator which wraps the handler in a try/catch
 * and formats the response using the toResponse function.  So, you just need to return the response
 * from the handlerFn and it will be formatted for the API Gateway response.  You can just throw errors
 * and they will be caught and formatted as a 500 error.  If you want to return a specific HTTP status code,
 * throw a HttpStatusError.
 */
export async function handlerFn(event: APIGatewayProxyEventPika<ConverseRequest | ChatTitleUpdateRequest | ChatUser | BaseRequestData | void>) {
    console.log('Event:', JSON.stringify(event, null, 2));

    if (!process.env.STAGE) {
        throw new Error('STAGE is not set in the environment variables');
    }

    if (!process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE) {
        throw new Error('PIKA_SERVICE_PROJ_NAME_KEBAB_CASE is not set in the environment variables');
    }

    if (!jwtSecret) {
        jwtSecret = await getValueFromParameterStore(`/stack/${process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE}/${process.env.STAGE}/jwt-secret`);
    }

    if (!jwtSecret) {
        throw new Error('JWT secret not found in SSM');
    }

    const authHeader = event.headers['x-chat-auth'];
    if (!authHeader) {
        throw new Error('Authorization header not found in HTTP header');
    }

    const [simpleUser, error] = extractFromJwtString<undefined>(authHeader, jwtSecret);
    if (typeof simpleUser === 'number') {
        throw new HttpStatusError(error ?? 'Unauthorized', simpleUser);
    }

    const { httpMethod, resource } = event;

    console.log('resource', resource);

    const route = `${httpMethod}:${resource}`;
    const routeHandler = routes[route];
    if (!routeHandler) {
        throw new HttpStatusError(`Unsupported route: ${httpMethod} ${resource}`, 404);
    }

    if (routeHandler.passUserObj) {
        const user = await getUserByUserId(simpleUser.userId);
        if (!user) {
            throw new UnauthorizedError('Unauthorized: user not found');
        }
        return (routeHandler.handler as userObjFnTypeHandler<any, any>)(event, user);
    } else {
        return (routeHandler.handler as userIdFnTypeHandler<any, any>)(event, simpleUser.userId);
    }
}

/**
 * GET:/api/chat/user
 */
async function handleGetUser(_event: APIGatewayProxyEventPika<void>, userId: string): Promise<ChatUserResponse> {
    const user = await getUserByUserId(userId);
    return {
        success: true,
        user
    };
}

/**
 * POST:/api/chat/user
 */
async function handleCreateOrUpdateUser(event: APIGatewayProxyEventPika<ChatUser>, userId: string): Promise<ChatUserAddOrUpdateResponse | undefined> {
    // The body of the post must be a ChatUser object
    const user = event.body;
    if (!user) {
        throw new Error('User is required');
    }

    // Just in case, override the userId with the one from the jwt
    user.userId = userId;

    // Just in case they passed in the overrideData field, we need to remove it
    delete user.overrideData;

    let userToReturn: ChatUser;

    // Check if the user already exists
    const existingUser = await getUserByUserId(user.userId);
    if (existingUser) {
        // Doing an update
        user.createDate = existingUser.createDate;
        user.lastUpdate = existingUser.lastUpdate;

        // Update the user
        userToReturn = await updateUser(user);
    } else {
        // Doing an add
        userToReturn = await addUser(user);
    }

    return {
        success: true,
        user: userToReturn
    };
}

/**
 *  GET:/api/chat/{sessionId}/messages
 */
async function handleGetChatMessages(event: APIGatewayProxyEventPika<BaseRequestData>, user: ChatUser): Promise<ChatMessagesResponse> {
    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) {
        throw new Error('Session ID is required');
    }
    // Get the session and make sure it's associated with the user
    const chatSession = await getChatSession(user.userId, sessionId);
    if (!chatSession) {
        throw new UnauthorizedError('Unauthorized: chat session not found');
    }

    const messages = await getChatMessages(user.userId, sessionId);
    return {
        success: true,
        messages
    };
}

/**
 * POST:/api/chat/{sessionId}/message
 */
async function handleAddChatMessage(event: APIGatewayProxyEventPika<ConverseRequest>, user: ChatUser): Promise<ChatMessageResponse> {
    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) {
        throw new Error('Session ID is required');
    }

    const body = event.body;
    if (!body || !body.message) {
        throw new Error('Message is required');
    }

    // Get the session and make sure it's associated with the user
    const chatSession = await getChatSession(user.userId, sessionId);
    if (!chatSession) {
        throw new UnauthorizedError('Unauthorized: chat session not found');
    }

    const chatMessage: ChatMessageForCreate = {
        userId: user.userId,
        sessionId,
        message: body.message,
        source: 'user'
    };

    const message = await addChatMessage(chatMessage, chatSession);
    return {
        success: true,
        message
    };
}

/**
 * GET:/api/chat/conversations
 */
async function handleGetUserSessions(_event: APIGatewayProxyEventPika<BaseRequestData>, user: ChatUser): Promise<ChatSessionsResponse> {
    const sessions = await getUserSessions(user.userId);
    return {
        success: true,
        sessions
    };
}

/**
 * GET:/api/chat/conversations/{chatAppId}
 */
async function handleGetUserSessionsByChatAppId(event: APIGatewayProxyEventPika<BaseRequestData>, user: ChatUser): Promise<ChatSessionsResponse> {
    const chatAppId = event.pathParameters?.chatAppId;
    if (!chatAppId) {
        throw new Error('Chat app ID is required');
    }

    const sessions = await getUserSessionsByChatAppId(user.userId, chatAppId);
    return {
        success: true,
        sessions
    };
}

/**
 * POST:/api/chat/{sessionId}/title
 */
async function handleUpdateSessionTitle(event: APIGatewayProxyEventPika<ChatTitleUpdateRequest>, user: ChatUser) {
    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) {
        throw new Error('Session ID is required');
    }

    // Get the session and make sure it's associated with the user
    const chatSession = await getChatSession(user.userId, sessionId);
    if (!chatSession) {
        throw new UnauthorizedError('Unauthorized: chat session not found');
    }

    const titleUpdateRequest = event.body;

    return await updateSessionTitle(sessionId, user.userId, titleUpdateRequest);
}

export const handler = apiGatewayFunctionDecorator(handlerFn);
