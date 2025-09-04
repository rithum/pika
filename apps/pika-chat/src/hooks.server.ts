import { ForceUserToReauthenticateError, loadAuthProvider, NotAuthenticatedError } from '$lib/server/auth';
import type { AuthProvider } from '$lib/server/auth/types';
import { createChatUser, getChatUser } from '$lib/server/chat-apis';
import { appConfig } from '$lib/server/config';
import {
    clearAllCookies,
    serializeAuthenticatedUserToCookies,
    deserializeAuthenticatedUserFromCookies,
    deserializeUserOverrideDataFromCookies,
    deserializeContentAdminDataFromCookies,
    validateAllCookieVersions
} from '$lib/server/cookies';
import { KeyManager } from '$lib/server/encryption/KeyManager';
import { KeyManagerFactory } from '$lib/server/encryption/KeyManagerFactory';
import { addSecurityHeaders, arraysEqual, isUserAllowedToUseUserDataOverrides, isUserContentAdmin, mergeAuthenticatedUserWithExistingChatUser } from '$lib/server/utils';
import { redirect, type Handle, type RequestEvent, type ServerInit } from '@sveltejs/kit';
import deepEqual from 'deep-equal';
import type { AuthenticatedUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

let authProvider: AuthProvider<RecordOrUndef, RecordOrUndef> | undefined;
let keyManager: KeyManager | undefined;

// Initialize server configuration
export const init: ServerInit = async () => {
    await appConfig.init();

    // Initialize KeyManager for cookie encryption
    keyManager = new KeyManager(appConfig.ssmParameterPrefix, appConfig.kmsKeyAlias, appConfig.awsRegion, appConfig.keyRefreshIntervalHours, appConfig.maxKeyVersions);
    await keyManager.initialize();

    // Set the instance in the factory for admin access
    KeyManagerFactory.setInstance(keyManager);
};

export const handle: Handle = async ({ event, resolve }) => {
    // ===== Key Management =====

    // Refresh keys if needed (resilient to failures)
    if (keyManager) {
        try {
            await keyManager.refreshKeysIfNeeded();
        } catch (error) {
            console.warn('[Hooks] Key refresh failed, continuing with cached keys:', error);
            // Continue with existing cached keys - don't fail the request
        }
    }

    // ===== Special Route Handlers =====

    // Handle Chrome DevTools protocol for local development
    if (appConfig.isLocal && event.url.pathname.startsWith('/.well-known/appspecific/com.chrome.devtools')) {
        return new Response('OK', { status: 200 });
    }

    // Normalize pathname by removing trailing slash
    const pathName = event.url.pathname.endsWith('/') ? event.url.pathname.slice(0, -1) : event.url.pathname;

    // ===== Public Routes (No Auth Required) =====

    // Health check endpoint - accessible without authentication
    if (pathName === '/health') {
        // Return minimal response for load balancer health checks
        return new Response('OK', {
            status: 200,
            headers: {
                'Content-Type': 'text/plain'
            }
        });
    }

    let user: AuthenticatedUser<RecordOrUndef, RecordOrUndef> | undefined;
    authProvider = authProvider || (await loadAuthProvider());

    // Login page - accessible without authentication
    if (pathName === '/login') {
        await addToLocalsFromAuthProvider(pathName, event, authProvider, user);
        // Allow access to login page without authentication
        return addSecurityHeaders(await resolve(event));
    }

    if (pathName === '/logout') {
        await addToLocalsFromAuthProvider(pathName, event, authProvider, user);
        // Allow access to logout page without authentication
        return addSecurityHeaders(await resolve(event));
    }

    if (pathName === '/auth/client-auth') {
        await addToLocalsFromAuthProvider(pathName, event, authProvider, user);
        // Allow access to client auth page without authentication
        return addSecurityHeaders(await resolve(event));
    }

    // ===== Protected Routes (Auth Required) =====

    // Validate all cookie versions upfront for atomic authentication state management
    if (keyManager) {
        const validationResult = validateAllCookieVersions(event, keyManager);

        switch (validationResult.overallStatus) {
            case 'all_valid':
                // All cookies are compatible - proceed with normal deserialization
                user = deserializeAuthenticatedUserFromCookies(event, keyManager);
                break;

            case 'no_auth_cookie':
                // No AUTH_USER cookie - user needs to authenticate
                user = undefined;
                break;

            case 'version_mismatch':
            case 'error':
                // Cookie version issues detected - clear all cookies atomically
                console.warn('[Hooks] Cookie version compatibility issues detected - clearing all cookies and forcing reauthentication', {
                    overallStatus: validationResult.overallStatus,
                    cookieDetails: validationResult.details
                });
                clearAllCookies(event);
                user = undefined;
                break;
        }
    } else {
        // KeyManager unavailable - force reauthentication for pilot phase
        console.warn('[Hooks] KeyManager unavailable - forcing reauthentication');
        user = undefined;
    }

    // ===== ChatUser Refresh Logic =====
    let needsSerializationDueToChatUserChanges = false;

    if (user) {
        // If we have a user from cookies, refresh their ChatUser data periodically
        const now = Date.now();
        // Internal users we refresh every 30 seconds, external users we refresh once every 5 minutes
        let userRefreshIntervalMs = user.userType === 'internal-user' ? 30 * 1000 : 5 * 60 * 1000;

        // Check if we need to refresh ChatUser data
        let shouldRefreshChatUser = false;
        const lastChatUserRefresh = user.lastChatUserRefresh ? new Date(user.lastChatUserRefresh).getTime() : 0;

        if (now - lastChatUserRefresh > userRefreshIntervalMs) {
            shouldRefreshChatUser = true;
            // console.log('[Hooks] ChatUser refresh needed:', {
            //     userId: user.userId,
            //     lastRefreshAgo: Math.floor((now - lastChatUserRefresh) / 1000),
            //     intervalSeconds: Math.floor(userRefreshIntervalMs / 1000)
            // });
        }

        if (shouldRefreshChatUser) {
            try {
                // Get current ChatUser data from DynamoDB
                const currentChatUser = await getChatUser(user.userId);
                // console.log('[Hooks Debug] Raw ChatUser from database:', {
                //     userId: user.userId,
                //     fullChatUser: currentChatUser,
                //     hasRolesField: 'roles' in (currentChatUser || {}),
                //     rolesValue: currentChatUser?.roles,
                //     rolesType: typeof currentChatUser?.roles
                // });

                if (!currentChatUser) {
                    // ChatUser should exist if we have a valid cookie user - something is wrong
                    console.error('[Hooks] ChatUser not found for authenticated user - clearing cookies and forcing re-login:', {
                        userId: user.userId
                    });
                    clearAllCookies(event);
                    return redirect(302, '/login');
                }

                // Detect if core user data controlled by Pika has changed
                let coreDataChanged = false;

                const firstNameChanged = user.firstName !== currentChatUser.firstName;
                const lastNameChanged = user.lastName !== currentChatUser.lastName;
                const userTypeChanged = user.userType !== currentChatUser.userType;
                const rolesChanged = !arraysEqual(user.roles, currentChatUser.roles);
                const viewingContentForChanged = !deepEqual(user.viewingContentFor, currentChatUser.viewingContentFor);

                // console.log('[Hooks Debug] Individual field comparisons:', {
                //     userId: user.userId,
                //     firstName: {
                //         cookie: user.firstName,
                //         chatUser: currentChatUser.firstName,
                //         changed: firstNameChanged
                //     },
                //     lastName: {
                //         cookie: user.lastName,
                //         chatUser: currentChatUser.lastName,
                //         changed: lastNameChanged
                //     },
                //     userType: {
                //         cookie: user.userType,
                //         chatUser: currentChatUser.userType,
                //         changed: userTypeChanged
                //     },
                //     roles: {
                //         cookie: user.roles,
                //         chatUser: currentChatUser.roles,
                //         changed: rolesChanged
                //     },
                //     viewingContentFor: {
                //         cookie: user.viewingContentFor,
                //         chatUser: currentChatUser.viewingContentFor,
                //         changed: viewingContentForChanged
                //     }
                // });

                if (firstNameChanged || lastNameChanged || userTypeChanged || rolesChanged || viewingContentForChanged) {
                    coreDataChanged = true;
                    // console.log('[Hooks] Core user data changed in ChatUser:', {
                    //     userId: user.userId,
                    //     cookieData: {
                    //         firstName: user.firstName,
                    //         lastName: user.lastName,
                    //         userType: user.userType,
                    //         roles: user.roles,
                    //         viewingContentFor: user.viewingContentFor
                    //     },
                    //     chatUserData: {
                    //         firstName: currentChatUser.firstName,
                    //         lastName: currentChatUser.lastName,
                    //         userType: currentChatUser.userType,
                    //         roles: currentChatUser.roles,
                    //         viewingContentFor: currentChatUser.viewingContentFor
                    //     }
                    // });
                }

                // Check if custom data has changed
                const cookieCustomData = JSON.stringify(user.customData || {});
                const chatUserCustomData = JSON.stringify(currentChatUser.customData || {});
                const customDataChanged = cookieCustomData !== chatUserCustomData;

                // if (customDataChanged) {
                //     console.log('[Hooks] Custom data changed in ChatUser:', {
                //         userId: user.userId,
                //         cookieCustomData: user.customData,
                //         chatUserCustomData: currentChatUser.customData
                //     });
                // }

                // Merge ChatUser data into the cookie user
                if (coreDataChanged || customDataChanged) {
                    user = {
                        ...user,
                        firstName: currentChatUser.firstName || user.firstName,
                        lastName: currentChatUser.lastName || user.lastName,
                        userType: currentChatUser.userType || user.userType,
                        roles: currentChatUser.roles || user.roles,
                        viewingContentFor: currentChatUser.viewingContentFor || user.viewingContentFor,
                        customData: currentChatUser.customData || user.customData
                    };

                    needsSerializationDueToChatUserChanges = true;
                    // console.log('[Hooks] Merged ChatUser data into cookie user - cookie will be updated');
                }

                // Update lastChatUserRefresh timestamp
                user.lastChatUserRefresh = new Date().toISOString();
                // Always update cookie if we performed a refresh to update the timestamp
                if (!needsSerializationDueToChatUserChanges) {
                    needsSerializationDueToChatUserChanges = true;
                    // Mark this as a timestamp-only update for accurate logging
                    (user as any)._timestampOnlyUpdate = true;
                }
            } catch (error) {
                console.error('[Hooks] Error refreshing ChatUser data:', error);
                // Don't fail the request, just log the error and continue
                // Update timestamp anyway to prevent repeated failures
                user.lastChatUserRefresh = new Date().toISOString();
                needsSerializationDueToChatUserChanges = true;
                // Mark this as a timestamp-only update for accurate logging
                (user as any)._timestampOnlyUpdate = true;
            }
        }
    }

    if (!user) {
        // No user cookie - attempt initial authentication
        try {
            // Attempt authentication
            const authResult = await authProvider.authenticate(event);

            if (authResult.authenticatedUser) {
                // User authenticated successfully
                user = authResult.authenticatedUser;

                // Handle chat user creation/retrieval
                let chatUser = await getChatUser(user.userId);

                if (!chatUser) {
                    // Clone and get rid of the auth data which should not be stored in the chat database
                    const newChatUser = { ...user } as any;
                    delete newChatUser.authData;
                    // console.log('[Hooks Debug] Creating new ChatUser with data:', {
                    //     userId: user.userId,
                    //     newChatUserRoles: newChatUser.roles,
                    //     originalUserRoles: user.roles
                    // });
                    chatUser = await createChatUser(newChatUser);
                    // console.log('[Hooks Debug] Created ChatUser result:', {
                    //     userId: user.userId,
                    //     createdChatUserRoles: chatUser?.roles,
                    //     success: !!chatUser
                    // });
                } else {
                    // console.log('[Hooks Debug] Found existing ChatUser, merging roles:', {
                    //     userId: user.userId,
                    //     existingChatUserRoles: chatUser.roles,
                    //     userRoles: user.roles
                    // });
                    // We need to merge in any existing pika:xxx roles that exist in the chat user database that may have been added indepently of the auth provider
                    mergeAuthenticatedUserWithExistingChatUser(user, chatUser);
                    // console.log('[Hooks Debug] After merging roles:', {
                    //     userId: user.userId,
                    //     mergedUserRoles: user.roles,
                    //     chatUserRoles: chatUser.roles
                    // });
                }

                // Serialize the user to cookies using versioned approach
                if (keyManager) {
                    serializeAuthenticatedUserToCookies(event, user, keyManager);
                } else {
                    console.error('[Hooks] KeyManager unavailable - cannot serialize cookies');
                    throw new Error('KeyManager required for cookie serialization');
                }
            }

            if (authResult.redirectTo) {
                // Handle redirects, OAuth flows, etc.
                return authResult.redirectTo;
            }

            if (!user) {
                // No user - we are not authenticated and need to redirect to the login page
                return redirect(302, '/login');
            }
        } catch (error) {
            if (error instanceof NotAuthenticatedError) {
                // Clear any invalid cookies
                clearAllCookies(event);
                // Redirect to login
                return redirect(302, '/login');
            }
            // Re-throw other errors
            throw error;
        }
    }

    // Give the auth provider a chance to validate/refresh the user's authentication
    let needsSerializationDueToAuthProvider = false;

    if (authProvider.validateUser && user) {
        try {
            // Pass the cookie max age (12 hours in milliseconds) for server-side validation
            const maxCookieAgeMs = appConfig.cookieMaxAgeHours * 60 * 60 * 1000; // Convert hours to milliseconds
            const validationResult = await authProvider.validateUser(event, user, maxCookieAgeMs);

            if (validationResult) {
                // Provider returned updated user with refreshed tokens
                user = validationResult;
                needsSerializationDueToAuthProvider = true;
                // console.log('[Hooks] Auth provider returned updated user - cookie needs updating');
            }
            // If validationResult is undefined, no action needed
        } catch (error) {
            if (error instanceof ForceUserToReauthenticateError) {
                // Clear cookies
                clearAllCookies(event);

                // Check if this error allows retry (e.g., idle timeout)
                if (error.allowRetry) {
                    const url = new URL(event.url);
                    if (url.searchParams.has('auth_retry')) {
                        // Already tried once - circuit breaker activated
                        console.log('[Hooks] Auth retry failed, redirecting to login');
                        return redirect(302, '/login');
                    }
                    // First retry attempt - add parameter and redirect to same URL
                    url.searchParams.set('auth_retry', '1');
                    console.log('[Hooks] Retrying authentication due to idle timeout, redirecting to:', url.pathname + url.search);
                    return redirect(302, url.pathname + url.search);
                } else {
                    // Security violation - go directly to login
                    console.log('[Hooks] Security violation detected, redirecting to login');
                    return redirect(302, '/login');
                }
            }
            // Re-throw other errors
            throw error;
        }
    }

    // Update cookies if needed (either from auth provider changes or ChatUser changes)
    if (needsSerializationDueToAuthProvider || needsSerializationDueToChatUserChanges) {
        const reasons = [];
        if (needsSerializationDueToAuthProvider) reasons.push('auth provider updates');
        if (needsSerializationDueToChatUserChanges) {
            // Check if this is just a timestamp update or actual data changes
            if ((user as any)._timestampOnlyUpdate) {
                reasons.push('ChatUser timestamp refresh');
            } else {
                reasons.push('ChatUser data changes');
            }
        }

        // Only log if there are actual data changes (not just timestamp updates)
        if (!(user as any)._timestampOnlyUpdate) {
            console.log('[Hooks] Updating user cookies due to:', reasons.join(' and '));
        }
        // Uncomment the line below if you want to debug timestamp-only updates
        // console.log('[Hooks] Updating user cookies due to:', reasons.join(' and '));

        // Clean up the temporary flag
        delete (user as any)._timestampOnlyUpdate;

        // Update cookies using versioned approach
        if (keyManager) {
            serializeAuthenticatedUserToCookies(event, user, keyManager);
        } else {
            console.error('[Hooks] KeyManager unavailable - cannot serialize cookies');
            throw new Error('KeyManager required for cookie serialization');
        }
    }

    // If the user is allowed to use the user data overrides feature, we need to deserialize the user override data from cookies
    // and merge it with the user object.
    if (isUserAllowedToUseUserDataOverrides(user)) {
        if (keyManager) {
            const userOverrideData = deserializeUserOverrideDataFromCookies(event, keyManager);
            if (userOverrideData) {
                user.overrideData = userOverrideData.data;
            }
            // Note: No need for individual cookie clearing here since we validate all cookies upfront
        } else {
            console.warn('[Auth] KeyManager not available for user override data deserialization');
        }
    }

    // If the user is allowed to use the content admin feature, we need to deserialize the content admin data from cookies
    // and merge it with the user object.
    if (isUserContentAdmin(user)) {
        if (keyManager) {
            const contentAdminData = deserializeContentAdminDataFromCookies(event, keyManager);
            if (contentAdminData) {
                user.viewingContentFor = contentAdminData.data;
            }
            // Note: No need for individual cookie clearing here since we validate all cookies upfront
        } else {
            console.warn('[Auth] KeyManager not available for content admin data deserialization');
        }
    }

    // Set user, config, and keyManager in locals for server-side use
    event.locals = { user, appConfig, authProvider, keyManager };

    // Clean up auth_retry parameter if authentication was successful
    if (user) {
        const url = new URL(event.url);
        if (url.searchParams.has('auth_retry')) {
            console.log('[Hooks] Authentication successful, cleaning up auth_retry parameter');
            url.searchParams.delete('auth_retry');
            // Redirect to clean URL - this removes the parameter
            return redirect(302, url.pathname + url.search);
        }
    }

    await addToLocalsFromAuthProvider(pathName, event, authProvider, user);

    // If this is the logout now path, then we need to call the logout method on the auth provider and clear the cookies
    if (pathName === '/logout-now') {
        clearAllCookies(event);
        let redirectTo = '/login';
        if (authProvider.logout) {
            let path: string | undefined = await authProvider.logout(event, user);
            if (path) {
                redirectTo = path;
            }
        }
        return redirect(302, redirectTo);
    }

    // Process the request to whatever route they were going to with security headers
    return addSecurityHeaders(await resolve(event));
};

/**
 * Add data to the locals from the auth provider.  This is useful for adding values to the locals for the route that are not part of the
 * AuthenticatedUser object.  For example, lets say that you redirect to /auth/client-auth since you need to start authentication
 * from the client side.  Maybe you need some URLs in the client side so you can start the auth process.  You can add them to the
 * locals object and then access them in the +page.server.ts of your route and then pass then into your +page.svelte.
 *
 * @param event - The request event (so you can check the path)
 * @param authProvider - The auth provider
 * @param user - The authenticated user (if there is one)
 */
async function addToLocalsFromAuthProvider(
    pathName: string,
    event: RequestEvent,
    authProvider: AuthProvider<RecordOrUndef, RecordOrUndef> | undefined,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef> | undefined
): Promise<void> {
    if (!authProvider || !authProvider.addValueToLocalsForRoute) {
        return;
    }

    const dataToAddToLocals = await authProvider.addValueToLocalsForRoute(pathName, event, user);
    if (dataToAddToLocals) {
        event.locals = { ...(event.locals ?? {}), customData: dataToAddToLocals };
    }
}
