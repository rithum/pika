import {
    AddChatSessionFeedbackRequest,
    AddChatSessionFeedbackResponse,
    BaseRequestData,
    ChatMessageForCreate,
    ChatMessageResponse,
    ChatMessagesResponse,
    ChatSessionsResponse,
    ChatTitleUpdateRequest,
    ChatUser,
    ChatUserAddOrUpdateResponse,
    ChatUserResponse,
    ChatUserSearchResponse,
    ConverseRequest,
    GetChatSessionFeedbackResponse,
    GetChatUserPrefsResponse,
    SearchAllMyMemoryRecordsRequest,
    SearchAllMyMemoryRecordsResponse,
    SetChatUserPrefsRequest,
    SetChatUserPrefsResponse,
    TagDefinitionSearchRequest,
    TagDefinitionSearchResponse,
    UserMemoryStrategies,
    CreateSharedSessionRequest,
    CreateSharedSessionResponse,
    GetRecentSharedRequest,
    GetRecentSharedResponse,
    GetPinnedSessionsRequest,
    GetPinnedSessionsResponse,
    PinSessionRequest,
    UnpinSessionRequest,
    ValidateShareAccessRequest,
    ValidateShareAccessResponse,
    RecordOrUndef,
    RecordShareVisitRequest,
    RecordShareVisitResponse,
    PinSessionResponse,
    UnpinSessionResponse,
    RevokeSharedSessionRequest,
    RevokeSharedSessionResponse,
    UnrevokeSharedSessionRequest,
    UnrevokeSharedSessionResponse
} from 'pika-shared/types/chatbot/chatbot-types';
import { apiGatewayFunctionDecorator, APIGatewayProxyEventPika } from 'pika-shared/util/api-gateway-utils';

import { HttpStatusError } from 'pika-shared/util/http-status-error';
import { extractFromJwtString } from 'pika-shared/util/jwt';
import {
    addChatMessage,
    addChatSessionFeedback,
    getChatMessages,
    getChatSession,
    getChatSessionFeedback,
    getUserPrefs,
    getUserSessions,
    getUserSessionsByChatAppId,
    searchForUsers,
    searchTagDefsApi,
    setUserPrefs,
    updateSessionTitle,
    createSharedSessionForSession,
    validateUserCanAccessShare,
    handlePinSession,
    handleUnpinSession,
    handleRecordShareVisit,
    getRecentSharedSessionsForUser,
    getPinnedSessionsForUser,
    revokeSharedSessionApi,
    unrevokeSharedSessionApi
} from '../../lib/chat-apis';
import { addUser, getChatSessionByShareId, getUserByUserId, updateUser } from '../../lib/chat-ddb';
import { getAllMemoryRecords } from '../../lib/memory';
import { getValueFromParameterStore } from '../../lib/ssm';
import { UnauthorizedError } from 'pika-shared/util/unauthorized-error';
import { BadRequestError } from 'pika-shared/util/bad-request-error';
import { ForbiddenError } from 'pika-shared/util/forbidden-error';
import { getMemoryId } from '../../lib/utils';

// This variable is stored in the lamdbda context and will survive across invocations so we
// only need to get it once until the lambda is restarted
let jwtSecret: string | undefined;

type userObjFnTypeHandler<T, U> = (event: APIGatewayProxyEventPika<T>, user: ChatUser) => Promise<U>;
type userIdFnTypeHandler<T, U> = (event: APIGatewayProxyEventPika<T>, userId: string) => Promise<U>;

// Route matching utilities for proxy integration
interface RouteMatch {
    handler: userObjFnTypeHandler<any, any> | userIdFnTypeHandler<any, any>;
    passUserObj: boolean;
    pathParameters: Record<string, string>;
}

/**
 * Convert a route template (e.g., "/api/chat/{sessionId}/messages") to a regex pattern
 */
function routeTemplateToRegex(template: string): RegExp {
    // Escape special regex characters except for our parameter placeholders
    const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Replace {paramName} with named capture groups
    const withCaptures = escaped.replace(/\\{([^}]+)\\}/g, '(?<$1>[^/]+)');
    return new RegExp(`^${withCaptures}$`);
}

