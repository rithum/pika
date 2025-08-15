import type { FetchZ } from '$client/app/types';
import type { GetChatUserPrefsResponse, SetChatUserPrefsRequest, SetChatUserPrefsResponse, UserPrefs } from 'pika-shared/types/chatbot/chatbot-types';

export class UserPrefsState {
    #prefs = $state<UserPrefs>();
    #initialized = $state(false);

    constructor(private readonly fetchz: FetchZ) {}

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

            if (!response.ok) {
                throw new Error('Failed to refresh prefs from server');
            }

            const json: GetChatUserPrefsResponse = await response.json();
            if (!json.success) {
                throw new Error(`Failed to refresh prefs from server: ${json.error}`);
            }
            this.#prefs = json.prefs ?? {};

            this.#initialized = true;
        } catch (ex) {
            console.error('Error refreshing prefs from server', ex);
            throw ex;
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

            if (!response.ok) {
                throw new Error('Failed to modify pref');
            }

            const json: SetChatUserPrefsResponse = await response.json();
            if (!json.success) {
                throw new Error(`Failed to modify pref: ${json.error}`);
            }
            this.#prefs = json.prefs ?? {};
        } catch (ex) {
            console.error('Error modifying pref', ex);
            throw ex;
        }
    }
}
