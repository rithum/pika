import type { AuthProvider } from './types';
import { NotAuthenticatedError, ForceUserToReauthenticateError } from './types';
import DefaultAuthProvider from './default-provider';
import { appConfig } from '$lib/server/config';
import type { RecordOrUndef } from '@pika/shared/types/chatbot/chatbot-types';

export { NotAuthenticatedError, ForceUserToReauthenticateError };

/**
 * Dynamically loads the authentication provider
 * Falls back to the default mock provider if no provider is found
 */
export async function loadAuthProvider(): Promise<AuthProvider<RecordOrUndef, RecordOrUndef>> {
    let authProvider: any;

    try {
        // Use dynamic import - Vite will handle this appropriately during build
        const authModule = await import('../auth-provider');
        authProvider = authModule.default ?? undefined;
    } catch (e) {
        // Provider file doesn't exist or has errors
        console.log('Auth provider load error:', e);
        return new DefaultAuthProvider(appConfig.stage);
    }

    // Validate the provider
    if (!authProvider) {
        console.log('Auth provider is undefined, using default mock authentication');
        return new DefaultAuthProvider(appConfig.stage);
    }

    if (typeof authProvider !== 'function') {
        console.log('Custom auth provider is not a class, using default mock authentication');
        return new DefaultAuthProvider(appConfig.stage);
    }

    try {
        console.log('Custom authentication provider loaded successfully');
        // At this point, authProvider is confirmed to be a function that we can construct an instance of
        const AuthProviderClass = authProvider as new (stage: string) => AuthProvider<RecordOrUndef, RecordOrUndef>;
        return new AuthProviderClass(appConfig.stage);
    } catch (e) {
        console.log('Failed to instantiate custom auth provider, using default mock authentication');
        console.log(`Provider instantiation error: ${e instanceof Error ? e.message : String(e)}`);
        // Return the error to cause the app to crash
        throw e;
    }
}
