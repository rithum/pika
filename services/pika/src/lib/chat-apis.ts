/**
 * These are server-side APIs that are called by the browser client.
 *
 * They each assume that the user is already authenticated and the user object
 * was extracted from the request object, probably using a JSON Web Token (JWT)
 * or something to validate they are legit and allowed to access this functionality.
 */

import type {
    BaseRequestData,
    ChatApp,
    ChatMessage,
    ChatMessageForCreate,
    ChatSession,
    ChatSessionFeedback,
    ChatSessionFeedbackForCreate,
    ChatSessionForCreate,
    ChatSessionResponse,
    ChatTitleUpdateRequest,
    ChatUser,
    ChatUserLite,
    ConverseInvocationMode,
    ConverseSource,
    CreateSharedSessionRequest,
    CreateSharedSessionResponse,
    PinnedObjAndChatSession,
    PinSessionRequest,
    RecordOrUndef,
    SharedSessionVisitHistory,
    SimpleAuthenticatedUser,
    TagDefinitionSearchRequest,
    TagDefinitionSearchResponse,
    UnpinSessionRequest,
    UserPrefs,
    ValidateShareAccessResponse
} from 'pika-shared/types/chatbot/chatbot-types';
import { BadRequestError } from 'pika-shared/util/bad-request-error';
import { HttpStatusError } from 'pika-shared/util/http-status-error';
import { UnauthorizedError } from 'pika-shared/util/unauthorized-error';
import { v7 as uuidv7 } from 'uuid';
import { getTitleFromBedrockIfNeeded } from './bedrock-agent';
import { getChatApp } from './chat-admin-apis';
import { searchTagDefinitions } from './chat-admin-ddb';
import {
    addChatSession,
    addFeedback,
    addMessage,
    batchGetChatSessionsByPrimaryKey,
    batchGetChatSessionsByShareId,
    deleteMockSessionDdb,
    getChatMessagesInSession,
    getChatSessionByShareId,
    getChatSessionByUserIdAndSessionId,
    getFeedbackBySessionId,
    getPinnedSessions,
    getRecentSharedSessionHistory,
    getSessionsByUserIdAndChatAppId,
    getUserByUserId,
    getUserPrefsByUserId,
    getUserSessionsByUserId,
    markSessionAsShared,
    pinSession,
    recordSharedSessionVisit,
    revokeSharedSession,
    searchForUsersByPartialUserId,
    setUserPrefsForUser,
    unpinSession,
    unrevokeSharedSession,
    updateSession,
    updateSessionTitleInDdb
} from './chat-ddb';
import { getMatchingChatApps } from './get-matching-chat-apps';
import { createSessionToken, getNextMessageId, validateUserCanAccessSession } from './utils';

/**
 * Get all chat messages for a session.
 */
export function getChatMessages(userId: string, sessionId: string) {
    return getChatMessagesInSession(userId, sessionId);
}

/**
 * Get all chat sessions for a user.  This is used to display a list of sessions
 * to the user so they can select one.
 */
export async function getUserSessions(userId: string): Promise<ChatSession<RecordOrUndef>[]> {
    return await getUserSessionsByUserId(userId);
}

export async function getUserSessionsByChatAppId(userId: string, chatAppId: string): Promise<ChatSession<RecordOrUndef>[]> {
    return await getSessionsByUserIdAndChatAppId(userId, chatAppId);
}

/**
 * Get a user by their user id.
 */
export async function getUser(userId: string): Promise<ChatUser | undefined> {
    return await getUserByUserId(userId);
}

export async function getUserPrefs(userId: string): Promise<UserPrefs | undefined> {
    return await getUserPrefsByUserId(userId);
}

export async function setUserPrefs(userId: string, prefs: UserPrefs, partial: boolean): Promise<UserPrefs> {
    let prefsToSet = prefs;
    if (partial) {
        const existingPrefs = (await getUserPrefs(userId)) ?? {};

        // Remove any prefs that are set to null.
        Object.keys(existingPrefs).forEach((key) => {
            if (prefs[key] === null) {
                delete prefs[key];
                delete existingPrefs[key];
            }
        });

        prefsToSet = { ...existingPrefs, ...prefs };
    }

    await setUserPrefsForUser(userId, prefsToSet);
    return prefsToSet;
}

