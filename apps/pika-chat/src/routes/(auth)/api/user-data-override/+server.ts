import { getChatApp } from '$lib/server/chat-admin-apis';
import { appConfig } from '$lib/server/config';
import { isUserContentAdmin } from '$lib/server/utils';
import { serializeUserOverrideDataToCookies } from '$lib/server/cookies';
import type { UserOverrideDataCommandRequest } from '@pika/shared/types/chatbot/chatbot-types';
import { json, redirect, type RequestHandler } from '@sveltejs/kit';
import { getInitialDataForUserDataOverrideDialog, getValuesForAutoComplete, userOverrideDataPostedFromDialog } from './custom-user-data';
import { isUserAllowedToUseUserDataOverrides } from '$lib/server/utils';

export const POST: RequestHandler = async (event) => {
    const { locals, request } = event;

    let user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    if (!isUserAllowedToUseUserDataOverrides(user)) {
        return new Response('User is not allowed to use user data overrides', { status: 403 });
    }

    if (locals.user.viewingContentFor && Object.keys(locals.user.viewingContentFor).length > 0) {
        if (!isUserContentAdmin(locals.user)) {
            throw new Response('Forbidden', { status: 403 });
        }
        return new Response('You have selected view content for another user and you are not allowed to take action as that user.', { status: 403 });
    }

    const overrideReq: UserOverrideDataCommandRequest = await request.json();

    if (!overrideReq.chatAppId) {
        return new Response('chatAppId is required', { status: 400 });
    }

    const chatApp = await getChatApp(overrideReq.chatAppId);
    if (!chatApp) {
        return new Response('chatApp not found', { status: 404 });
    }

    if (overrideReq.command === 'getInitialDialogData') {
        const initialData = getInitialDataForUserDataOverrideDialog(user, chatApp);
        return json({
            success: true,
            data: initialData
        });
    } else if (overrideReq.command === 'getValuesForAutoComplete') {
        const valuesForAutoComplete = getValuesForAutoComplete(overrideReq.componentName, overrideReq.valueProvidedByUser, user, chatApp);
        return json({
            success: true,
            data: valuesForAutoComplete
        });
    } else if (overrideReq.command === 'saveUserOverrideData') {
        const savedData = userOverrideDataPostedFromDialog(user, chatApp, overrideReq.data);

        // Now update the user object with the new override data and update the cookie.
        if (!user.overrideData) {
            user.overrideData = {};
        }
        user.overrideData[chatApp.chatAppId] = savedData;
        locals.user = user;

        serializeUserOverrideDataToCookies(event, { data: user.overrideData }, appConfig.masterCookieKey, appConfig.masterCookieInitVector);

        return json({
            success: true,
            data: savedData
        });
    } else if (overrideReq.command === 'clearUserOverrideData') {
        if (user.overrideData) {
            delete user.overrideData[chatApp.chatAppId];
        }
        locals.user = user;
        serializeUserOverrideDataToCookies(event, { data: user.overrideData ?? {} }, appConfig.masterCookieKey, appConfig.masterCookieInitVector);
        return json({
            success: true
        });
    } else {
        return new Response('Invalid command', { status: 400 });
    }
};
