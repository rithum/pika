import {
    AgentAndTools,
    AgentDefinition,
    ChatMessage,
    ChatMessageFile,
    ChatMessageForCreate,
    ChatSession,
    ChatUser,
    ConverseRequest,
    SimpleAuthenticatedUser
} from '@pika/shared/types/chatbot/chatbot-types';
import { convertFunctionUrlEventToStandardApiGatewayEvent, LambdaFunctionUrlProxyEventPika } from '@pika/shared/util/api-gateway-utils';
import { ConversationHistory, ConversationRole } from '@aws-sdk/client-bedrock-agent-runtime';
import { invokeAgentToGetAnswer } from '../../lib/bedrock-agent';
import { addChatMessage, ensureChatSession, getChatMessages, getUser } from '../../lib/chat-apis';
import { UnauthorizedError } from '../../lib/unauthorized-error';
import { EnhancedResponseStream } from './EnhancedResponseStream';
import { enhancedStreamifyResponse } from './custom-stream';
import { getValueFromParameterStore } from '../../lib/ssm';
import { getUserFromAuthHeader } from '../../lib/jwt';
import { LRUCache } from 'lru-cache';
import { getAgentAndTools } from '../../lib/chat-admin-apis';
import { HttpStatusError } from '@pika/shared/util/http-status-error';
import { redactData } from '@pika/shared/util/server-client-utils';

const SESSION_TIMEOUT_MS = 1000 * 60 * 10; // 10 minutes
const TIMEOUT_AFTER_MS = SESSION_TIMEOUT_MS * 0.9; // Timeout 90% of the way through the session

// This variable is stored in the lamdbda context and will survive across invocations so we
// only need to get it once until the lambda is restarted
let jwtSecret: string | undefined;

// We are creating this out here so it can be used across invocations since it is stored in the lambda context
const lruCache = new LRUCache({
    max: 100,
    maxSize: 50000,
    ttl: 1000 * 60 * 5, // 5 minutes
    ttlAutopurge: true,
    sizeCalculation: (value, key) => {
        return 1;
    }
});

/**
 * This is a handler for a lambda function that is used to stream a conversation to the client.
 * It is decorated with the enhancedStreamifyResponse decorator which is a wrapper around the lambda-stream library.
 * This allows us to know when the stream has been written to and to handle errors properly.
 */