/**
 * Search for users by partial user id.  This is used to autocomplete the user id field.  If
 * partialUserId isn't at least 3 characters, we will return an empty list.
 *
 * @param partialUserId The partial user id to search for.
 * @returns A list of users that match the partial user id.
 */
export async function searchForUsers(partialUserId: string): Promise<ChatUserLite[]> {
    if (partialUserId.length < 3) {
        return [];
    }
    return await searchForUsersByPartialUserId(partialUserId);
}

/**
 * Get the session for this user and sessionId from the db if present, otherwise
 * create a new session and return that.
 *
 * @returns A tuple with the chat session object and a boolean indicating if it was newly created
 */
export async function ensureChatSession(
    user: ChatUser<RecordOrUndef>,
    requestData: BaseRequestData,
    agentId: string,
    chatAppId: string,
    simpleUser: SimpleAuthenticatedUser<RecordOrUndef>,
    invocationMode: ConverseInvocationMode,
    entityEnabled: boolean,
    entityValue: string | undefined,
    source: ConverseSource
): Promise<[ChatSession<RecordOrUndef>, boolean]> {
    console.log('ensureChatSession called with:', {
        userId: user.userId,
        sessionId: requestData.sessionId,
        agentId,
        chatAppId,
        simpleUser,
        invocationMode,
        entityEnabled,
        entityValue
    });

    let isNewSession = false;
    let chatSession: ChatSession<RecordOrUndef> | undefined = requestData.sessionId ? await getChatSession(user.userId, requestData.sessionId) : undefined;

    console.log('Existing session lookup result:', {
        found: !!chatSession,
        sessionId: requestData.sessionId
    });

    if (!chatSession) {
        console.log('No existing session found, creating new session');

        chatSession = await createChatSession({
            userId: user.userId,
            chatAppId,
            agentId, //'weather-agent',//requestData.agentId ?? getAgentId(),
            invocationMode,
            source,
            sessionAttributes: {
                ...(user.customData ? user.customData : {}),
                ...(simpleUser.customUserData ? simpleUser.customUserData : {}),
                firstName: user.firstName,
                lastName: user.lastName,
                timezone: requestData.timezone,
                agentId,
                chatAppId,
                currentDate: new Date().toISOString(),
                userId: user.userId
            },
            identityId: user.userId,
            entityId: entityEnabled && entityValue ? entityValue : 'chat-app-global'
        });

        console.log('New session created:', {
            sessionId: chatSession.sessionId,
            userId: chatSession.userId,
            chatAppId: chatSession.chatAppId,
            agentId: chatSession.agentId,
            entityId: chatSession.entityId
        });

        isNewSession = true;
    }

    console.log('Returning session:', {
        sessionId: chatSession.sessionId,
        isNewSession,
        lastUpdate: chatSession.lastUpdate
    });

    return [chatSession, isNewSession];
}

/**
 * Creates a new chat session for a user.  The token is a hash of the session id,
 * company id, and user id.  This allows us to verify that the session is valid
 * and belongs to the user.
 */
export async function createChatSession(chatSessionForCreate: ChatSessionForCreate): Promise<ChatSession<RecordOrUndef>> {
    let sessionId = uuidv7();
    const token = createSessionToken(sessionId, chatSessionForCreate.userId);
    const date = new Date().toISOString();
    const chatSession: ChatSession = {
        ...chatSessionForCreate,
        sessionId,
        sessionAttributes: {
            ...chatSessionForCreate.sessionAttributes,
            token
        },
        inputTokens: 0,
        outputTokens: 0,
        createDate: date,
        lastUpdate: date
    };
    await addChatSession(chatSession);
    return chatSession;
}

