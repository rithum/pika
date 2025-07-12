import { appConfig } from '$lib/server/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import type { AuthenticatedUser, AuthenticateResult } from '@pika/shared/types/chatbot/chatbot-types';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import type { RequestEvent } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import https from 'https';
import { AuthProvider, ForceUserToReauthenticateError } from '../auth/types';

// Custom auth data types - modify these for your auth provider
export interface CustomAuthData extends Record<string, string | undefined> {
    accessToken: string;
    userId: string;
    lastValidated?: string; // Track when we last validated (as ISO string)
    // Add your auth-specific fields here
}

export interface AuthSuccessResponse {
    access_token: string;
    user_id: string;
    refresh_token?: string;
    expires_in?: number;
    // Add your auth provider's success response fields here
}

export interface AuthErrorResponse {
    error: string;
    error_description?: string;
    // Add your auth provider's error response fields here
}

export type AuthResponse = AuthSuccessResponse | AuthErrorResponse;

export interface ExternalUser {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    roles?: string[];
    is_admin?: boolean;
    // Add your external user data structure here
    permissions?: {
        account_ids?: string[];
        organization_ids?: string[];
        // Add your permission structure here
    };
}

export interface CustomUserData extends Record<string, string | undefined> {
    email?: string;
    organizationId?: string;
    accountType?: string; // Customize account types for your domain
    // Add your custom user data fields here
}

export default class CustomAuthProvider extends AuthProvider<CustomAuthData, CustomUserData> {
    private ddbDocClient: DynamoDBDocument;

    constructor(stage: string) {
        super(stage);

        const ddbClient = new DynamoDBClient({
            region: appConfig.awsRegion,
            maxAttempts: 5,
            requestHandler: new NodeHttpHandler({
                connectionTimeout: 2000,
                requestTimeout: 5000,
                httpsAgent: new https.Agent({
                    ciphers: 'ALL',
                }),
            }),
        });
        this.ddbDocClient = DynamoDBDocument.from(ddbClient, {
            marshallOptions: {
                convertEmptyValues: true,
                removeUndefinedValues: true,
            },
        });
    }