export const handler = enhancedStreamifyResponse(async (fnUrlEvent: LambdaFunctionUrlProxyEventPika<ConverseRequest>, responseStream: EnhancedResponseStream, context) => {
    console.log('=== CONVERSE HANDLER START ===');
    console.log('Event:', JSON.stringify(fnUrlEvent, null, 2));
    console.log('Context:', {
        awsRequestId: context?.awsRequestId,
        functionName: context?.functionName,
        remainingTime: context?.getRemainingTimeInMillis ? context.getRemainingTimeInMillis() : undefined
    });

    if (!process.env.STAGE) {
        throw new Error('STAGE is not set in the environment variables');
    }

    if (!process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE) {
        throw new Error('PIKA_SERVICE_PROJ_NAME_KEBAB_CASE is not set in the environment variables');
    }

    if (!jwtSecret) {
        console.log('JWT secret not cached, fetching from SSM...');
        jwtSecret = await getValueFromParameterStore(`/stack/${process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE}/${process.env.STAGE}/jwt-secret`);
        console.log('JWT secret fetched:', !!jwtSecret);
    }

    try {
        if (!jwtSecret) {
            console.error('JWT secret not found in SSM');
            throw new Error('JWT secret not found in SSM');
        }

        const authHeader = fnUrlEvent.headers['x-chat-auth'];
        console.log('Auth header present:', !!authHeader);
        if (!authHeader) {
            throw new UnauthorizedError('Authorization header not found in HTTP header');
        }

        console.log('Validating JWT token...');
        const [simpleUser, error] = getUserFromAuthHeader<any>(authHeader, jwtSecret);
        console.log('JWT validation result:', {
            userFromHeader: typeof simpleUser === 'number' ? simpleUser : redactData(simpleUser, 'authData'),
            error
        });
        if (typeof simpleUser === 'number') {
            throw new UnauthorizedError(error ?? 'Unauthorized');
        }

        const uploadS3Bucket = process.env.UPLOAD_S3_BUCKET;
        if (!uploadS3Bucket) {
            throw new Error('UPLOAD_S3_BUCKET is not set');
        }

        // Easier to convert the event to a standard API Gateway event and not have to handle the different event types.
        console.log('Converting function URL event to standard API Gateway event...');
        const event = convertFunctionUrlEventToStandardApiGatewayEvent<ConverseRequest>(fnUrlEvent);
        console.log('Event converted successfully');

        //TODO: check for chatbot_enabled feature flag set for this companyId and if not set, return a 404
        const chatbotEnabled = true;
        if (!chatbotEnabled) {
            // TODO: Implement proper formatResponse or use responseStream
            throw new UnauthorizedError('Chatbot is not enabled for this company');
        }

        // event.body was already parsed by the convertFunctionUrlEventToStandardApiGatewayEvent function
        let converseRequest: ConverseRequest = event.body;
        console.log('Converse request:', {
            hasMessage: !!converseRequest.message,
            messageLength: converseRequest.message?.length,
            userId: converseRequest.userId,
            sessionId: converseRequest.sessionId,
            companyId: converseRequest.companyId,
            companyType: converseRequest.companyType,
            agentId: converseRequest.agentId,
            chatAppId: converseRequest.chatAppId
        });

        if (!converseRequest.message) {
            throw new Error('message is required');
        }

        if (simpleUser.userId !== converseRequest.userId) {
            console.error('User ID mismatch:', { jwtUserId: simpleUser.userId, requestUserId: converseRequest.userId });
            throw new UnauthorizedError('User ID mismatch');
        }

        // Make sure the CHAT_ADMIN_API_ARN is set in the environment variables
        const chatAdminApiId = process.env.CHAT_ADMIN_API_ID;
        if (!chatAdminApiId) {
            throw new Error('CHAT_ADMIN_API_ID is not set');
        }

        // Any files passed in on the message must be in the s3 bucket set aside for uploading/sharing files or we error out.
        // This is necessary since bedrock and downstream tools are only known to have access to that bucket.
        if (converseRequest.files && converseRequest.files.length > 0) {
            for (const file of converseRequest.files) {
                if (file.locationType === 's3' && file.s3Bucket !== uploadS3Bucket) {
                    throw new Error(`Invalid file location: ${file.s3Bucket} is not the same as the upload bucket: ${uploadS3Bucket}`);
                }
            }
        }

        console.log('Fetching user data...');
        const user = await getUser(converseRequest.userId);
        console.log('User fetched:', { userId: user?.userId, companyId: user?.companyId, companyType: user?.companyType });
        if (!user) {
            throw new UnauthorizedError('User not found');
        }

        if (converseRequest.companyId && converseRequest.companyId !== user.companyId) {
            console.error('Company ID mismatch:', { userCompanyId: user.companyId, requestCompanyId: converseRequest.companyId });
            throw new UnauthorizedError('Unauthorized: companyId mismatch');
        }

        if (converseRequest.companyType && converseRequest.companyType !== user.companyType) {
            console.error('Company type mismatch:', { userCompanyType: user.companyType, requestCompanyType: converseRequest.companyType });
            throw new UnauthorizedError('Unauthorized: companyType mismatch');
        }

        if (!converseRequest.agentId) {
            console.error('Missing agentId in request');
            throw new HttpStatusError('agentId is required', 400);
        }

        if (!converseRequest.chatAppId) {
            console.error('Missing chatAppId in request');
            throw new HttpStatusError('chatAppId is required', 400);
        }

        console.log('Ensuring chat session...');
        const [chatSession, isNewSession] = await ensureChatSession(user, converseRequest, converseRequest.agentId, converseRequest.chatAppId);
        console.log('Chat session ensured:', {
            sessionId: chatSession.sessionId,
            isNewSession,
            lastUpdate: chatSession.lastUpdate
        });

        const agentAndTools = await getAgentAndToolsFromDbOrCache(converseRequest.agentId);
        console.log('Agent and tools fetched:', agentAndTools);

        agentAndTools.tools = !!agentAndTools.tools ? agentAndTools.tools : [];

        console.log('Starting conversation...');
        await converse(chatSession, isNewSession, user, simpleUser, converseRequest.message, responseStream, agentAndTools, converseRequest.files);
        console.log('Conversation completed successfully');
    } catch (e) {
        console.error('=== CONVERSE HANDLER ERROR ===');
        console.error('Unexpected error:', {
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
            name: e instanceof Error ? e.name : undefined,
            requestId: context?.awsRequestId,
            functionName: context?.functionName,
            remainingTime: context?.getRemainingTimeInMillis ? context.getRemainingTimeInMillis() : undefined
        });
        if (!responseStream.hasWritten) {
            console.log('Response stream has not been written to, handling error...');
            responseStream.handleError(e);
        } else {
            console.log('Response stream already written to, cannot handle error');
        }
    } finally {
        console.log('=== CONVERSE HANDLER END ===');
        responseStream.end();
    }
});

