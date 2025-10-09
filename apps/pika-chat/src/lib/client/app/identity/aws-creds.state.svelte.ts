import { checkClientResponseAndBody, handleClientError } from '$lib/client/util';
import type { ShowToastFn, UserAwsCredentials, UserAwsCredentialsResponse } from 'pika-shared/types/chatbot/chatbot-types';
import type { FetchZ } from '../types';

export class AwsCredsState {
    #fetchz: FetchZ;
    #awsCredentials = $state<UserAwsCredentials | undefined>(undefined);
    #retrievingAwsCredentials = $state(false);

    #showToast: ShowToastFn;

    constructor(fetchz: FetchZ, showToast: ShowToastFn) {
        this.#fetchz = fetchz;
        this.#showToast = showToast;
    }

    get retrievingAwsCredentials() {
        return this.#retrievingAwsCredentials;
    }

    async #getAwsCredentialsFromServer(): Promise<UserAwsCredentials | undefined> {
        try {
            this.#retrievingAwsCredentials = true;
            const resp = await this.#fetchz('/api/aws-creds');

            // Check for token expiration requiring re-authentication
            if (resp.status === 401) {
                const json = await resp.json();
                if (json.requiresReauth || json.error === 'TOKEN_EXPIRED') {
                    //-console.log('[AWS Creds] Cognito token expired, redirecting to force re-authentication');
                    // Build the force-reauth URL with current page as return URL
                    const currentPath = window.location.pathname + window.location.search;
                    const returnUrl = encodeURIComponent(currentPath);
                    window.location.href = `/force-reauth?return_url=${returnUrl}`;
                    // Return pending promise to prevent further execution
                    return new Promise(() => {});
                }
            }

            const json = await checkClientResponseAndBody<UserAwsCredentialsResponse>(resp, 'getting AWS credentials', this.#showToast);
            this.#awsCredentials = json.awsCredentials;
            return this.#awsCredentials;
        } catch (error) {
            handleClientError(error, 'getting AWS credentials', this.#showToast);
            throw error;
        } finally {
            this.#retrievingAwsCredentials = false;
        }
    }

    async getAwsCredentials(): Promise<UserAwsCredentials> {
        // Check if credentials exist and if they're expired or expiring soon
        if (this.#awsCredentials) {
            const expirationDate = new Date(this.#awsCredentials.expiration);
            const now = new Date();
            const bufferMs = 10 * 1000; // 10 seconds buffer

            if (expirationDate.getTime() <= now.getTime() + bufferMs) {
                // Credentials are expired or expiring soon, clear them
                this.#awsCredentials = undefined;
            }
        }

        // If no credentials or they were expired, fetch new ones
        if (!this.#awsCredentials) {
            await this.#getAwsCredentialsFromServer();
        }

        if (!this.#awsCredentials) {
            throw new Error('AWS credentials not available');
        }

        return this.#awsCredentials;
    }
}
