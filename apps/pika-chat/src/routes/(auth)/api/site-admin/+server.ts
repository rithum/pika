import {
    addChatSessionFeedback,
    clearSvelteKitCache,
    createOrUpdateChatAppOverride,
    createOrUpdateSemanticDirective,
    createOrUpdateTagDefinition,
    deleteChatAppOverride,
    deleteSemanticDirective,
    deleteTagDefinition,
    getAgent,
    getAllAgents,
    getAllChatApps,
    getAllTools,
    getChatApp,
    getInstructionAssistanceConfigFromSsm,
    getInstructionsAddedForUserMemory,
    getUserMemoriesForStrategy,
    searchForSessions,
    searchSemanticDirectives,
    searchTagDefinitions,
    updateChatSessionFeedback
} from '$lib/server/chat-admin-apis';
import { getChatMessages, searchForUser } from '$lib/server/chat-apis';
import { siteFeatures } from '$lib/server/custom-site-features';
import { invokeConverseFunctionUrl } from '$lib/server/invoke-converse-fn-url';
import { handleApiGatewayError, isUserAllowedToUseEntityAccessControl, isUserAllowedToUseSpecificUserAccessControl, isUserSiteAdmin } from '$lib/server/utils';
import { error, json, redirect, type RequestHandler } from '@sveltejs/kit';
import type { ConverseRequestWithCommand, GetChatMessagesAsAdminResponse, SimpleAuthenticatedUser, SiteAdminRequest } from 'pika-shared/types/chatbot/chatbot-types';
import { getValuesForEntityAutoComplete } from './custom-data';