async function getAgentAndToolsFromDbOrCache(agentId: string): Promise<AgentAndTools> {
    let result = lruCache.get(agentId) as AgentAndTools | undefined;
    if (result) {
        return result;
    }

    result = await getAgentAndTools(agentId);
    if (!result) {
        throw new Error(`Agent definition not found for agentId: ${agentId}`);
    }
    if (!result.agent.dontCacheThis) {
        lruCache.set(agentId, result);
    }
    return result;
}

/**
 * This function is used to converse with the user.
 * It will add the user's message to the chat session and then invoke the agent to get the answer.
 * It will then add the assistant's message to the chat session and stream the response to the client.
 *
 * If this is the first message or we are having to reattach to a session, we will get any user instructions
 * and prepend them to the first message to send to the agent.
 *
 * @param chatSession The chat session to converse with.
 * @param isNewSession Whether the session is new.
 * @param user The user to converse with.
 * @param message The message to converse with.
 * @param responseStream The response stream to stream the response to.
 */
async function converse(
    chatSession: ChatSession,
    isNewSession: boolean,
    user: ChatUser,
    simpleUser: SimpleAuthenticatedUser<any>,
    message: string,
    responseStream: EnhancedResponseStream,
    agentAndTools: AgentAndTools,
    files?: ChatMessageFile[]
) {
    console.log('=== CONVERSE FUNCTION START ===');
    console.log('converse called with:', {
        sessionId: chatSession.sessionId,
        isNewSession,
        userId: user.userId,
        messageLength: message.length,
        lastUpdate: chatSession.lastUpdate,
        agentId: agentAndTools.agent.agentId
    });

    const msSinceLastUpdate = Date.now() - (chatSession.lastUpdate ? new Date(chatSession.lastUpdate).getTime() : 0);
    console.log('Session timing:', {
        msSinceLastUpdate,
        TIMEOUT_AFTER_MS,
        isExpired: msSinceLastUpdate >= TIMEOUT_AFTER_MS
    });

    let conversationHistory: ConversationHistory | undefined;
    let instructions = '';

    if (!isNewSession && msSinceLastUpdate >= TIMEOUT_AFTER_MS) {
        console.log(`Session ${chatSession.sessionId} has expired, reattaching...`);

        console.log('Fetching messages for expired session');
        const messages = fixTurnTakingErrors(await getChatMessages(user.userId, chatSession.sessionId), chatSession, user.userId);
        console.log('Retrieved messages:', {
            count: messages.length,
            firstMessageId: messages[0]?.messageId,
            lastMessageId: messages[messages.length - 1]?.messageId
        });

        console.log('Prepending instructions if needed');
        prependInstructionsWhenNeeded(messages, user.features?.instruction?.instruction);

        console.log('Building conversation history');
        conversationHistory = getConversationHistoryToReattachToSession(messages);
        console.log('Conversation history built:', {
            hasHistory: !!conversationHistory,
            messageCount: conversationHistory?.messages?.length
        });
    } else {
        console.log('Using new session or non-expired session');
        // It's a new session, just save off the instructions if they exist
        instructions = `${user.features?.instruction?.instruction}\n\n` || '';
        console.log('Instructions for new session:', {
            hasInstructions: !!instructions,
            instructionLength: instructions.length
        });
    }

    console.log('Creating user message');
    const userMessageForCreate: ChatMessageForCreate = {
        sessionId: chatSession.sessionId,
        source: 'user',
        userId: user.userId,
        message: message,
        ...(files && { files })
    };

    console.log('Adding user message to chat');
    const userMessage = await addChatMessage(userMessageForCreate, chatSession);
    console.log('User message added:', {
        messageId: userMessage.messageId,
        timestamp: userMessage.timestamp
    });

    //TODO: deal with how to know about the file use cases `useCase?: ChatMessageFileUseCase`: chat, pass-through, analytics
    // Right now assuming pass-through for all files.
    let filesStr = '';
    if (files && files.length > 0) {
        const s3Files = files.filter((file) => file.locationType === 's3');
        if (s3Files.length > 0) {
            const keys = s3Files.map((file) => file.s3Key);
            filesStr = `\n\nAvailable S3 files:\n    - S3 Bucket: ${s3Files[0].s3Bucket}\n    - File Keys: ${keys.join(', ')}\n\nWhen calling functions, use only S3 keys (like 'uploads/file.csv'), not full s3:// URLs. The S3 bucket is pre-configured in each function.`;
        }
    }

    const questionFromUser = `${instructions}${message}${filesStr}`;
    console.log('Question from user:', questionFromUser);
    console.log('Prepared question for agent:', {
        hasInstructions: !!instructions,
        questionLength: questionFromUser.length
    });

    console.log('Invoking agent for answer');
    const assistantMessageForCreate = await invokeAgentToGetAnswer(
        chatSession,
        simpleUser,
        userMessage.messageId,
        questionFromUser,
        responseStream,
        agentAndTools,
        conversationHistory
    );
    console.log('Agent response received:', {
        hasMessage: !!assistantMessageForCreate.message,
        messageLength: assistantMessageForCreate.message?.length
    });

    console.log('Adding assistant message to chat');
    await addChatMessage(assistantMessageForCreate, chatSession, questionFromUser, assistantMessageForCreate.message);
    console.log('=== CONVERSE FUNCTION END ===');
}