export async function deleteMockSession(sessionId: string, sessionUserId: string): Promise<void> {
    await deleteMockSessionDdb(sessionId, sessionUserId);
}

/**
 * Get a chat session by user id and session id.  This is used to verify that the
 * session is valid and belongs to the user.
 */
export async function getChatSession(userId: string, sessionId: string): Promise<ChatSession<RecordOrUndef> | undefined> {
    const chatSession = await getChatSessionByUserIdAndSessionId(userId, sessionId);
    if (chatSession) {
        validateUserAgainstSession(chatSession, userId, sessionId);
    }
    return chatSession;
}

/**
 * Add a chat message to the database and update the session with the new message id and update timestamp
 * and usage stats.
 *
 * If the chatSession is not provided, we will fetch it from the database.
 *
 * If the userQuestionAsked and answerToQuestionFromAgent are provided, we will also update the session title
 * using Bedrock to generate a title.
 */
export async function addChatMessage(
    chatMessageForCreate: ChatMessageForCreate,
    chatSession?: ChatSession<RecordOrUndef>,
    userQuestionAsked?: string,
    answerToQuestionFromAgent?: string
): Promise<ChatMessage> {
    console.log('addChatMessage called with:', {
        sessionId: chatMessageForCreate.sessionId,
        userId: chatMessageForCreate.userId,
        source: chatMessageForCreate.source,
        hasChatSession: !!chatSession,
        hasUserQuestion: !!userQuestionAsked,
        hasAgentAnswer: !!answerToQuestionFromAgent
    });

    if (!chatSession) {
        console.log('No chat session provided, fetching from database');
        chatSession = await getChatSession(chatMessageForCreate.userId, chatMessageForCreate.sessionId);
        console.log('Fetched chat session:', {
            found: !!chatSession,
            sessionId: chatMessageForCreate.sessionId
        });
    }
    if (!chatSession) {
        console.error('Chat session not found:', {
            sessionId: chatMessageForCreate.sessionId,
            userId: chatMessageForCreate.userId
        });
        throw new UnauthorizedError(`Unauthorized: chat session not found: ${chatMessageForCreate.sessionId}`);
    }

    console.log('Validating user against session');
    if (chatMessageForCreate.userId !== 'assistant') {
        // Only validate the user against the session if the user is not the assistant adding the message
        validateUserAgainstSession(chatSession, chatMessageForCreate.userId, chatMessageForCreate.sessionId);
    }

    const chatMessage: ChatMessage = {
        ...chatMessageForCreate,
        messageId: getNextMessageId(chatSession.sessionId, chatSession.lastMessageId),
        timestamp: new Date().toISOString()
    };

    console.log('Created chat message:', {
        messageId: chatMessage.messageId,
        timestamp: chatMessage.timestamp,
        lastMessageId: chatSession.lastMessageId
    });

    console.log('Adding message and updating session in parallel');
    await Promise.all([
        addMessage(chatMessage),
        updateSession(chatMessage.sessionId, chatSession.userId, chatMessage.messageId, chatMessage.timestamp, chatMessage.usage, chatSession.chatAppId, chatSession.source)
    ]);
    console.log('Message added and session updated');

    // Update the local object with the new message id and update timestamp
    chatSession.lastMessageId = chatMessage.messageId;
    chatSession.lastUpdate = chatMessage.timestamp;
    console.log('Local session object updated:', {
        lastMessageId: chatSession.lastMessageId,
        lastUpdate: chatSession.lastUpdate
    });

    if (userQuestionAsked && answerToQuestionFromAgent && chatSession.title == null) {
        console.log('Updating session title with Bedrock');
        // Use bedrock to generate a title for the session and update the session title in the database
        await updateSessionTitle(chatMessageForCreate.sessionId, chatMessageForCreate.userId, {
            userId: chatMessageForCreate.userId,
            userQuestionAsked: userQuestionAsked,
            answerToQuestionFromAgent: answerToQuestionFromAgent
        });
        console.log('Session title updated');
    }

    console.log('Returning chat message:', {
        messageId: chatMessage.messageId,
        timestamp: chatMessage.timestamp,
        source: chatMessage.source
    });
    return chatMessage;
}