export const POST: RequestHandler = async (event) => {
    const { locals, request } = event;

    let user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    if (!isUserSiteAdmin(user)) {
        throw error(403, 'You do not have permission to perform this action');
    }

    try {
        const siteAdminReq: SiteAdminRequest = await request.json();

        if (siteAdminReq.command === 'getInitialData') {
            const chatApps = await getAllChatApps();

            return json({
                success: true,
                chatApps,
                siteFeatures
            });
        } else if (siteAdminReq.command === 'getValuesForEntityAutoComplete') {
            if (!isUserAllowedToUseEntityAccessControl(user)) {
                throw error(403, 'You do not have permission to perform this action');
            }

            if (!('valueProvidedByUser' in siteAdminReq)) {
                throw error(400, 'valueProvidedByUser is required');
            }

            const valuesForAutoComplete = await getValuesForEntityAutoComplete(siteAdminReq.valueProvidedByUser, user, siteAdminReq.chatAppId);

            return json({
                success: true,
                data: valuesForAutoComplete
            });
        } else if (siteAdminReq.command === 'getValuesForUserAutoComplete') {
            if (!isUserAllowedToUseSpecificUserAccessControl(user)) {
                throw error(403, 'You do not have permission to perform this action');
            }

            const users = await searchForUser(user.userId, siteAdminReq.valueProvidedByUser);
            return json({
                success: true,
                data: users
            });
        } else if (siteAdminReq.command === 'refreshChatApp') {
            const chatAppId = siteAdminReq.chatAppId;
            if (!chatAppId) {
                throw error(400, 'chatAppId is required');
            }

            const chatApp = await getChatApp(chatAppId);
            if (!chatApp) {
                throw error(404, 'chatApp not found');
            }

            return json({
                success: true,
                chatApp
            });
        } else if (siteAdminReq.command === 'clearConverseLambdaCache') {
            if (!('cacheType' in siteAdminReq)) {
                throw error(400, 'cacheType is required');
            }

            let request: ConverseRequestWithCommand;

            if (siteAdminReq.cacheType === 'agent') {
                if (!('agentId' in siteAdminReq)) {
                    throw error(400, 'agentId is required');
                }

                const agentId = siteAdminReq.agentId;
                if (!agentId) {
                    throw error(400, 'agentId is required');
                }

                request = {
                    userId: user.userId,
                    cacheType: 'agent',
                    agentId: agentId,
                    command: 'clearConverseLambdaCache'
                };
            } else if (siteAdminReq.cacheType === 'tagDefinitions') {
                request = {
                    userId: user.userId,
                    cacheType: 'tagDefinitions',
                    command: 'clearConverseLambdaCache'
                };
            } else if (siteAdminReq.cacheType === 'instructionAssistanceConfig') {
                request = {
                    userId: user.userId,
                    cacheType: 'instructionAssistanceConfig',
                    command: 'clearConverseLambdaCache'
                };
            } else if (siteAdminReq.cacheType === 'all') {
                request = {
                    userId: user.userId,
                    cacheType: 'all',
                    command: 'clearConverseLambdaCache'
                };
            } else {
                throw error(400, 'Invalid cache type');
            }

            // Create simpleUser from user
            const simpleUser: SimpleAuthenticatedUser<typeof user.customData> = {
                userId: user.userId,
                customUserData: user.customData
            };

            // Invoke the converse function with the command
            const response = await invokeConverseFunctionUrl(request, simpleUser);

            // Read the response from the stream
            const reader = response.body?.getReader();
            if (reader) {
                const result = await reader.read();
                const commandResponse = JSON.parse(new TextDecoder().decode(result.value));
                // console.log('Cache clear command response:', commandResponse);
            }

            return json({
                success: true
            });
        } else if (siteAdminReq.command === 'clearSvelteKitCaches') {
            if (!('cacheType' in siteAdminReq)) {
                throw error(400, 'cacheType is required');
            }

            const result = await clearSvelteKitCache(siteAdminReq.cacheType, siteAdminReq.chatAppId);

            return json({
                success: true,
                clearedCount: result.clearedCount,
                cacheType: result.cacheType
            });
        } else if (siteAdminReq.command === 'createOrUpdateChatAppOverride') {
            if (!('chatAppId' in siteAdminReq)) {
                throw error(400, 'chatAppId is required');
            }

            if (!siteAdminReq.override) {
                throw error(400, 'override is required');
            }

            const chatAppOverride = await createOrUpdateChatAppOverride(user.userId, siteAdminReq.chatAppId, siteAdminReq.override);

            return json({
                success: true,
                chatAppOverride
            });
        } else if (siteAdminReq.command === 'deleteChatAppOverride') {
            if (!('chatAppId' in siteAdminReq)) {
                throw error(400, 'chatAppId is required');
            }

            const users = await deleteChatAppOverride(user.userId, siteAdminReq.chatAppId);
            return json({
                success: true
            });
        } else if (siteAdminReq.command === 'addChatSessionFeedback') {
            if (!('feedback' in siteAdminReq)) {
                throw error(400, 'feedback is required');
            }

            const feedback = await addChatSessionFeedback(siteAdminReq.feedback);

            return json({
                success: true,
                feedback
            });
        } else if (siteAdminReq.command === 'updateChatSessionFeedback') {
            if (!('feedback' in siteAdminReq)) {
                throw error(400, 'feedback is required');
            }

            const feedback = await updateChatSessionFeedback(siteAdminReq.feedback);

            return json({
                success: true,
                feedback
            });
        } else if (siteAdminReq.command === 'sessionSearch') {
            if (!('search' in siteAdminReq)) {
                throw error(400, 'search is required');
            }

            const search = await searchForSessions(siteAdminReq.search);
            return json({ ...search });
        } else if (siteAdminReq.command === 'getChatMessagesAsAdmin') {
            if (!('sessionId' in siteAdminReq)) {
                throw error(400, 'sessionId is required');
            }

            if (!('chatAppId' in siteAdminReq)) {
                throw error(400, 'chatAppId is required');
            }

            if (!('userId' in siteAdminReq)) {
                throw error(400, 'userId is required');
            }
            const messages = await getChatMessages(siteAdminReq.sessionId, siteAdminReq.userId);
            const result: GetChatMessagesAsAdminResponse = {
                success: true,
                messages: messages.messages
            };
            return json(result);
        } else if (siteAdminReq.command === 'createOrUpdateTagDefinition') {
            if (!('request' in siteAdminReq)) {
                throw error(400, 'request is required');
            }

            // Set the userId for the request to the current user
            const requestWithUserId = {
                ...siteAdminReq.request,
                userId: user.userId
            };

            const response = await createOrUpdateTagDefinition(requestWithUserId);
            return json(response);
        } else if (siteAdminReq.command === 'deleteTagDefinition') {
            if (!('request' in siteAdminReq)) {
                throw error(400, 'request is required');
            }

            // Set the userId for the request to the current user
            const requestWithUserId = {
                ...siteAdminReq.request,
                userId: user.userId
            };

            const response = await deleteTagDefinition(requestWithUserId);
            return json(response);
        } else if (siteAdminReq.command === 'searchTagDefinitions') {
            if (!('request' in siteAdminReq)) {
                throw error(400, 'request is required');
            }

            const response = await searchTagDefinitions(siteAdminReq.request);
            return json(response);
        } else if (siteAdminReq.command === 'createOrUpdateSemanticDirective') {
            if (!('request' in siteAdminReq)) {
                throw error(400, 'request is required');
            }

            // Set the userId for the request to the current user
            const requestWithUserId = {
                ...siteAdminReq.request,
                userId: user.userId
            };

            const response = await createOrUpdateSemanticDirective(requestWithUserId);
            return json(response);
        } else if (siteAdminReq.command === 'deleteSemanticDirective') {
            if (!('request' in siteAdminReq)) {
                throw error(400, 'request is required');
            }

            // Set the userId for the request to the current user
            const requestWithUserId = {
                ...siteAdminReq.request,
                userId: user.userId
            };

            const response = await deleteSemanticDirective(requestWithUserId);
            return json(response);
        } else if (siteAdminReq.command === 'searchSemanticDirectives') {
            if (!('request' in siteAdminReq)) {
                throw error(400, 'request is required');
            }

            const response = await searchSemanticDirectives(siteAdminReq.request);
            return json(response);
        } else if (siteAdminReq.command === 'getAgent') {
            if (!('agentId' in siteAdminReq)) {
                throw error(400, 'agentId is required');
            }

            const agent = await getAgent(siteAdminReq.agentId);
            return json({
                success: true,
                agent
            });
        } else if (siteAdminReq.command === 'getInstructionAssistanceConfigFromSsm') {
            const config = await getInstructionAssistanceConfigFromSsm();
            return json({
                success: true,
                config
            });
        } else if (siteAdminReq.command === 'getAllChatApps') {
            const chatApps = await getAllChatApps();
            return json({
                success: true,
                chatApps
            });
        } else if (siteAdminReq.command === 'getAllAgents') {
            const agents = await getAllAgents();
            return json({
                success: true,
                agents
            });
        } else if (siteAdminReq.command === 'getAllTools') {
            const tools = await getAllTools();
            return json({
                success: true,
                tools
            });
        } else if (siteAdminReq.command === 'getAllMemoryRecords') {
            const memoryRecords = await getUserMemoriesForStrategy(user.userId, siteAdminReq.request.strategy, siteAdminReq.request.nextToken);
            return json(memoryRecords);
        } else if (siteAdminReq.command === 'getInstructionsAddedForUserMemory') {
            const instructions = await getInstructionsAddedForUserMemory(siteAdminReq.request);
            return json(instructions);
        } else {
            throw error(400, 'Invalid command');
        }
    } catch (e) {
        handleApiGatewayError(e, 'processing site admin request');
    }
};
