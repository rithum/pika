// import type { Session } from '@auth/sveltekit';
import type { AppConfig } from '$lib/server/server-types';
import type { AuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';

declare global {
    namespace App {
        interface Locals {
            // auth: () => Promise<Session | null>;
            user: AuthenticatedUser<unknown>;
            appConfig: AppConfig;
        }
        // interface PageData {
        //     session?: Session | null;
        // }
        // interface Error {}
        // interface Platform {}
    }
}

export {};
