import { type ConversationHistory, ConversationRole } from '@aws-sdk/client-bedrock-agent-runtime';
import { LRUCache } from 'lru-cache';
import type {
    AgentAndTools,
    ChatAppComponentConfig,
    ChatAppOverridableFeaturesForConverseFn,
    ChatMessage,
    ChatMessageFile,
    ChatMessageForCreate,
    ChatSession,
    ChatUser,
    ConverseInvocationMode,
    ConverseRequest,
    ConverseRequestWithCommand,
    InstructionAssistanceConfig,
    InvocationScopes,
    RecordOrUndef,
    SimpleAuthenticatedUser,
    TagDefinition,
    TagDefinitionSearchRequest,
    TagDefinitionSearchResponse,
    TagDefinitionWidget,
    UserMemoryFeatureWithMemoryInfo,
    WidgetRenderingContextType
} from 'pika-shared/types/chatbot/chatbot-types';
import { DEFAULT_MAX_K_MATCHES_PER_STRATEGY, DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT, DEFAULT_MEMORY_STRATEGIES } from 'pika-shared/types/chatbot/chatbot-types';
import { convertFunctionUrlEventToStandardApiGatewayEvent, type LambdaFunctionUrlProxyEventPika } from 'pika-shared/util/api-gateway-utils';
import { BadRequestError } from 'pika-shared/util/bad-request-error';
import { HttpStatusError } from 'pika-shared/util/http-status-error';
import {
    applyInstructionAssistance,
    generateComponentInstructionContent,
    generateInstructionAssistanceContent,
    getInstructionsAssistanceConfigFromRawSsmParams
} from 'pika-shared/util/instruction-assistance-utils';
import { extractFromJwtString } from 'pika-shared/util/jwt';
import { redactData } from 'pika-shared/util/server-client-utils';
import { getEntityIdForUser } from 'pika-shared/util/server-utils';
import { UnauthorizedError } from 'pika-shared/util/unauthorized-error';
import { invokeAgentToGetAnswer } from '../../lib/bedrock-agent';
import { getAgentAndTools, searchTagDefsApi } from '../../lib/chat-admin-apis';
import { addChatMessage, ensureChatSession, getChatMessages, getUser } from '../../lib/chat-apis';
import { getAdditionalUserPromptInstructions } from '../../lib/instruction-augmentation';
import { getMemoryInstructions } from '../../lib/memory';
import { getParametersByPath, getValueFromParameterStore } from '../../lib/ssm';
import { getEffectiveChatAppId, getMemoryId } from '../../lib/utils';
import type { EnhancedResponseStream } from './EnhancedResponseStream';
import { enhancedStreamifyResponse } from './enhanced-stream';

const SESSION_TIMEOUT_MS = 1000 * 60 * 10; // 10 minutes
const TIMEOUT_AFTER_MS = SESSION_TIMEOUT_MS * 0.9; // Timeout 90% of the way through the session

// This variable is stored in the lamdbda context and will survive across invocations so we
// only need to get it once until the lambda is restarted
let jwtSecret: string | undefined;

// Instruction assistance configuration cached from SSM
let instructionAssistanceConfig: InstructionAssistanceConfig | undefined;

// We are creating this out here so it can be used across invocations since it is stored in the lambda context
const agentAndToolCache = new LRUCache<string, AgentAndTools>({
    max: 100,
    maxSize: 50000,
    ttl: 1000 * 60 * 5, // 5 minutes
    ttlAutopurge: true,
    sizeCalculation: (value, key) => {
        return 1;
    }
});

// Cache for tag definitions to avoid re-fetching them repeatedly
const tagDefinitionCache = new LRUCache<string, TagDefinition<TagDefinitionWidget> | TagDefinition<TagDefinitionWidget>[]>({
    max: 50,
    ttl: 1000 * 60 * 10, // 10 minutes
    ttlAutopurge: true
});

/**
 * This is a handler for a lambda function that is used to stream a conversation to the client.
 * It is decorated with the enhancedStreamifyResponse decorator which is a wrapper around the lambda-stream library.
 * This allows us to know when the stream has been written to and to handle errors properly.
 */