/**
 * Validate the user against the session.  This is used to ensure that the user is allowed to access the session.
 * If sessionId is provided, then if it doesn't match the session id in the session object, throw an error.
 * @param session The session to validate the user against.
 * @param userId The user id to validate against the session.
 * @param sessionId The session id to ensure matches the session object.
 */
export function validateUserAgainstSession(session: ChatSession<RecordOrUndef>, userId: string, sessionId?: string) {
    if (sessionId && session.sessionId !== sessionId) {
        throw new UnauthorizedError(`Unauthorized: session id mismatch: ${sessionId} !== ${session.sessionId}`);
    }
    if (userId && session.userId !== userId) {
        throw new UnauthorizedError(`Unauthorized: user id mismatch: ${userId} !== ${session.userId}`);
    }
}

/**
 * Update the session title using either the title provided in the request or by
 * generating a title using Bedrock if the userQuestionAsked and answerToQuestionFromAgent
 * are provided.  One or the other must be provided (title or userQuestionAsked and answerToQuestionFromAgent).
 */
export async function updateSessionTitle(sessionId: string, userId: string, request: ChatTitleUpdateRequest): Promise<ChatSessionResponse> {
    let title = request.title;
    if (!title) {
        if (!request.userQuestionAsked || !request.answerToQuestionFromAgent) {
            throw new BadRequestError('Missing required userQuestionAsked and answerToQuestionFromAgent parameters');
        }
        title = await getTitleFromBedrockIfNeeded(request.userQuestionAsked, request.answerToQuestionFromAgent);
        if (!title) {
            throw new HttpStatusError(
                `Failed to generate title using Bedrock for user question: ${request.userQuestionAsked} and answer: ${request.answerToQuestionFromAgent}`,
                500
            );
        }
    }
    const session = await updateSessionTitleInDdb(sessionId, userId, title);
    return {
        success: true,
        session
    };
}

export async function addChatSessionFeedback(feedback: ChatSessionFeedbackForCreate, userId: string): Promise<ChatSessionFeedback> {
    let now = new Date().toISOString();

    const feedbackToReturn: ChatSessionFeedback = {
        ...feedback,
        userId,
        createdOn: now,
        updatedOn: now
    };

    await addFeedback(feedbackToReturn);
    return feedbackToReturn;
}

export async function getChatSessionFeedback(sessionId: string): Promise<ChatSessionFeedback[]> {
    //TODO: do we need to check if the user is the one who created the feedback?
    return await getFeedbackBySessionId(sessionId);
}

/**
 * Search for tag definitions with optional filtering and pagination
 */
export async function searchTagDefsApi(request: TagDefinitionSearchRequest): Promise<TagDefinitionSearchResponse> {
    let [tagDefinitions, paginationToken] = await searchTagDefinitions(request, false);

    return {
        success: true,
        tagDefinitions,
        paginationToken
    };
}

// ===== SHARING SESSIONS FEATURE BUSINESS LOGIC =====

