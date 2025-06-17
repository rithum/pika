import { SvelteKitAuth, type Profile } from '@auth/sveltekit';
import type { OAuth2Config, OAuthChecks } from '@auth/sveltekit/providers';
import { appConfig } from './config';
import { createChatUser, getChatUser } from './chat-apis';
import { getUserDataFromServer } from './utils';
import type { AuthData, IdTokenClaims } from '$lib/shared-types';
import type { TokenSet } from '@auth/core/types';

// Extend the built-in session types to include our custom fields
declare module '@auth/sveltekit' {
    interface Session {
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: number;
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
            userId: string;
            features?: any;
        };
    }
}

// Custom provider configuration for your third-party auth service
function CustomProvider(): OAuth2Config<Profile> {
    console.log('Creating CustomProvider with config:', {
        oauthUrl: appConfig.oauthUrl,
        tokenUrl: appConfig.tokenUrl,
        clientId: appConfig.clientId,
        webappUrl: appConfig.webappUrl,
        authUrl: appConfig.webappUrl,
        issuer: appConfig.issuer,
    });

    // Additional detailed config logging
    console.log('Detailed OAuth Config Values:', {
        oauthUrl: appConfig.oauthUrl,
        tokenUrl: appConfig.tokenUrl,
        clientId: appConfig.clientId,
        issuer: appConfig.issuer,
        derivedUserinfoUrl: appConfig.tokenUrl.replace('/connect/token', '/connect/userinfo'),
    });

    // Build the correct redirect URI to match your OAuth client configuration
    //const redirectUri = `${appConfig.webappUrl}/auth/callback/pika`;
    const redirectUri = `${appConfig.webappUrl}/auth/callback`;
    console.log('Using redirect URI:', redirectUri);

    const provider: OAuth2Config<Profile> = {
        id: 'pika',
        name: 'Pika Auth',
        type: 'oauth' as const,
        issuer: appConfig.issuer,
        authorization: {
            url: appConfig.oauthUrl,
            params: {
                scope: 'openid profile company email offline_access',
                response_type: 'code',
                code_challenge_method: 'S256', // PKCE
                redirect_uri: redirectUri, // Override the default redirect URI
            },
        },
        token: {
            url: appConfig.tokenUrl,
            request: async (context: {
                params: any; // Contains code, state, code_verifier, etc.
                checks: OAuthChecks; // Security checks like PKCE validation
                provider: any;
            }) => {
                console.log('🔥 CUSTOM TOKEN REQUEST CALLED!');
                console.log('Context params:', context.params);
                console.log('Context checks:', context.checks);
                console.log('Provider:', context.provider);
                console.log('Redirect URI:', redirectUri);
                console.log('Client ID:', appConfig.clientId);
                console.log('Code:', context.params.code);
                console.log('Code verifier:', context.params.code_verifier);

                const body = new URLSearchParams();
                body.append('grant_type', 'authorization_code');
                body.append('client_id', appConfig.clientId);
                body.append('code', context.params.code!);
                body.append('redirect_uri', redirectUri);
                body.append('code_verifier', context.params.code_verifier!);

                const response = await fetch(appConfig.tokenUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                    },
                    body: body.toString(),
                });

                const tokens = await response.json();
                return { tokens };
            },
        },
        userinfo: {
            url: appConfig.tokenUrl.replace('/connect/token', '/connect/userinfo'),
        },
        clientId: appConfig.clientId,
        // clientSecret: null, // Explicitly no client secret for PKCE
        checks: ['pkce', 'state'], // Enable PKCE, state, and nonce checks

        client: {
            token_endpoint_auth_method: 'none',
        },

        profile(profile: any, tokens: any) {
            console.log('Profile callback - OAuth Provider Claims:', {
                iss: profile.iss, // This is what the provider claims to be
                sub: profile.sub,
                aud: profile.aud,
                name: profile.name,
                email: profile.email,
                allClaims: Object.keys(profile),
            });

            console.log('Processing profile data:', {
                profileId: profile.sub,
                profileName: profile.name,
                profileEmail: profile.email,
                hasTokens: !!tokens,
                tokenKeys: tokens ? Object.keys(tokens) : [],
            });

            // Transform the profile data to match your user structure
            const transformedProfile = {
                id: profile.sub,
                name: profile.name,
                email: profile.email,
                image: profile.picture,
            };

            console.log('Transformed profile:', transformedProfile);
            return transformedProfile;
        },
    };

    console.log('Complete Provider Config Summary:', {
        id: provider.id,
        issuer: provider.issuer,
        authorizationUrl: provider.authorization.url,
        tokenUrl: provider.token.url,
        userinfoUrl: provider.userinfo.url,
        clientId: provider.clientId,
    });

    console.log('Final provider object keys:', Object.keys(provider));
    console.log('Provider issuer specifically:', provider.issuer);

    return provider;
}