export const handler = enhancedStreamifyResponse(
    async (fnUrlEvent: LambdaFunctionUrlProxyEventPika<ConverseRequest | ConverseRequestWithCommand>, responseStream: EnhancedResponseStream, context) => {
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

        const tagDefinitionsTable = process.env.TAG_DEFINITIONS_TABLE;
        // if (!tagDefinitionsTable) {
        //     throw new Error('TAG_DEFINITIONS_TABLE is not set in the environment variables, cannot converse without tag definitions');
        // }
        console.log('Tag definitions table:', tagDefinitionsTable);

        if (!jwtSecret) {
            console.log('JWT secret not cached, fetching from SSM...');
            jwtSecret = await getValueFromParameterStore(`/stack/${process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE}/${process.env.STAGE}/jwt-secret`);
            console.log('JWT secret fetched:', !!jwtSecret);
        }

        if (!instructionAssistanceConfig) {
            console.log('Instruction assistance config not cached, fetching from SSM...');
            instructionAssistanceConfig = getInstructionsAssistanceConfigFromRawSsmParams(
                await getParametersByPath(`/stack/${process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE}/${process.env.STAGE}/instruction-assistance/`)
            );
            console.log('Instruction assistance config fetched:', Object.keys(instructionAssistanceConfig ?? {}));
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
            const [simpleUser, error] = extractFromJwtString<RecordOrUndef>(authHeader, jwtSecret);
            console.log('JWT validation result:', {
                userFromHeader: typeof simpleUser === 'number' ? simpleUser : redactData(simpleUser, 'authData'),
                error
            });
            if (typeof simpleUser === 'number') {
                throw new UnauthorizedError(error ?? 'Unauthorized');
            }

            const pikaS3Bucket = process.env.PIKA_S3_BUCKET;
            if (!pikaS3Bucket) {
                throw new Error('PIKA_S3_BUCKET is not set');
            }

            // Easier to convert the event to a standard API Gateway event and not have to handle the different event types.
            console.log('Converting function URL event to standard API Gateway event...');
            const event = convertFunctionUrlEventToStandardApiGatewayEvent<ConverseRequest | ConverseRequestWithCommand>(fnUrlEvent);
            console.log('Event converted successfully');

            // Handle commands first, before conversation logic
            if ('command' in event.body) {
                if (event.body.command === 'clearConverseLambdaCache') {
                    console.log('Processing clearConverseLambdaCache command');
                    await handleClearCacheCommand(event.body as ConverseRequestWithCommand, responseStream);
                    return;
                } else {
                    throw new Error(`Unknown command: ${event.body.command}`);
                }
            }

            // Cast to ConverseRequest since we know it's not a command at this point
            const requestBody = event.body as ConverseRequest;

            // Set defaults for features just in case the client doesn't send them or sends incomplete data
            const features: ChatAppOverridableFeaturesForConverseFn = requestBody.features ?? {
                verifyResponse: {
                    enabled: false
                }
            };

            // event.body was already parsed by the convertFunctionUrlEventToStandardApiGatewayEvent function
            let converseRequest: ConverseRequest = requestBody;
            let invocationMode: ConverseInvocationMode;

            if (converseRequest.invocationMode) {
                if (converseRequest.invocationMode === 'chat-app' && !converseRequest.chatAppId) {
                    console.error('Missing chatAppId in request despite mode explicitly set to chat-app');
                    throw new HttpStatusError('chatAppId is required', 400);
                }
                if (converseRequest.invocationMode === 'direct-agent-invoke' && converseRequest.chatAppId) {
                    console.error('chatAppId is not allowed in direct-agent-invoke mode despite mode explicitly set to direct-agent-invoke');
                    throw new HttpStatusError('chatAppId is not allowed in direct-agent-invoke mode', 400);
                }
                if (converseRequest.invocationMode === 'chat-app-component') {
                    if (!converseRequest.chatAppId) {
                        console.error('Missing chatAppId in request for chat-app-component mode');
                        throw new HttpStatusError('chatAppId is required for chat-app-component mode', 400);
                    }
                    if (!converseRequest.chatAppComponentConfig) {
                        console.error('Missing chatAppComponentConfig in request for chat-app-component mode');
                        throw new HttpStatusError('chatAppComponentConfig is required for chat-app-component mode', 400);
                    }
                    if (!converseRequest.chatAppComponentConfig.componentAgentInstructionName) {
                        console.error('Missing componentAgentInstructionName in chatAppComponentConfig');
                        throw new HttpStatusError('componentAgentInstructionName is required in chatAppComponentConfig', 400);
                    }
                    if (!converseRequest.chatAppComponentConfig.componentTagDefinition) {
                        console.error('Missing componentTagDefinition in chatAppComponentConfig');
                        throw new HttpStatusError('componentTagDefinition is required in chatAppComponentConfig', 400);
                    }
                    if (!converseRequest.chatAppComponentConfig.componentTagDefinition.scope || !converseRequest.chatAppComponentConfig.componentTagDefinition.tag) {
                        console.error('Invalid componentTagDefinition - missing scope or tag');
                        throw new HttpStatusError('componentTagDefinition must have both scope and tag', 400);
                    }
                }
                invocationMode = converseRequest.invocationMode;
            } else {
                if (converseRequest.chatAppId) {
                    invocationMode = 'chat-app';
                } else {
                    invocationMode = 'direct-agent-invoke';
                }
            }

            console.log('Converse request:', {
                hasMessage: !!converseRequest.message,
                messageLength: converseRequest.message?.length,
                userId: converseRequest.userId,
                sessionId: converseRequest.sessionId,
                agentId: converseRequest.agentId,
                chatAppId: converseRequest.chatAppId,
                invocationMode: converseRequest.invocationMode,
                features: features
            });

            if (!converseRequest.message) {
                throw new BadRequestError('message is required');
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
                    if (file.locationType === 's3' && file.s3Bucket !== pikaS3Bucket) {
                        throw new BadRequestError(`Invalid file location: ${file.s3Bucket} is not the same as the upload bucket: ${pikaS3Bucket}`);
                    }
                }
            }

            console.log('Fetching user data...');
            const user = await getUser(converseRequest.userId);
            console.log('User fetched:', { userId: user?.userId });
            if (!user) {
                throw new UnauthorizedError('User not found');
            }

            if (!converseRequest.agentId) {
                console.error('Missing agentId in request');
                throw new HttpStatusError('agentId is required', 400);
            }

            const effectiveChatAppId = getEffectiveChatAppId(converseRequest.chatAppId, converseRequest.agentId, invocationMode);

            const entityValue = getEntityIdForUser(user, simpleUser.customUserData, converseRequest.entityAttributeNameInUserCustomData);

            console.log('Ensuring chat session...');
            const [chatSession, isNewSession] = await ensureChatSession(
                user,
                converseRequest,
                converseRequest.agentId,
                effectiveChatAppId,
                simpleUser,
                invocationMode,
                features?.entity?.enabled ?? false,
                entityValue
            );
            console.log('Chat session ensured:', {
                sessionId: chatSession.sessionId,
                isNewSession,
                lastUpdate: chatSession.lastUpdate
            });

            const agentAndTools = await getAgentAndToolsFromDbOrCache(converseRequest.agentId);
            console.log('Agent and tools fetched:', agentAndTools);

            agentAndTools.tools = !!agentAndTools.tools ? agentAndTools.tools : [];

            const scopes: InvocationScopes = {
                ...(invocationMode === 'chat-app' ? { chatapp: [converseRequest.chatAppId!] } : {}),
                ...(agentAndTools.agent.agentId ? { agent: [agentAndTools.agent.agentId] } : {}),
                ...(agentAndTools.tools.length > 0 ? { tool: agentAndTools.tools.map((tool) => tool.toolId) } : {}),
                ...(entityValue ? { entity: [entityValue] } : {}),
                ...(agentAndTools.agent.agentId && entityValue ? { 'agent-entity': [{ agent: agentAndTools.agent.agentId, entity: entityValue }] } : {})
            };

            console.log('Starting conversation...');
            await converse(
                chatSession,
                isNewSession,
                user,
                simpleUser,
                converseRequest.message,
                responseStream,
                agentAndTools,
                features,
                scopes,
                invocationMode,
                converseRequest.files,
                converseRequest.chatAppComponentConfig
            );
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
    }
);