/**
 * Gets the conversation history to reattach to the session, formatting the messages for the agent.
 */
function getConversationHistoryToReattachToSession(messages: ChatMessage[]): ConversationHistory {
    return {
        messages: messages.map((msg) => {
            return {
                content: [{ text: msg.message }],
                role: msg.source === 'user' ? ConversationRole.USER : ConversationRole.ASSISTANT
            };
        })
    };
}

/**
 * Prepends the instructions to the first message if it exists and there are messages in the conversation history.
 */
function prependInstructionsWhenNeeded(messages: ChatMessage[], instructions?: string) {
    if (messages.length > 0 && instructions) {
        messages[0].message = `${instructions}\n\n${messages[0].message}`;
    }
}

/**
 * This function is used to fix turn-taking errors in the conversation.
 * It is used to ensure that the conversation is always in the correct order, user -> bot -> user -> bot, etc.
 * Though this shouldn't happen, it is possible that the conversation flow is interrupted
 * by a message from the user or the bot that is not part of the conversation history.
 * This function will detect these errors and create artificial messages to maintain the conversation flow.
 */
export function fixTurnTakingErrors(messageHistory: ChatMessage[], chatSession: ChatSession, userId: string): ChatMessage[] {
    const result: ChatMessage[] = [];

    // Track the last message to detect conversation flow errors
    let lastMessage: ChatMessage | null = null;

    // Process each message and fix any turn-taking errors
    for (const historyMessage of messageHistory) {
        // Check if we have a turn-taking error (consecutive messages from same source)
        if (lastMessage && lastMessage.source === historyMessage.source) {
            console.log(`Detected conversation flow error: consecutive ${historyMessage.source} messages`);

            // Create artificial message with opposite source to maintain conversation flow
            const errorMessage: ChatMessage = {
                messageId: `${historyMessage.sessionId}:error:${Date.now()}`,
                sessionId: chatSession.sessionId,
                source: historyMessage.source === 'user' ? 'assistant' : 'user',
                //TODO: what userId are we using for the assistant?
                userId: historyMessage.source === 'user' ? 'assistant' : userId,
                timestamp: new Date().toISOString(),
                message: 'Error in conversation flow'
            };

            // Add the error message to maintain conversation flow
            result.push(errorMessage);
        }

        // Add the current message to our reconstructed conversation
        result.push(historyMessage);

        // Update the last message for next iteration
        lastMessage = historyMessage;
    }

    return result;
}
