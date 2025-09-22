import { addFeedback } from '$lib/server/chat-apis';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, redirect, type RequestHandler } from '@sveltejs/kit';
import type { AddChatSessionFeedbackRequest } from 'pika-shared/types/chatbot/chatbot-types';

export const POST: RequestHandler = async (event) => {
    const { locals, request } = event;

    let user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    //TODO: make sure the feedback feature is turned on for the chat app

    try {
        const feedbackReq: AddChatSessionFeedbackRequest = await request.json();

        if (!feedbackReq.feedback) {
            throw error(400, 'Feedback is required');
        }

        if (!('sessionId' in feedbackReq.feedback)) {
            throw error(400, 'Session ID is required');
        }

        if (!('feedbackId' in feedbackReq.feedback)) {
            throw error(400, 'Feedback ID is required and must be a V7 UUID');
        }

        const feedback = await addFeedback(user, feedbackReq.feedback);

        return json({
            success: true,
            feedback
        });
    } catch (e) {
        handleApiGatewayError(e, 'adding session feedback');
    }
};