async function handleClearCacheCommand(request: ConverseRequestWithCommand, responseStream: EnhancedResponseStream) {
    console.log('Clearing cache:', request.cacheType);

    if (request.cacheType === 'agent') {
        if (request.agentId) {
            const deleted = agentAndToolCache.delete(request.agentId);
            console.log(`Cache entry for agentId ${request.agentId} deleted:`, deleted);
        } else {
            throw new BadRequestError('agentId is required when clearing agent cache');
        }
    } else if (request.cacheType === 'tagDefinitions') {
        tagDefinitionCache.clear();
        console.log(`Cache entry for tagDefinitions deleted`);
    } else if (request.cacheType === 'instructionAssistanceConfig') {
        instructionAssistanceConfig = undefined;
        console.log(`Cache entry for instructionAssistanceConfig deleted`);
    } else if (request.cacheType === 'all') {
        agentAndToolCache.clear();
        tagDefinitionCache.clear();
        instructionAssistanceConfig = undefined;
        console.log('All cache entries cleared');
    } else {
        throw new BadRequestError(`Unknown cache type: ${request.cacheType}`);
    }

    // Stream back a simple success response
    const response = {
        success: true,
        message: `Cache cleared for ${request.cacheType}`
    };

    responseStream.write(JSON.stringify(response));
    responseStream.end();
}