/**
 * Find a matching route handler for the given method and path
 */
function findMatchingRoute(method: string, path: string): RouteMatch | undefined {
    const routeKey = `${method}:${path}`;

    // First try exact match (for routes without parameters)
    const exactMatch = routes[routeKey];
    if (exactMatch) {
        return {
            handler: exactMatch.handler,
            passUserObj: exactMatch.passUserObj,
            pathParameters: {}
        };
    }

    // Try pattern matching for parameterized routes
    for (const [template, routeConfig] of Object.entries(routes)) {
        const [templateMethod, templatePath] = template.split(':');

        if (templateMethod !== method) continue;

        // Skip if this doesn't contain parameters
        if (!templatePath.includes('{')) continue;

        const regex = routeTemplateToRegex(templatePath);
        const match = path.match(regex);

        if (match && match.groups) {
            return {
                handler: routeConfig.handler,
                passUserObj: routeConfig.passUserObj,
                pathParameters: match.groups
            };
        }
    }

    return undefined;
}

const routes: Record<string, { handler: userObjFnTypeHandler<any, any> | userIdFnTypeHandler<any, any>; passUserObj: boolean }> = {
    'GET:/api/chat/user': {
        handler: handleGetUser,
        passUserObj: false
    },
    'GET:/api/chat/user/prefs': {
        handler: handleGetUserPrefs,
        passUserObj: false
    },
    'POST:/api/chat/user/prefs': {
        handler: handleSetUserPrefs,
        passUserObj: false
    },
    'GET:/api/chat/user/search/{partialUserId}': {
        handler: handleSearchForUsers,
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
    },
    'POST:/api/chat/feedback': {
        handler: handleAddFeedback,
        passUserObj: true
    },
    'GET:/api/chat/feedback/{sessionId}': {
        handler: handleGetFeedbackBySessionId,
        passUserObj: false
    },
    'POST:/api/chat/tagdef/search': {
        handler: handleGetTagDefs,
        passUserObj: false
    },
    'POST:/api/chat/memory/record/search': {
        handler: handleSearchAllMemoryRecords,
        passUserObj: false
    },
    'POST:/api/chat/session/share': {
        handler: handleCreateSharedSession,
        passUserObj: true
    },
    'DELETE:/api/chat/session/share': {
        handler: handleRevokeSharedSession,
        passUserObj: false
    },
    'POST:/api/chat/session/share/unrevoke': {
        handler: handleUnrevokeSharedSession,
        passUserObj: false
    },
    'POST:/api/chat/session/share/recent': {
        handler: handleGetRecentSharedSessions,
        passUserObj: false
    },
    'POST:/api/chat/session/pinned/search': {
        handler: handleGetPinnedSessions,
        passUserObj: false
    },
    'POST:/api/chat/session/share/access': {
        handler: handleValidateShareAccess,
        passUserObj: true
    },
    'POST:/api/chat/session/share/visit': {
        handler: handleRecordShareVisitApi,
        passUserObj: false
    },
    'POST:/api/chat/session/pinned': {
        handler: handlePinSessionApi,
        passUserObj: false
    },
    'DELETE:/api/chat/session/pinned': {
        handler: handleUnpinSessionApi,
        passUserObj: false
    }
};

/**
 * This will be decorated by the apiGatewayFunctionDecorator which wraps the handler in a try/catch
 * and formats the response using the toResponse function.  So, you just need to return the response
 * from the handlerFn and it will be formatted for the API Gateway response.  You can just throw errors
 * and they will be caught and formatted as a 500 error.  If you want to return a specific HTTP status code,
 * throw a HttpStatusError.
 */
