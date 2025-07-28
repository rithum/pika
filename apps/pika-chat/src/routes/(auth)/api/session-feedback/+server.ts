import { addFeedback } from '$lib/server/chat-apis';
import type { AddChatSessionFeedbackRequest } from '@pika/shared/types/chatbot/chatbot-types';
import { json, redirect, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
    const { locals, request } = event;

    let user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    //TODO: make sure the feedback feature is turned on for the chat app

    const feedbackReq: AddChatSessionFeedbackRequest = await request.json();

    if (!feedbackReq.feedback) {
        return new Response('Feedback is required', { status: 400 });
    }

    if (!('sessionId' in feedbackReq.feedback)) {
        return new Response('Session ID is required', { status: 400 });
    }

    if (!('feedbackId' in feedbackReq.feedback)) {
        return new Response('Feedback ID is required and must be a V7 UUID', { status: 400 });
    }

    const feedback = await addFeedback(user, feedbackReq.feedback);

    return json({
        success: true,
        feedback
    });
};