async function getAgentAndToolsFromDbOrCache(agentId: string): Promise<AgentAndTools> {
    let result = agentAndToolCache.get(agentId);
    if (result) {
        return result;
    }

    result = await getAgentAndTools(agentId);
    if (!result) {
        throw new BadRequestError(`Agent definition not found for agentId: ${agentId}`);
    }
    if (!result.agent.dontCacheThis) {
        agentAndToolCache.set(agentId, result);
    }
    return result;
}

/**
 * Get tag definitions for a chat app (including global tags).
 * Automatically queries both the specified chatAppId AND 'chat-app-global'.
 * Filters to only include tags with status === 'enabled' AND contexts.inline.enabled === true.
 */
async function getTagDefinitionsForChatApp(chatAppId: string, filterToThisType?: WidgetRenderingContextType): Promise<TagDefinition<TagDefinitionWidget>[]> {
    if (!chatAppId) {
        return [];
    }

    // Create cache key based on chat app ID
    const cacheKey = `tags-${chatAppId}${filterToThisType ? `-${filterToThisType}` : ''}`;

    let result = tagDefinitionCache.get(cacheKey) as TagDefinition<TagDefinitionWidget>[] | undefined;
    if (result) {
        console.log('Inline tag definitions retrieved from cache:', { chatAppId, count: result.length });
        return result;
    }

    console.log('Fetching inline tag definitions from API:', { chatAppId });

    // Search for all tags available to this chat app
    // Note: Automatically includes both chatAppId-specific tags AND 'chat-app-global' tags
    const searchRequest: TagDefinitionSearchRequest = {
        chatAppId: chatAppId,
        includeInstructions: true
    };

    const response: TagDefinitionSearchResponse = await searchTagDefsApi(searchRequest);
    if (!response.success) {
        console.error('Failed to fetch tag definitions');
        return [];
    }

    // Filter to only include inline-enabled tags with status 'enabled'
    result = response.tagDefinitions.filter((tagDef) => {
        if (tagDef.status === 'enabled') {
            if (filterToThisType) {
                return tagDef.renderingContexts?.[filterToThisType]?.enabled === true;
            } else {
                return true;
            }
        } else {
            return false;
        }
    });

    // Only cache if no tag has dontCacheThis set to true
    const shouldCache = result.every((tagDef) => !tagDef.dontCacheThis);
    if (shouldCache) {
        tagDefinitionCache.set(cacheKey, result);
        console.log('Inline tag definitions cached:', { chatAppId, count: result.length });
    } else {
        console.log('Inline tag definitions not cached due to dontCacheThis flag');
    }

    return result;
}

