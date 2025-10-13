import type { FetchZ } from '$client/app/types';
import type { IUserWidgetDataStoreState, ShowToastFn, UserWidgetData } from 'pika-shared/types/chatbot/chatbot-types';

export class UserWidgetDataStoreState implements IUserWidgetDataStoreState {
    #initialized = $state(false);
    #data = $state<UserWidgetData | undefined>(undefined);
    #showToast: ShowToastFn;
    #scope: string;
    #tag: string;

    constructor(
        private readonly fetchz: FetchZ,
        scope: string,
        tag: string,
        showToast: ShowToastFn
    ) {
        this.#scope = scope;
        this.#tag = tag;
        this.#showToast = showToast;
    }

    get showToast() {
        return this.#showToast;
    }

    get initialized() {
        return this.#initialized;
    }

    get data() {
        return this.#data;
    }

    async refreshDataFromServer() {
        const response = await this.fetchz(`/api/widget/${this.#scope}/${this.#tag}/data`, {
            method: 'GET'
        });

        if (response.ok) {
            const json = await response.json();
            this.#data = json.data;
            this.#initialized = true;
        }
    }

    async getValue<T>(key: string): Promise<T | undefined> {
        if (!this.#initialized) {
            await this.refreshDataFromServer();
        }
        return this.#data?.[key] as T | undefined;
    }

    async setValue(key: string, value: unknown) {
        const newValues = { [key]: value };

        const response = await this.fetchz(`/api/widget/${this.#scope}/${this.#tag}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: newValues, partial: true })
        });

        if (response.ok) {
            const data = await response.json();
            this.#data = data.values;
        }
    }

    async deleteValue(key: string) {
        const newValues = { [key]: null };

        const response = await this.fetchz(`/api/widget/${this.#scope}/${this.#tag}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: newValues, partial: true })
        });

        if (response.ok) {
            const data = await response.json();
            this.#data = data.data;
        }
    }
}