export async function handlerFn(event: APIGatewayProxyEventPika<ConverseRequest | ChatTitleUpdateRequest | ChatUser | TagDefinitionSearchRequest | BaseRequestData | void>) {
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

    const { httpMethod, path } = event;

    console.log('path', path);

    // Use dynamic route matching for proxy integration
    const routeMatch = findMatchingRoute(httpMethod, path);
    if (!routeMatch) {
        throw new HttpStatusError(`Unsupported route: ${httpMethod} ${path}`, 404);
    }

    // Merge extracted path parameters with existing ones
    if (Object.keys(routeMatch.pathParameters).length > 0) {
        event.pathParameters = {
            ...event.pathParameters,
            ...routeMatch.pathParameters
        };
    }

    if (routeMatch.passUserObj) {
        const user = await getUserByUserId(simpleUser.userId);
        if (!user) {
            throw new UnauthorizedError('Unauthorized: user not found');
        }
        return (routeMatch.handler as userObjFnTypeHandler<any, any>)(event, user);
    } else {
        return (routeMatch.handler as userIdFnTypeHandler<any, any>)(event, simpleUser.userId);
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
 * GET:/api/chat/user/prefs
 */
async function handleGetUserPrefs(_event: APIGatewayProxyEventPika<void>, userId: string): Promise<GetChatUserPrefsResponse> {
    const prefs = await getUserPrefs(userId);
    return {
        success: true,
        userId,
        prefs
    };
}

/**
 * POST:/api/chat/user/prefs
 */
async function handleSetUserPrefs(event: APIGatewayProxyEventPika<SetChatUserPrefsRequest>, userId: string): Promise<SetChatUserPrefsResponse> {
    const request = event.body;
    if (!request) {
        throw new BadRequestError('Request body is required');
    }

    if (!('prefs' in request)) {
        throw new BadRequestError('Prefs are required');
    }

    if (typeof request.prefs !== 'object') {
        throw new BadRequestError('Prefs must be an object');
    }

    if ('partial' in request && typeof request.partial !== 'boolean') {
        throw new BadRequestError('Partial must be a boolean');
    }

    const newPrefs = await setUserPrefs(userId, request.prefs, request.partial ?? false);

    return {
        success: true,
        userId,
        prefs: newPrefs
    };
}

/**
 * GET:/api/chat/user/search/{partialUserId}
 *
 * The userId arg is the logged in user's userId.
 */
async function handleSearchForUsers(event: APIGatewayProxyEventPika<void>, userId: string): Promise<ChatUserSearchResponse> {
    const partialUserId = event.pathParameters?.partialUserId;
    if (!partialUserId) {
        throw new BadRequestError('Partial user ID is required');
    }

    const users = await searchForUsers(partialUserId.trim());
    return {
        success: true,
        users
    };
}

/**
 * POST:/api/chat/user
 */
async function handleCreateOrUpdateUser(event: APIGatewayProxyEventPika<ChatUser<RecordOrUndef>>, userId: string): Promise<ChatUserAddOrUpdateResponse | undefined> {
    // The body of the post must be a ChatUser object
    const user = event.body;
    if (!user) {
        throw new BadRequestError('User is required');
    }

    // Just in case, override the userId with the one from the jwt
    user.userId = userId;

    // Just in case they passed in the overrideData or viewingContentFor fields, we need to remove it
    delete user.overrideData;
    delete user.viewingContentFor;

    let userToReturn: ChatUser<RecordOrUndef>;

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
        throw new BadRequestError('Session ID is required');
    }
    // Get the session and make sure it's associated with the user
    const chatSession = await getChatSession(user.userId, sessionId);
    if (!chatSession) {
        throw new UnauthorizedError('Unauthorized: chat session not found');
    }

    const messages = await getChatMessages(user.userId, sessionId);

    // TODO: Only return internal trace details if the user is an internal user.
    // if (user.userType != 'internal-user') {
    //     messages.forEach(m => {
    //         m.traces = m.traces?.filter(t => {
    //             return !t.orchestrationTrace?.invocationInput &&
    //                 !t.orchestrationTrace?.observation?.actionGroupInvocationOutput &&
    //                 !t.orchestrationTrace?.observation?.knowledgeBaseLookupOutput
    //         });
    //     })
    // }
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
        throw new BadRequestError('Session ID is required');
    }

    const body = event.body;
    if (!body || !body.message) {
        throw new BadRequestError('Message is required');
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
        throw new BadRequestError('Chat app ID is required');
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
        throw new BadRequestError('Session ID is required');
    }

    // Get the session and make sure it's associated with the user
    const chatSession = await getChatSession(user.userId, sessionId);
    if (!chatSession) {
        throw new UnauthorizedError('Unauthorized: chat session not found');
    }

    const titleUpdateRequest = event.body;

    return await updateSessionTitle(sessionId, user.userId, titleUpdateRequest);
}