export async function createSharedSessionForSession(user: ChatUser<RecordOrUndef>, request: CreateSharedSessionRequest): Promise<CreateSharedSessionResponse> {
    // Validate session ownership
    const session = await getChatSessionByUserIdAndSessionId(request.sessionUserId, request.sessionId);
    if (!session) {
        throw new HttpStatusError('Session not found', 404);
    }

    if (request.chatAppId !== session.chatAppId) {
        throw new HttpStatusError('Chat app id mismatch', 400);
    }

    if (session.shareId) {
        throw new HttpStatusError('Session is already shared', 400);
    }

    // Prevent sharing of direct agent invocation sessions
    if (session.chatAppId.startsWith('direct-agent-')) {
        throw new HttpStatusError('Cannot share direct agent invocation sessions', 400);
    }

    // If the user creating the share isn't the owner of the session, then the user must be an internal user
    // or throw an error.  If the user is an internal user, then we use the chat app entity setting to determine
    // whether we should scope the shared session to the creator of the shared session's entity ID or not.

    // If the user is an internal user, then we use the chat app entity setting to determine
    // whether we should scope the shared session to the creator of the shared session's entity ID or not.
    let chatApp: ChatApp | undefined;
    try {
        chatApp = await getChatApp(request.chatAppId);
        if (!chatApp) {
            throw new HttpStatusError('Chat app not found', 404);
        }
    } catch (e) {
        if (e instanceof Error && e.message.includes('404')) {
            throw new HttpStatusError('Chat app not found', 404);
        }
        throw e;
    }

    let userId = user.userId;
    let shareCreatedByUserId = user.userId;
    if (session.userId !== user.userId) {
        if (user.userType !== 'internal-user') {
            throw new HttpStatusError('Not authorized to share this session', 403);
        }

        // The internal user must have access to the chat app of the session or else we throw an error
        const matchingChatApps = getMatchingChatApps(user, false, [], [chatApp]);

        if (!matchingChatApps || matchingChatApps.length === 0) {
            throw new HttpStatusError('Not authorized to share this session', 403);
        }

        userId = session.userId;
    }

    // Generate shareId
    const shareId = uuidv7();

    // Mark the session as shared with all sharing info stored on the session itself
    await markSessionAsShared(request.sessionId, userId, shareId, shareCreatedByUserId);

    return {
        success: true,
        shareId,
        chatAppId: request.chatAppId
    };
}

export async function revokeSharedSessionApi(shareId: string): Promise<void> {
    await revokeSharedSession(shareId);
}

export async function unrevokeSharedSessionApi(shareId: string): Promise<void> {
    await unrevokeSharedSession(shareId);
}

export async function validateUserCanAccessShare(
    shareId: string,
    chatAppId: string,
    userType: 'internal-user' | 'external-user',
    userEntityId?: string
): Promise<ValidateShareAccessResponse> {
    // Get shared session using the new approach
    const sessionData = await getChatSessionByShareId(shareId);
    return validateUserCanAccessSession(sessionData, chatAppId, userType, userEntityId);
}

export async function handlePinSession(userId: string, request: PinSessionRequest): Promise<void> {
    await pinSession(userId, request.pinnedSession);
}

export async function handleUnpinSession(userId: string, request: UnpinSessionRequest): Promise<void> {
    await unpinSession(userId, request.chatAppId, request.sessionId, request.shareId);
}

export async function handleRecordShareVisit(userId: string, shareId: string, userCustomData?: any): Promise<void> {
    // Get share link to extract entity and chat app info
    const session = await getChatSessionByShareId(shareId);
    if (!session) {
        throw new HttpStatusError('Shared session not found', 404);
    }

    // If the user is the owner of the session, then we don't need to record the visit
    if (session.userId === userId) {
        return;
    }

    await recordSharedSessionVisit(userId, shareId, session.chatAppId, session.title ?? 'Untitled', session.entityId);
}