export async function getTagDefinitionForChatAppComponent(chatAppId: string, scope: string, tag: string): Promise<TagDefinition<TagDefinitionWidget> | undefined> {
    if (tagDefinitionCache.has(`tag-${chatAppId}-${scope}-${tag}`)) {
        const tagDef = tagDefinitionCache.get(`tag-${chatAppId}-${scope}-${tag}`) as TagDefinition<TagDefinitionWidget> | undefined;
        if (tagDef) {
            return tagDef;
        }
    }

    const searchRequest: TagDefinitionSearchRequest = {
        includeInstructions: true,
        tagsDesired: [{ scope, tag }]
    };

    const response: TagDefinitionSearchResponse = await searchTagDefsApi(searchRequest);
    if (!response.success) {
        console.error('Failed to fetch tag definitions');
        return undefined;
    }
    const tagDefinition = response.tagDefinitions && response.tagDefinitions.length === 1 ? response.tagDefinitions[0] : undefined;

    if (!tagDefinition) {
        return undefined;
    }

    if (!tagDefinition.dontCacheThis) {
        tagDefinitionCache.set(`tag-${chatAppId}-${scope}-${tag}`, tagDefinition);
    }

    return tagDefinition;
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
    chatSession: ChatSession<RecordOrUndef>,
    isNewSession: boolean,
    user: ChatUser<RecordOrUndef>,
    simpleUser: SimpleAuthenticatedUser<RecordOrUndef>,
    message: string,
    responseStream: EnhancedResponseStream,
    agentAndTools: AgentAndTools,
    features: ChatAppOverridableFeaturesForConverseFn,
    scopes: InvocationScopes,
    mode: ConverseInvocationMode,
    files?: ChatMessageFile[],
    chatAppComponentConfig?: ChatAppComponentConfig
) {
    console.log('=== CONVERSE FUNCTION START ===');
    console.log('converse called with:', {
        sessionId: chatSession.sessionId,
        isNewSession,
        userId: user.userId,
        messageLength: message.length,
        lastUpdate: chatSession.lastUpdate,
        agentId: agentAndTools.agent.agentId,
        mode
    });

    const msSinceLastUpdate = Date.now() - (chatSession.lastUpdate ? new Date(chatSession.lastUpdate).getTime() : 0);
    console.log('Session timing:', {
        msSinceLastUpdate,
        TIMEOUT_AFTER_MS,
        isExpired: msSinceLastUpdate >= TIMEOUT_AFTER_MS
    });

    let conversationHistory: ConversationHistory | undefined;
    const memoryFeature: UserMemoryFeatureWithMemoryInfo = {
        enabled: features.userMemory?.enabled ?? false,
        maxMemoryRecordsPerPrompt: features.userMemory?.maxMemoryRecordsPerPrompt ?? DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT,
        maxKMatchesPerStrategy: features.userMemory?.maxKMatchesPerStrategy ?? DEFAULT_MAX_K_MATCHES_PER_STRATEGY,
        memoryId: !!features.userMemory?.enabled ? getMemoryId() : '',
        strategies: DEFAULT_MEMORY_STRATEGIES
    };
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

        // Add the user's global instructions if they exist.
        if (!!user.features?.instruction?.instruction) {
            instructions = `${user.features.instruction.instruction}\n\n`;
        }

        // Add the memory instructions if they exist and we are in a new session and the memory feature is enabled.
        // We don't add memory instructions everytime, just for the first message in a new session.
        if (isNewSession && memoryFeature.enabled) {
            const memoryInstructions = await getMemoryInstructions(simpleUser, memoryFeature, message, memoryFeature.maxKMatchesPerStrategy);
            if (!!memoryInstructions) {
                instructions = `${instructions}${memoryInstructions}\n\n`;
            }
        }

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

    const additionalUserPromptInstructions = features.instructionAugmentation?.enabled ? await getAdditionalUserPromptInstructions(scopes, message) : '';

    const questionFromUser = `${instructions}${additionalUserPromptInstructions}${message}${filesStr}`;
    console.log('Question from user:', questionFromUser);
    console.log('Prepared question for agent:', {
        hasInstructions: !!instructions,
        questionLength: questionFromUser.length
    });

    // Apply instruction assistance to the agent prompt if enabled
    console.log('Applying instruction assistance to agent prompt...');
    const originalPrompt = agentAndTools.agent.basePrompt;
    let enhancedPrompt = originalPrompt;

    // Check if this is a chat-app-component invocation
    if (mode === 'chat-app-component' && chatAppComponentConfig) {
        console.log('Processing chat-app-component mode with component config:', {
            scope: chatAppComponentConfig.componentTagDefinition.scope,
            tag: chatAppComponentConfig.componentTagDefinition.tag,
            instructionName: chatAppComponentConfig.componentAgentInstructionName
        });

        // Fetch the full tag definition to get the component instructions
        const componentTagDef = await getTagDefinitionForChatAppComponent(
            chatSession.chatAppId,
            chatAppComponentConfig.componentTagDefinition.scope,
            chatAppComponentConfig.componentTagDefinition.tag
        );

        if (!componentTagDef) {
            console.error('Component tag definition not found:', {
                scope: chatAppComponentConfig.componentTagDefinition.scope,
                tag: chatAppComponentConfig.componentTagDefinition.tag
            });
            throw new BadRequestError(
                `Component tag definition not found for chat app ID ${chatSession.chatAppId}: ${chatAppComponentConfig.componentTagDefinition.scope}.${chatAppComponentConfig.componentTagDefinition.tag}`
            );
        }

        const componentInstructions = generateComponentInstructionContent(
            componentTagDef,
            chatAppComponentConfig.componentAgentInstructionName,
            instructionAssistanceConfig,
            features.agentInstructionAssistance
        );

        if (!componentInstructions) {
            console.error('Component instructions not found:', {
                scope: componentTagDef.scope,
                tag: componentTagDef.tag,
                instructionName: chatAppComponentConfig.componentAgentInstructionName
            });
            throw new BadRequestError(`Component instructions not found for: ${chatAppComponentConfig.componentAgentInstructionName}`);
        }

        // For component invocations, replace the base prompt with component-specific instructions
        enhancedPrompt = componentInstructions;
        console.log('Component instructions applied to prompt:', {
            instructionsLength: componentInstructions.length
        });
    } else {
        // Standard chat-app or direct-agent-invoke mode: apply standard instruction assistance
        const tagDefinitions = await getTagDefinitionsForChatApp(chatSession.chatAppId, 'inline');
        const instructionContent = generateInstructionAssistanceContent(instructionAssistanceConfig!, features.tags, features.agentInstructionAssistance, tagDefinitions);
        enhancedPrompt = applyInstructionAssistance(originalPrompt, instructionContent);
    }

    console.log('Agent prompt enhancement:', {
        originalPromptLength: originalPrompt.length,
        enhancedPromptLength: enhancedPrompt.length,
        wasModified: originalPrompt !== enhancedPrompt,
        mode
    });

    // Log the enhanced prompt for debugging (truncated if too long)
    if (originalPrompt !== enhancedPrompt) {
        console.log('=== ENHANCED AGENT PROMPT ===');
        console.log(enhancedPrompt.length > 3000 ? enhancedPrompt.substring(0, 3000) + '... (truncated)' : enhancedPrompt);
        console.log('=== END ENHANCED AGENT PROMPT ===');
    }

    // Create a modified agentAndTools with the enhanced prompt
    const enhancedAgentAndTools = {
        ...agentAndTools,
        agent: {
            ...agentAndTools.agent,
            basePrompt: enhancedPrompt
        }
    };

    console.log('Invoking agent for answer');
    const assistantMessageForCreate = await invokeAgentToGetAnswer(
        chatSession,
        simpleUser,
        userMessage.messageId,
        questionFromUser,
        responseStream,
        enhancedAgentAndTools,
        features,
        memoryFeature,
        process.env.POST_PROCESSOR_FUNCTION_ARN,
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
export function fixTurnTakingErrors(messageHistory: ChatMessage[], chatSession: ChatSession<RecordOrUndef>, userId: string): ChatMessage[] {
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
