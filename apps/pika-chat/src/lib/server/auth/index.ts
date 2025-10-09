import { appConfig } from '$lib/server/config';
import type { RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import DefaultAuthProvider from './default-provider';
import type { AuthProvider } from './types';
import { ForceUserToReauthenticateError, NotAuthenticatedError } from './types';

export { ForceUserToReauthenticateError, NotAuthenticatedError };

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
        return addDefaultGetUserCognitoIdentityMethodIfSupposedTo(new DefaultAuthProvider(appConfig.stage));
    }

    // Validate the provider
    if (!authProvider) {
        console.log(
            'WARNING!! ACHTUNG!! ATTENTION!! Auth provider is undefined so using INSECURE default mock authentication.  If not intentional, see docs at https://pika.tools.'
        );
        return addDefaultGetUserCognitoIdentityMethodIfSupposedTo(new DefaultAuthProvider(appConfig.stage));
    }

    if (typeof authProvider !== 'function') {
        console.log('Custom auth provider is not a class, using default mock authentication');
        return addDefaultGetUserCognitoIdentityMethodIfSupposedTo(new DefaultAuthProvider(appConfig.stage));
    }

    try {
        console.log('Custom authentication provider loaded successfully');
        // At this point, authProvider is confirmed to be a function that we can construct an instance of
        const AuthProviderClass = authProvider as new (stage: string) => AuthProvider<RecordOrUndef, RecordOrUndef>;
        return addDefaultGetUserCognitoIdentityMethodIfSupposedTo(new AuthProviderClass(appConfig.stage));
    } catch (e) {
        console.log('Failed to instantiate custom auth provider, using default mock authentication');
        console.log(`Provider instantiation error: ${e instanceof Error ? e.message : String(e)}`);
        // Return the error to cause the app to crash
        throw e;
    }
}

function addDefaultGetUserCognitoIdentityMethodIfSupposedTo(authProvider: AuthProvider<RecordOrUndef, RecordOrUndef>): AuthProvider<RecordOrUndef, RecordOrUndef> {
    if (appConfig.isLocal && appConfig.getArbitraryConfigValue('USE_LOCAL_COGNITO_IDENTITY') === 'true') {
        authProvider.getUserCognitoIdentity = async (_user) => {
            return {
                cognitoIdentityId: appConfig.getArbitraryConfigValue('LOCAL_COGNITO_IDENTITY_ID'),
                cognitoAccessToken: appConfig.getArbitraryConfigValue('LOCAL_COGNITO_IDENTITY_TOKEN')
            };
        };
    }
    return authProvider;
}