/**
 * POST:/api/chat/feedback
 */
async function handleAddFeedback(event: APIGatewayProxyEventPika<AddChatSessionFeedbackRequest>, user: ChatUser): Promise<AddChatSessionFeedbackResponse> {
    const request = event.body as AddChatSessionFeedbackRequest;
    if (!request) {
        throw new BadRequestError('Feedback is required');
    }

    if (typeof request !== 'object') {
        throw new BadRequestError('Feedback must be an object');
    }

    if (!('feedback' in request)) {
        throw new BadRequestError('Feedback is required');
    }

    if (typeof request.feedback !== 'object') {
        throw new BadRequestError('Feedback must be an object');
    }

    if (!('feedbackId' in request.feedback)) {
        throw new BadRequestError('Feedback ID is required and must be a V7 UUID');
    }

    if (!('sessionId' in request.feedback)) {
        throw new BadRequestError('Session ID is required');
    }
    return {
        success: true,
        feedback: await addChatSessionFeedback(request.feedback, user.userId)
    };
}

/**
 * GET:/api/chat/feedback/{sessionId}
 *
 * This gets the feedback directly from the chat session feedback table in dynamodb. This is used by the chat apps themsvelves and NOT
 * by the admin site.  The admin site gets these from opensearch which stores them directly on the chat sessions.
 */
async function handleGetFeedbackBySessionId(event: APIGatewayProxyEventPika<BaseRequestData>, user: ChatUser): Promise<GetChatSessionFeedbackResponse> {
    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) {
        throw new BadRequestError('Session ID is required');
    }

    return {
        success: true,
        feedback: await getChatSessionFeedback(sessionId)
    };
}

/**
 * POST:/api/chat/tagdef/search
 */
async function handleGetTagDefs(event: APIGatewayProxyEventPika<TagDefinitionSearchRequest>, userId: string): Promise<TagDefinitionSearchResponse> {
    const request = event.body || {};

    // Non-admin API filters out disabled tag definitions
    return await searchTagDefsApi(request);
}

/**
 * POST:/api/chat-admin/memory/record/search
 *
 * Returns all memory records for a user for a given strategy, paged.
 */
async function handleSearchAllMemoryRecords(event: APIGatewayProxyEventPika<SearchAllMyMemoryRecordsRequest>, userId: string): Promise<SearchAllMyMemoryRecordsResponse> {
    const requestBody = event.body;
    if (!requestBody) {
        throw new BadRequestError('Request body is required');
    }

    if (!requestBody.strategy) {
        throw new BadRequestError('strategy is required');
    }

    if (!UserMemoryStrategies.includes(requestBody.strategy)) {
        throw new BadRequestError(`Invalid strategy: ${requestBody.strategy}`);
    }
    let response: SearchAllMyMemoryRecordsResponse = {
        success: true,
        results: {
            records: [],
            nextToken: undefined
        }
    };

    response.results = await getAllMemoryRecords(userId, getMemoryId(), requestBody.strategy, requestBody.nextToken);

    return response;
}

// ===== SHARING SESSIONS FEATURE API HANDLERS =====

async function handleCreateSharedSession(event: APIGatewayProxyEventPika<CreateSharedSessionRequest>, user: ChatUser<RecordOrUndef>): Promise<CreateSharedSessionResponse> {
    const request = event.body;
    if (!request) {
        throw new BadRequestError('Request body is required');
    }

    return await createSharedSessionForSession(user, request);
}