export async function getRecentSharedSessionsForUser(
    userId: string,
    chatAppId: string,
    limit: number,
    entityId?: string,
    nextTokenArg?: string
): Promise<[SharedSessionVisitHistory[], string | undefined]> {
    // Already filtered by chat app in the database query
    const sessionsToReturn: SharedSessionVisitHistory[] = [];
    let nextToken: string | undefined;
    do {
        // console.log('[DEBUG] getRecentSharedSessionsForUser getting sessions', {
        //     userId,
        //     chatAppId,
        //     limit,
        //     entityId,
        //     nextTokenArg
        // });
        let [sessions, token] = await getRecentSharedSessionHistory(userId, chatAppId, limit, nextTokenArg);
        nextToken = token;

        // console.log('[DEBUG] getRecentSharedSessionsForUser raw sessions', {
        //     sessions,
        // });

        // Filter out sessions that either aren't the special global entity or aren't the entity id specified
        sessions = sessions.filter((session) => session.entityId === 'chat-app-global' || session.entityId === entityId);

        // console.log('[DEBUG] getRecentSharedSessionsForUser after filtering', {
        //     sessions,
        //     entityId
        // });

        // Figure out how many more sessions we need to get to the limit and push that many more sessions to the list
        const sessionsToPush = limit - sessionsToReturn.length;
        // console.log('[DEBUG] getRecentSharedSessionsForUser sessionsToPush', {
        //     sessionsToPush,
        //     sessionsToReturn
        // });
        if (sessionsToPush > 0) {
            const sessionsArrToPush = sessions.slice(0, sessionsToPush);
            // console.log('[DEBUG] getRecentSharedSessionsForUser pushing sessions', {
            //     sessionsArrToPush,
            // });
            sessionsToReturn.push(...sessionsArrToPush);
        }
    } while (sessionsToReturn.length < limit && nextToken);

    return [sessionsToReturn, nextToken];
}

export async function getPinnedSessionsForUser(
    userId: string,
    chatAppId: string,
    limit: number = 20,
    nextToken?: string
): Promise<{ results: PinnedObjAndChatSession[]; nextToken?: string }> {
    // Get the pinned sessions first
    const pinnedResult = await getPinnedSessions(userId, chatAppId, limit, nextToken);

    if (pinnedResult.pinnedSessions.length === 0) {
        return { results: [], nextToken: pinnedResult.nextToken };
    }

    // Separate pinned sessions by type (sessionId vs shareId)
    const pinnedWithSessionId = pinnedResult.pinnedSessions.filter((p) => p.sessionId);
    const pinnedWithShareId = pinnedResult.pinnedSessions.filter((p) => p.shareId);

    // Prepare batch requests
    const sessionKeys = pinnedWithSessionId.map((p) => ({
        userId: p.userId,
        sessionId: p.sessionId!
    }));

    const shareIds = pinnedWithShareId.map((p) => p.shareId!);

    // Execute batch operations in parallel
    const [sessionsByPrimaryKey, sessionsByShareId] = await Promise.all([batchGetChatSessionsByPrimaryKey(sessionKeys), batchGetChatSessionsByShareId(shareIds)]);

    // Create lookup maps for efficient retrieval
    const sessionsByUserIdAndSessionId = new Map<string, ChatSession<RecordOrUndef>>();
    sessionsByPrimaryKey.forEach((session) => {
        const key = `${session.userId}:${session.sessionId}`;
        sessionsByUserIdAndSessionId.set(key, session);
    });

    const sessionsByShareIdMap = new Map<string, ChatSession<RecordOrUndef>>();
    sessionsByShareId.forEach((session) => {
        if (session.shareId) {
            sessionsByShareIdMap.set(session.shareId, session);
        }
    });

    // Build results, maintaining original pinned session ordering
    const results: PinnedObjAndChatSession[] = [];

    for (const pinnedSession of pinnedResult.pinnedSessions) {
        let chatSession: ChatSession<RecordOrUndef> | undefined;

        if (pinnedSession.sessionId) {
            // Look up by primary key
            const key = `${pinnedSession.userId}:${pinnedSession.sessionId}`;
            chatSession = sessionsByUserIdAndSessionId.get(key);
        } else if (pinnedSession.shareId) {
            // Look up by shareId
            chatSession = sessionsByShareIdMap.get(pinnedSession.shareId);
        }

        // Only include if we found the associated chat session
        if (chatSession) {
            results.push({
                pinnedSession,
                chatSession
            });
        } else {
            // Log warning about missing session but don't fail
            console.warn(`Failed to find chat session for pinned item:`, {
                sessionId: pinnedSession.sessionId,
                shareId: pinnedSession.shareId,
                userId: pinnedSession.userId,
                chatAppId: pinnedSession.chatAppId
            });
        }
    }

    return {
        results,
        nextToken: pinnedResult.nextToken
    };
}
