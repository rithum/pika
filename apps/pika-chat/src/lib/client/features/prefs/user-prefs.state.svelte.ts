import type { FetchZ } from '$client/app/types';
import { checkClientResponseAndBody, CLIENT_RESOURCE_NAMES, handleClientError } from '$lib/client/util';
import type { GetChatUserPrefsResponse, SetChatUserPrefsRequest, SetChatUserPrefsResponse, ShowToastFn, UserPrefs } from 'pika-shared/types/chatbot/chatbot-types';
import type { IUserPrefsState } from 'pika-shared/types/chatbot/webcomp-types';

export class UserPrefsState implements IUserPrefsState {
    #prefs = $state<UserPrefs>();
    #initialized = $state(false);
    #showToast: ShowToastFn;

    constructor(
        private readonly fetchz: FetchZ,
        showToast: ShowToastFn
    ) {
        this.#showToast = showToast;
    }

    get showToast() {
        return this.#showToast;
    }

    get initialized() {
        return this.#initialized;
    }

    get prefs() {
        return this.#prefs;
    }

    async refreshPrefsFromServer() {
        try {
            const response = await this.fetchz('/api/prefs', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            // Use unified function for HTTP status + response body checking
            const json = await checkClientResponseAndBody<GetChatUserPrefsResponse>(
                response,
                'loading user preferences',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.SETTINGS,
                'Failed to load your preferences. Please refresh the page.'
            );

            this.#prefs = json.prefs ?? {};
            this.#initialized = true;
        } catch (error) {
            handleClientError(error, 'loading user preferences', this.#showToast);
            throw error;
        }
    }

    /**
     * Get a single pref by its key.
     *
     * @param key - The key of the pref to get
     * @returns The value of the pref, or undefined if the pref is not set
     */
    async getPref<T>(key: string): Promise<T | undefined> {
        if (!this.#initialized) {
            await this.refreshPrefsFromServer();
        }
        return this.#prefs?.[key] as T | undefined;
    }

    /**
     * Modify a single pref.  Doesn't modify other prefs.
     *
     * To delete a pref, set the value to null.
     *
     * @param key - The key of the pref to modify
     * @param value - The value to set the pref to
     */
    async modifyPref(key: string, value: unknown) {
        const request: SetChatUserPrefsRequest = {
            prefs: {
                [key]: value
            },
            partial: true
        };
        try {
            const response = await this.fetchz('/api/prefs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
            });

            // Use unified function for HTTP status + response body checking
            const json = await checkClientResponseAndBody<SetChatUserPrefsResponse>(
                response,
                'saving user preference',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.SETTINGS,
                'Failed to save your preference. Please try again.'
            );

            this.#prefs = json.prefs ?? {};
        } catch (error) {
            handleClientError(error, 'saving user preference', this.#showToast);
            throw error;
        }
    }
}
