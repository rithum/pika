/**
 * These are server-side APIs that are called by the browser client.
 *
 * They each assume that the user is already authenticated and the user object
 * was extracted from the request object, probably using a JSON Web Token (JWT)
 * or something to validate they are legit and allowed to access this functionality.
 */

//TODO: how do we create a first session with first message?

import type { ChatMessage, ChatMessageForCreate, ChatSession, ChatSessionForCreate, ChatSessionResponse, ChatTitleUpdateRequest, ChatUser } from '@pika/shared/types/chatbot/chatbot-types';
import { BaseRequestData } from '@pika/shared/types/chatbot/chatbot-types';
import { v7 as uuidv7 } from 'uuid';
import { getTitleFromBedrockIfNeeded } from './bedrock-agent';
import { addChatSession, addMessage, getChatMessagesInSession, getChatSessionByUserIdAndSessionId, getUserByUserId, getUserSessionsByUserId, updateSession, updateSessionTitleInDdb, getSessionsByUserIdAndChatAppId } from './chat-ddb';
import { UnauthorizedError } from './unauthorized-error';
import { createSessionToken, getNextMessageId } from './utils';

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
export async function getUserSessions(userId: string): Promise<ChatSession[]> {
    return await getUserSessionsByUserId(userId);
}

export async function getUserSessionsByChatAppId(userId: string, chatAppId: string): Promise<ChatSession[]> {
    return await getSessionsByUserIdAndChatAppId(userId, chatAppId);
}

/**
 * Get a user by their user id.
 */
export async function getUser(userId: string): Promise<ChatUser | undefined> {
    return await getUserByUserId(userId);
}

/**
 * Get the session for this user and sessionId from the db if present, otherwise
 * create a new session and return that.
 *
 * @returns A tuple with the chat session object and a boolean indicating if it was newly created
 */
export async function ensureChatSession(user: ChatUser, requestData: BaseRequestData, agentId: string, chatAppId: string): Promise<[ChatSession, boolean]> {
    console.log('ensureChatSession called with:', {
        userId: user.userId,
        sessionId: requestData.sessionId,
        companyId: requestData.companyId,
        companyType: requestData.companyType,
        agentId,
        chatAppId
    });

    let isNewSession = false;
    let chatSession: ChatSession | undefined = requestData.sessionId ?
        await getChatSession(user.userId, requestData.sessionId) :
        undefined;

    console.log('Existing session lookup result:', {
        found: !!chatSession,
        sessionId: requestData.sessionId
    });

    if (!chatSession) {
        console.log('No existing session found, creating new session');
        const companyId = requestData.companyId ?? user.companyId;
        const companyType = requestData.companyType ?? user.companyType;

        console.log('Using company info:', {
            companyId,
            companyType,
            fromRequest: {
                companyId: requestData.companyId,
                companyType: requestData.companyType
            },
            fromUser: {
                companyId: user.companyId,
                companyType: user.companyType
            }
        });

        chatSession = await createChatSession({
            userId: user.userId,
            chatAppId,
            agentId, //'weather-agent',//requestData.agentId ?? getAgentId(),
            agentAliasId: agentId, //'weather-agent-alias',//requestData.agentAliasId ?? getAgentAliasId(),
            sessionAttributes: {
                companyId,
                companyType,
                firstName: user.firstName,
                lastName: user.lastName,
                timezone: requestData.timezone
            },
            identityId: user.userId
        });

        console.log('New session created:', {
            sessionId: chatSession.sessionId,
            userId: chatSession.userId,
            chatAppId: chatSession.chatAppId,
            agentId: chatSession.agentId,
            agentAliasId: chatSession.agentAliasId
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
export async function createChatSession(chatSessionForCreate: ChatSessionForCreate): Promise<ChatSession> {
    let sessionId = uuidv7();
    const token = createSessionToken(sessionId, chatSessionForCreate.sessionAttributes.companyId, chatSessionForCreate.userId);
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

/**
 * Get a chat session by user id and session id.  This is used to verify that the
 * session is valid and belongs to the user.
 */
export async function getChatSession(userId: string, sessionId: string): Promise<ChatSession | undefined> {
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
export async function addChatMessage(chatMessageForCreate: ChatMessageForCreate, chatSession?: ChatSession, userQuestionAsked?: string, answerToQuestionFromAgent?: string): Promise<ChatMessage> {
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
        updateSession(chatMessage.sessionId, chatSession.userId, chatMessage.messageId, chatMessage.timestamp, chatMessage.usage)
    ]);
    console.log('Message added and session updated');

    // Update the local object with the new message id and update timestamp
    chatSession.lastMessageId = chatMessage.messageId;
    chatSession.lastUpdate = chatMessage.timestamp;
    console.log('Local session object updated:', {
        lastMessageId: chatSession.lastMessageId,
        lastUpdate: chatSession.lastUpdate
    });

    if (userQuestionAsked && answerToQuestionFromAgent) {
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
export function validateUserAgainstSession(session: ChatSession, userId: string, sessionId?: string) {
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
            throw new Error('Missing required userQuestionAsked and answerToQuestionFromAgent parameters');
        }
        title = await getTitleFromBedrockIfNeeded(request.userQuestionAsked, request.answerToQuestionFromAgent);
        if (!title) {
            throw new Error(`Failed to generate title using Bedrock for user question: ${request.userQuestionAsked} and answer: ${request.answerToQuestionFromAgent}`);
        }
    }
    const session = await updateSessionTitleInDdb(sessionId, userId, title);
    return {
        success: true,
        session
    };
}