    async authenticate(event: RequestEvent): Promise<AuthenticateResult<CustomAuthData, CustomUserData>> {
        console.log(`[Custom Auth Provider] Starting authentication process for stage: ${this.stage}`);

        // TODO: Replace with your auth provider's URLs
        const domain = `https://${this.stage === 'prod' ? 'api' : `${this.stage}-api`}.yourcompany.com`;
        const tokenUrl = `${domain}/auth/token`;
        const adminTokenUrl = `${domain}/admin/auth/token`;
        const loginUrl = `${domain}/login`;
        const adminLoginUrl = `${domain}/admin/login`;

        // Extract cookies from the incoming request
        const cookieHeader = event.request.headers.get('cookie');
        const headers: Record<string, string> = {};

        if (cookieHeader) {
            headers['Cookie'] = cookieHeader;
        } else {
            console.warn('[Custom Auth Provider] No cookies found in request - redirecting to login');
            return redirect(302, loginUrl);
        }

        // Add additional headers that might be needed for authentication
        headers['Accept'] = 'application/json, text/plain, */*';
        headers['User-Agent'] =
            event.request.headers.get('user-agent') || 'Mozilla/5.0 (compatible; Custom-Auth-Provider)';
        headers['Referer'] = event.url.origin;

        const urls = [adminTokenUrl, tokenUrl];
        let lastErr: Error | undefined;
        let lastResponse: Response | undefined;

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const isAdminAttempt = i === 0;

            console.log(
                `[Custom Auth Provider] Attempt ${i + 1}/${urls.length}: ${isAdminAttempt ? 'Admin' : 'Regular'} auth at ${url}`
            );

            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers,
                    credentials: 'include',
                });
                lastResponse = response;

                console.log(`[Custom Auth Provider] Response status: ${response.status} ${response.statusText}`);

                if (response.status === 302) {
                    // Handle redirect response
                    const location = response.headers.get('location');
                    console.log(`[Custom Auth Provider] Received 302 redirect to: ${location}`);
                    if (location) {
                        return redirect(302, location);
                    }
                }

                if (!response.ok) {
                    console.warn(
                        `[Custom Auth Provider] Request failed with status ${response.status}, trying next URL`
                    );
                    continue; // Try next URL
                }

                // Log the raw response content before parsing JSON
                const responseText = await response.text();
                console.log(`[Custom Auth Provider] Response content length: ${responseText.length}`);

                // Try to parse as JSON
                let data: AuthResponse;
                try {
                    data = JSON.parse(responseText) as AuthResponse;
                } catch (parseError) {
                    console.error(
                        `[Custom Auth Provider] Failed to parse response as JSON, not authenticated:`,
                        parseError
                    );
                    continue; // Try next URL
                }

                // Check for error response
                if ('error' in data) {
                    const errorMsg = data.error.toLowerCase();
                    if (errorMsg.includes('expired')) {
                        console.error(`[Custom Auth Provider] Session expired, redirecting to login`);
                        return redirect(302, isAdminAttempt ? adminLoginUrl : loginUrl);
                    }

                    if (errorMsg.includes('unauthorized') || errorMsg.includes('invalid')) {
                        console.error(`[Custom Auth Provider] User not logged in, redirecting to login`);
                        return redirect(302, isAdminAttempt ? adminLoginUrl : loginUrl);
                    }

                    console.error(`[Custom Auth Provider] Authentication error:`, data.error);
                    continue; // Try next URL
                }

                // Validate success response
                const successData = data as AuthSuccessResponse;
                if (!successData.access_token) {
                    console.error(`[Custom Auth Provider] Access token is undefined, not authenticated`);
                    continue; // Try next URL
                }

                if (!successData.user_id) {
                    console.error(`[Custom Auth Provider] User ID is undefined, not authenticated`);
                    continue; // Try next URL
                }

                console.log(
                    `[Custom Auth Provider] Received auth data - User ID: ${successData.user_id}, Token length: ${successData.access_token?.length || 0}`
                );

                const externalUser = await this.getExternalUserById(successData.user_id);

                if (!externalUser) {
                    console.error(
                        `[Custom Auth Provider] User not found in external system for user_id: ${successData.user_id}`
                    );
                    throw new Error('User not found in external system');
                }

                console.log(`[Custom Auth Provider] Found external user:`, {
                    id: externalUser.id,
                    email: externalUser.email,
                    roles: externalUser.roles,
                });

                const authenticatedUser = this.createAuthenticatedUser(externalUser, successData);
                console.log(`[Custom Auth Provider] Successfully created authenticated user:`, {
                    userId: authenticatedUser.userId,
                });

                return { authenticatedUser };
            } catch (e) {
                console.error(
                    `[Custom Auth Provider] Authentication attempt ${i + 1} failed:`,
                    e instanceof Error ? e.message : e
                );
                lastErr = e as Error;
                continue; // Try next URL
            }
        }

        // If we get here, all authentication attempts failed
        console.error(`[Custom Auth Provider] All authentication attempts failed`);
        console.error(`[Custom Auth Provider] Last error:`, lastErr);
        console.error(`[Custom Auth Provider] Last response status:`, lastResponse?.status);

        if (lastResponse?.status === 302) {
            const location = lastResponse.headers.get('location');
            console.log(`[Custom Auth Provider] Redirecting due to 302 response to: ${location}`);
            if (location) {
                return redirect(302, location);
            }
        }

        // Redirect to appropriate login page
        const isAdminAttempt = urls[0] === adminTokenUrl;
        const loginRedirectUrl = isAdminAttempt ? adminLoginUrl : loginUrl;

        console.log(`[Custom Auth Provider] Redirecting to login: ${loginRedirectUrl}`);

        return redirect(302, loginRedirectUrl);
    }

    async validateUser(
        event: RequestEvent,
        user: AuthenticatedUser<CustomAuthData, CustomUserData>
    ): Promise<AuthenticatedUser<CustomAuthData, CustomUserData> | undefined> {
        if (!user.authData) {
            throw new Error('User authData is missing in validateUser');
        }

        console.log(
            `[Custom Auth Provider] Validating user session for user: ${user.userId}, userId: ${user.authData.userId}`
        );

        // Time-based validation - only validate every 5 minutes
        const VALIDATION_INTERVAL = 5 * 60 * 1000; // 5 minutes
        const now = Date.now();
        const lastValidated = user.authData.lastValidated ? new Date(user.authData.lastValidated).getTime() : 0;

        // Skip validation if we validated recently
        if (now - lastValidated < VALIDATION_INTERVAL) {
            console.log(
                `[Custom Auth Provider] Skipping validation - last validated ${Math.round((now - lastValidated) / 1000)} seconds ago`
            );
            return undefined; // Session is still considered valid
        }

        console.log(
            `[Custom Auth Provider] Performing validation - last validated ${Math.round((now - lastValidated) / 1000)} seconds ago`
        );

        // Proceed with actual validation since enough time has passed
        try {
            // TODO: Replace with your auth provider's validation URLs
            const domain = `https://${this.stage === 'prod' ? 'api' : `${this.stage}-api`}.yourcompany.com`;
            const tokenUrl = `${domain}/auth/validate`;
            const adminTokenUrl = `${domain}/admin/auth/validate`;

            console.log(`[Custom Auth Provider] Validation using domain: ${domain}`);

            const cookieHeader = event.request.headers.get('cookie');
            const headers: Record<string, string> = {};

            if (cookieHeader) {
                headers['Cookie'] = cookieHeader;
                console.log(`[Custom Auth Provider] Found cookies for validation, length: ${cookieHeader.length}`);
            } else {
                console.warn('[Custom Auth Provider] No cookies found during validation');
                throw new ForceUserToReauthenticateError('No cookies found');
            }

            // Add additional headers that might be needed for authentication
            headers['Accept'] = 'application/json, text/plain, */*';
            headers['User-Agent'] =
                event.request.headers.get('user-agent') || 'Mozilla/5.0 (compatible; Custom-Auth-Provider)';
            headers['Referer'] = event.url.origin;

            // Try to validate the current session
            const urls = [adminTokenUrl, tokenUrl];
            let isValid = false;

            console.log(`[Custom Auth Provider] Attempting session validation with ${urls.length} URLs`);

            for (let i = 0; i < urls.length; i++) {
                const url = urls[i];
                const isAdminAttempt = i === 0;

                console.log(
                    `[Custom Auth Provider] Validation attempt ${i + 1}/${urls.length}: ${isAdminAttempt ? 'Admin' : 'Regular'} at ${url}`
                );

                try {
                    const response = await fetch(url, {
                        method: 'GET',
                        headers,
                        credentials: 'include',
                    });

                    console.log(
                        `[Custom Auth Provider] Validation response status: ${response.status} ${response.statusText}`
                    );

                    if (response.ok) {
                        // Log the raw response content before parsing JSON
                        const responseText = await response.text();
                        console.log(
                            `[Custom Auth Provider] Validation response content length: ${responseText.length}`
                        );

                        // Try to parse as JSON
                        let data: AuthResponse;
                        try {
                            data = JSON.parse(responseText) as AuthResponse;
                        } catch (parseError) {
                            console.error(
                                `[Custom Auth Provider] Failed to parse validation response as JSON:`,
                                parseError
                            );
                            continue; // Try next URL
                        }

                        // Check for error response
                        if ('error' in data) {
                            console.error(`[Custom Auth Provider] Validation response contains error:`, data.error);
                            continue; // Try next URL
                        }

                        const authData = data as AuthSuccessResponse;

                        console.log(`[Custom Auth Provider] Validation response data - User ID: ${authData.user_id}`);

                        // Check if the user_id matches
                        if (authData.user_id === user.authData.userId) {
                            console.log(`[Custom Auth Provider] User ID matches, session is valid`);
                            isValid = true;
                            break;
                        } else {
                            console.warn(
                                `[Custom Auth Provider] User ID mismatch - Expected: ${user.authData.userId}, Got: ${authData.user_id}`
                            );
                        }
                    } else {
                        console.warn(`[Custom Auth Provider] Validation request failed with status ${response.status}`);
                    }
                } catch (e) {
                    console.error(`[Custom Auth Provider] Validation attempt ${i + 1} failed:`, e);
                    continue;
                }
            }

            if (!isValid) {
                console.error(`[Custom Auth Provider] Session validation failed - user needs to reauthenticate`);
                throw new ForceUserToReauthenticateError('Session expired');
            }

            console.log(`[Custom Auth Provider] Session validation successful - updating lastValidated timestamp`);

            // Update the lastValidated timestamp to avoid frequent re-validation
            const updatedUser = { ...user };
            if (updatedUser.authData) {
                updatedUser.authData = {
                    accessToken: updatedUser.authData.accessToken,
                    userId: updatedUser.authData.userId,
                    lastValidated: new Date(now).toISOString(),
                };
            }

            return updatedUser; // Return updated user with new timestamp
        } catch (error) {
            console.error(`[Custom Auth Provider] Session validation error:`, error);
            if (error instanceof ForceUserToReauthenticateError) {
                throw error;
            }
            throw new ForceUserToReauthenticateError('Session validation failed');
        }
    }

    private async getExternalUserById(userId: string): Promise<ExternalUser | undefined> {
        // TODO: Replace with your user lookup mechanism
        // Option 1: Database lookup
        const userTableName = appConfig.getArbitraryConfigValue('USER_TABLE_NAME') || 'users';

        console.log(`[Custom Auth Provider] Looking up user in table: ${userTableName} for user: ${userId}`);

        try {
            const user = await this.ddbDocClient.get({
                TableName: userTableName,
                Key: {
                    user_id: userId,
                },
            });

            if (!user.Item) {
                console.warn(`[Custom Auth Provider] User not found in database for user_id: ${userId}`);
                return undefined;
            }

            return user.Item as ExternalUser;
        } catch (error) {
            console.error(`[Custom Auth Provider] Error looking up user:`, error);
            return undefined;
        }

        // Option 2: External API call
        /*
        try {
            const response = await fetch(`https://your-api.com/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.API_TOKEN}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn(`[Custom Auth Provider] User API returned ${response.status} for user: ${userId}`);
                return undefined;
            }

            return await response.json() as ExternalUser;
        } catch (error) {
            console.error(`[Custom Auth Provider] Error calling user API:`, error);
            return undefined;
        }
        */
    }

    private createAuthenticatedUser(
        externalUser: ExternalUser,
        authData: AuthSuccessResponse
    ): AuthenticatedUser<CustomAuthData, CustomUserData> {
        console.log(`[Custom Auth Provider] Creating authenticated user from external data:`, {
            id: externalUser.id,
            email: externalUser.email,
            roles: externalUser.roles,
        });

        // Determine if user is internal employee
        const internalUser = externalUser.is_admin || externalUser.roles?.includes('admin') || false;
        console.log(
            `[Custom Auth Provider] User admin status: ${internalUser}, roles: ${externalUser.roles?.join(', ') || 'none'}`
        );

        // Determine account type based on your business logic
        let organizationId = externalUser.permissions?.organization_ids?.[0] || '';
        let accountType: string | undefined;

        // TODO: Customize this logic for your domain
        if (externalUser.permissions?.account_ids?.length) {
            accountType = 'premium'; // Example: determine based on account permissions
        } else {
            accountType = 'basic';
        }

        console.log(
            `[Custom Auth Provider] Account determination - Organization ID: ${organizationId}, Account Type: ${accountType}`
        );

        const authenticatedUser: AuthenticatedUser<CustomAuthData, CustomUserData> = {
            userId: externalUser.id,
            firstName: externalUser.first_name || '',
            lastName: externalUser.last_name || '',
            userType: internalUser ? 'internal-user' : 'external-user',
            roles: [],
            authData: {
                accessToken: authData.access_token,
                userId: authData.user_id,
                lastValidated: new Date().toISOString(),
            },
            customData: {
                email: externalUser.email,
                organizationId,
                accountType,
            },
            features: {
                instruction: {
                    type: 'instruction' as const,
                    instruction: 'You are a helpful assistant.', // TODO: Customize for your domain
                },
                history: {
                    type: 'history' as const,
                    history: true,
                },
            },
        };

        console.log(`[Custom Auth Provider] Created authenticated user:`, {
            userId: authenticatedUser.userId,
            firstName: authenticatedUser.firstName,
            lastName: authenticatedUser.lastName,
            userType: authenticatedUser.userType,
            roles: authenticatedUser.roles,
        });

        return authenticatedUser;
    }
}
