import { getChatApp } from '$lib/server/chat-admin-apis';
import { serializeUserOverrideDataToCookies } from '$lib/server/cookies';
import { handleApiGatewayError, isUserAllowedToUseUserDataOverrides, isUserContentAdmin } from '$lib/server/utils';
import { error, json, redirect, type RequestHandler } from '@sveltejs/kit';
import type { UserOverrideDataCommandRequest } from 'pika-shared/types/chatbot/chatbot-types';
import { getInitialDataForUserDataOverrideDialog, getValuesForAutoComplete, userOverrideDataPostedFromDialog } from './custom-user-data';

export const POST: RequestHandler = async (event) => {
    const { locals, request } = event;

    let user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    if (!isUserAllowedToUseUserDataOverrides(user)) {
        throw error(403, 'User is not allowed to use user data overrides');
    }

    if (locals.user.viewingContentFor && Object.keys(locals.user.viewingContentFor).length > 0) {
        if (!isUserContentAdmin(locals.user)) {
            throw error(403, 'Forbidden');
        }
        throw error(403, 'You have selected view content for another user and you are not allowed to take action as that user.');
    }

    try {
        const overrideReq: UserOverrideDataCommandRequest = await request.json();

        if (!overrideReq.chatAppId) {
            throw error(400, 'chatAppId is required');
        }

        const chatApp = await getChatApp(overrideReq.chatAppId);
        if (!chatApp) {
            throw error(404, 'chatApp not found');
        }

        if (overrideReq.command === 'getInitialDialogData') {
            const initialData = await getInitialDataForUserDataOverrideDialog(user, chatApp);
            return json({
                success: true,
                data: initialData
            });
        } else if (overrideReq.command === 'getValuesForAutoComplete') {
            const valuesForAutoComplete = await getValuesForAutoComplete(overrideReq.componentName, overrideReq.valueProvidedByUser, user, chatApp);
            return json({
                success: true,
                data: valuesForAutoComplete
            });
        } else if (overrideReq.command === 'saveUserOverrideData') {
            const savedData = await userOverrideDataPostedFromDialog(user, chatApp, overrideReq.data);

            // Now update the user object with the new override data and update the cookie.
            if (!user.overrideData) {
                user.overrideData = {};
            }
            user.overrideData[chatApp.chatAppId] = savedData;
            locals.user = user;

            if (locals.keyManager) {
                serializeUserOverrideDataToCookies(event, { data: user.overrideData }, locals.keyManager);
            } else {
                throw new Error('KeyManager not available for cookie serialization');
            }

            return json({
                success: true,
                data: savedData
            });
        } else if (overrideReq.command === 'clearUserOverrideData') {
            if (user.overrideData) {
                delete user.overrideData[chatApp.chatAppId];
            }
            locals.user = user;

            if (locals.keyManager) {
                serializeUserOverrideDataToCookies(event, { data: user.overrideData ?? {} }, locals.keyManager);
            } else {
                throw new Error('KeyManager not available for cookie serialization');
            }
            return json({
                success: true
            });
        } else {
            throw error(400, 'Invalid command');
        }
    } catch (e) {
        handleApiGatewayError(e, 'handling user data override command');
    }
};
