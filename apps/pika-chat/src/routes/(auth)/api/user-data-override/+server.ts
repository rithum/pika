import { getChatApp } from '$lib/server/chat-admin-apis';
import { appConfig } from '$lib/server/config';
import { serializeUserOverrideDataToCookies } from '$lib/server/utils';
import type { UserOverrideDataCommandRequest } from '@pika/shared/types/chatbot/chatbot-types';
import { json, redirect, type RequestHandler } from '@sveltejs/kit';
import { getInitialDataForUserDataOverrideDialog, getValuesForAutoComplete, userOverrideDataPostedFromDialog } from './custom-user-data';

export const POST: RequestHandler = async (event) => {
    const { locals, request } = event;

    let user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
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
    }

    return new Response('Invalid command', { status: 400 });
};
