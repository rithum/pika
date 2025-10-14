import { getUserWidgetData, setUserWidgetData, deleteUserWidgetData } from '$lib/server/chat-apis';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { SetUserWidgetDataRequest } from 'pika-shared/types/chatbot/chatbot-types';

export const GET: RequestHandler = async ({ params, locals }) => {
    const user = locals.user;
    if (!user) throw error(401, 'Unauthorized');

    const { scope, tag } = params;
    if (!scope || !tag) throw error(400, 'scope and tag are required');

    try {
        const data = await getUserWidgetData(user.userId, scope, tag);
        return json({ success: true, data });
    } catch (e) {
        handleApiGatewayError(e, 'getting component values');
    }
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const user = locals.user;
    if (!user) throw error(401, 'Unauthorized');

    const { scope, tag } = params;
    if (!scope || !tag) throw error(400, 'scope and tag are required');

    try {
        const reqParams: SetUserWidgetDataRequest = await request.json();

        if (!reqParams.data || typeof reqParams.data !== 'object') {
            throw error(400, 'data object is required');
        }

        const values = await setUserWidgetData(user.userId, scope, tag, reqParams.data, reqParams.partial ?? false);

        return json({ success: true, values });
    } catch (e) {
        handleApiGatewayError(e, 'setting widget data');
    }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    const user = locals.user;
    if (!user) throw error(401, 'Unauthorized');

    const { scope, tag } = params;
    if (!scope || !tag) throw error(400, 'scope and tag are required');

    try {
        await deleteUserWidgetData(user.userId, scope, tag);
        return json({ success: true });
    } catch (e) {
        handleApiGatewayError(e, 'deleting widget data');
    }
};