// Store the initialized auth handlers
let authHandlers: { handle: any; signIn: any; signOut: any } | null = null;

// Initialize auth after config is ready
export function initAuth() {
    if (authHandlers) {
        return authHandlers; // Already initialized
    }

    console.log('Initializing SvelteKitAuth...');

    authHandlers = SvelteKitAuth({
        providers: [CustomProvider()],
        secret: appConfig.masterCookieKey,
        session: {
            strategy: 'jwt', // Use JWT strategy since you're already using JWTs
        },
        callbacks: {
            async jwt({ token, account, profile, user }) {
                console.log('JWT Callback triggered with:', {
                    hasToken: !!token,
                    hasAccount: !!account,
                    hasProfile: !!profile,
                    hasUser: !!user,
                    tokenSubject: token?.sub,
                    accountType: account?.type,
                });

                // Handle token refresh and custom token logic here
                if (account && profile) {
                    console.log('First-time login detected, processing new authentication...');
                    console.log('Account data:', {
                        provider: account.provider,
                        type: account.type,
                        hasIdToken: !!account.id_token,
                        hasAccessToken: !!account.access_token,
                        hasRefreshToken: !!account.refresh_token,
                        expiresAt: account.expires_at,
                    });

                    // First time login - get user data from your platform API
                    try {
                        console.log('Building AuthData object...');
                        const authData: AuthData = {
                            idToken: {
                                idToken: account.id_token!,
                                claims: profile as unknown as IdTokenClaims,
                                expiresAt: account.expires_at,
                                authorizeUrl: appConfig.oauthUrl,
                                issuer: (profile as any).iss,
                                clientId: appConfig.clientId,
                            },
                            accessToken: {
                                accessToken: account.access_token!,
                                claims: account.access_token!,
                            },
                            refreshToken: account.refresh_token!,
                        };
                        console.log('AuthData built successfully');

                        console.log('Fetching user data from platform API...');
                        const platformUser = await getUserDataFromServer(appConfig.platformApiBaseUrl, authData);
                        console.log('Platform user data received:', {
                            userId: platformUser.userId,
                            email: platformUser.email,
                            firstName: platformUser.firstName,
                            lastName: platformUser.lastName,
                            companyId: platformUser.companyId,
                            companyName: platformUser.companyName,
                        });

                        // Handle chat user creation/retrieval
                        console.log('Checking for existing chat user...');
                        let chatUser = await getChatUser(platformUser.userId);

                        if (!chatUser) {
                            console.log('Chat user not found, creating new chat user...');
                            // Clone and get rid of the auth data which should not be stored in the chat database
                            const newChatUser = { ...platformUser } as any;
                            delete newChatUser.authData;
                            chatUser = await createChatUser(newChatUser);
                            console.log('New chat user created:', {
                                userId: chatUser?.userId,
                                features: Object.keys(chatUser?.features || {}),
                            });
                        } else {
                            console.log('Existing chat user found:', {
                                userId: chatUser.userId,
                                features: Object.keys(chatUser.features || {}),
                            });
                        }

                        // Store user data and auth tokens in the JWT
                        console.log('Storing user data and tokens in JWT...');
                        token.accessToken = account.access_token;
                        token.refreshToken = account.refresh_token;
                        token.expiresAt = account.expires_at;
                        token.user = {
                            ...platformUser,
                            features: chatUser?.features,
                        };
                        console.log('JWT token updated with user data and auth tokens');
                    } catch (error) {
                        console.error('Error during initial authentication:', error);
                        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
                        return null; // This will cause the sign-in to fail
                    }
                }

                // Check if token needs refresh
                if (token.expiresAt && typeof token.expiresAt === 'number') {
                    const expiresAtMs = token.expiresAt * 1000;
                    const nowMs = Date.now();
                    const timeUntilExpiry = expiresAtMs - nowMs;

                    console.log('Token expiry check:', {
                        expiresAt: new Date(expiresAtMs).toISOString(),
                        now: new Date(nowMs).toISOString(),
                        timeUntilExpiryMs: timeUntilExpiry,
                        isExpired: timeUntilExpiry < 0,
                    });

                    if (timeUntilExpiry < 0) {
                        console.log('Token expired, attempting refresh...');
                        try {
                            // Refresh the token
                            const body = new URLSearchParams({
                                grant_type: 'refresh_token',
                                client_id: appConfig.clientId,
                                refresh_token: token.refreshToken as string,
                            });

                            console.log('Making token refresh request to:', appConfig.tokenUrl);
                            const tokenResponse = await fetch(appConfig.tokenUrl, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                },
                                body,
                            });

                            console.log('Token refresh response status:', tokenResponse.status);

                            if (!tokenResponse.ok) {
                                const errorText = await tokenResponse.text();
                                console.error('Token refresh failed:', {
                                    status: tokenResponse.status,
                                    statusText: tokenResponse.statusText,
                                    error: errorText,
                                });
                                return null; // This will cause the user to be signed out
                            }

                            const tokens = await tokenResponse.json();
                            console.log('Token refresh successful:', {
                                hasAccessToken: !!tokens.access_token,
                                hasRefreshToken: !!tokens.refresh_token,
                                newExpiresAt: tokens.expires_at,
                            });

                            // Update the token with new values
                            token.accessToken = tokens.access_token;
                            token.refreshToken = tokens.refresh_token;
                            token.expiresAt = tokens.expires_at;
                            console.log('JWT updated with refreshed tokens');
                        } catch (error) {
                            console.error('Error refreshing token:', error);
                            console.error(
                                'Refresh error stack:',
                                error instanceof Error ? error.stack : 'No stack trace'
                            );
                            return null; // This will cause the user to be signed out
                        }
                    } else {
                        console.log('Token is still valid, no refresh needed');
                    }
                } else {
                    console.log('No expiration time found in token, skipping refresh check');
                }

                console.log('JWT callback completed successfully');
                return token;
            },
            async session({ session, token }) {
                console.log('Session Callback triggered:', {
                    hasSession: !!session,
                    hasToken: !!token,
                    sessionUserId: session?.user?.id,
                    tokenUserId: (token?.user as any)?.userId,
                });

                // Pass token data to session
                if (token) {
                    console.log('Copying token data to session...');
                    session.accessToken = token.accessToken as string;
                    session.refreshToken = token.refreshToken as string;
                    session.expiresAt = token.expiresAt as number;

                    if (token.user) {
                        session.user = token.user as any;
                        console.log('User data copied to session:', {
                            userId: session.user.userId,
                            email: session.user.email,
                            name: session.user.name,
                        });
                    } else {
                        console.log('No user data found in token');
                    }
                } else {
                    console.log('No token provided to session callback');
                }

                console.log('Session callback completed');
                return session;
            },
        },
        // Remove custom pages configuration to avoid conflicts with SvelteKit
        // We'll use the built-in Auth.js signin page
        trustHost: true, // Required for deployment
        events: {
            async signIn({ user, account, profile }) {
                console.log('Sign-in event triggered:', {
                    userId: user?.id,
                    provider: account?.provider,
                    profileId: profile?.sub,
                });
            },
        },
    });

    console.log('SvelteKitAuth initialization completed');
    return authHandlers;
}

// Export functions that will be available after initialization
export const getAuthHandlers = () => {
    if (!authHandlers) {
        throw new Error('Auth not initialized. Call initAuth() first.');
    }
    return authHandlers;
};

// For compatibility, export individual handlers (will throw if not initialized)
export const handle = (...args: any[]) => getAuthHandlers().handle(...args);
export const signIn = (...args: any[]) => getAuthHandlers().signIn(...args);
export const signOut = (...args: any[]) => getAuthHandlers().signOut(...args);
