import type { ChatUser } from "@pika/shared/types/chatbot/chatbot-types";
import { redirect, type RequestEvent } from "@sveltejs/kit";

export async function load(event: RequestEvent<Record<string, string>>): Promise<ChatUser> {
    const user = event.locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    const chatUser = {...user} as ChatUser;
    delete (chatUser as any).authData;

    return chatUser;
}