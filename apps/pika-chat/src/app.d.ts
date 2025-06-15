// import type { Session } from '@auth/sveltekit';
import type { appConfig } from '$lib/server/config';
import type { AuthenticatedUser, UserAuthData } from '@pika/shared/types/chatbot/chatbot-types';

declare global {
    namespace App {
        interface Locals {
            // auth: () => Promise<Session | null>;
            user: AuthenticatedUser<UserAuthData>;
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