async function handleRevokeSharedSession(event: APIGatewayProxyEventPika<RevokeSharedSessionRequest>, userId: string): Promise<RevokeSharedSessionResponse> {
    const request = event.body;
    if (!request?.shareId) {
        throw new BadRequestError('shareId is required');
    }

    const session = await getChatSessionByShareId(request.shareId);
    if (!session) {
        throw new HttpStatusError('Shared session not found', 404);
    }

    // Allow both session owner and share creator to revoke
    if (session.userId !== userId && session.shareCreatedByUserId !== userId) {
        throw new ForbiddenError('Not authorized to revoke this shared session');
    }

    await revokeSharedSessionApi(request.shareId);
    return { success: true };
}

async function handleUnrevokeSharedSession(event: APIGatewayProxyEventPika<UnrevokeSharedSessionRequest>, userId: string): Promise<UnrevokeSharedSessionResponse> {
    const request = event.body;
    if (!request?.shareId) {
        throw new BadRequestError('shareId is required');
    }

    const session = await getChatSessionByShareId(request.shareId);
    if (!session) {
        throw new HttpStatusError('Shared session not found', 404);
    }

    // Allow both session owner and share creator to unrevoke
    if (session.userId !== userId && session.shareCreatedByUserId !== userId) {
        throw new ForbiddenError('Not authorized to unrevoke this shared session');
    }

    await unrevokeSharedSessionApi(request.shareId);
    return { success: true };
}

async function handleGetRecentSharedSessions(event: APIGatewayProxyEventPika<GetRecentSharedRequest>, userId: string): Promise<GetRecentSharedResponse> {
    const request = event.body;
    if (!request?.chatAppId) {
        throw new BadRequestError('chatAppId is required');
    }

    const sessions = await getRecentSharedSessionsForUser(userId, request.chatAppId, request.limit || 5);
    return {
        success: true,
        recentShared: sessions
    };
}

async function handleGetPinnedSessions(event: APIGatewayProxyEventPika<GetPinnedSessionsRequest>, userId: string): Promise<GetPinnedSessionsResponse> {
    const request = event.body;
    if (!request?.chatAppId) {
        throw new BadRequestError('chatAppId is required');
    }

    const result = await getPinnedSessionsForUser(userId, request.chatAppId, request.limit || 20, request.nextToken);

    return {
        success: true,
        results: result.results,
        nextToken: result.nextToken
    };
}

async function handleValidateShareAccess(event: APIGatewayProxyEventPika<ValidateShareAccessRequest>, user: ChatUser<RecordOrUndef>): Promise<ValidateShareAccessResponse> {
    const request = event.body;
    if (!request?.shareId || !request?.chatAppId) {
        throw new BadRequestError('shareId and chatAppId are required');
    }

    return await validateUserCanAccessShare(request.shareId, request.chatAppId, user.userType || 'external-user', request.entityId);
}

async function handleRecordShareVisitApi(event: APIGatewayProxyEventPika<RecordShareVisitRequest>, userId: string): Promise<RecordShareVisitResponse> {
    const request = event.body;
    if (!request?.shareId) {
        throw new BadRequestError('shareId is required');
    }

    // Get user data for custom data
    const user = await getUserByUserId(userId);
    await handleRecordShareVisit(userId, request.shareId, user?.customData);

    return { success: true };
}

async function handlePinSessionApi(event: APIGatewayProxyEventPika<PinSessionRequest>, userId: string): Promise<PinSessionResponse> {
    const request = event.body;
    if (!request) {
        throw new BadRequestError('Request body is required');
    }

    await handlePinSession(userId, request);
    return { success: true };
}

async function handleUnpinSessionApi(event: APIGatewayProxyEventPika<UnpinSessionRequest>, userId: string): Promise<UnpinSessionResponse> {
    const request = event.body;
    if (!request) {
        throw new BadRequestError('Request body is required');
    }

    await handleUnpinSession(userId, request);
    return { success: true };
}

export const handler = apiGatewayFunctionDecorator(handlerFn);
