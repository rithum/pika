import type { ChatUser, RecordOrUndef } from '@pika/shared/types/chatbot/chatbot-types';

export class IdentityState {
    #user = $state<ChatUser<RecordOrUndef>>() as ChatUser<RecordOrUndef>;
    #isInternalUser = $derived(this.#user && this.#user.userType === 'internal-user');
    fullName = $derived.by(() => {
        return this.#user.firstName && this.#user.lastName ? `${this.#user.firstName} ${this.#user.lastName}` : 'YOU';
    });

    initials = $derived.by(() => {
        return this.#user.firstName && this.#user.lastName
            ? `${this.#user.firstName.charAt(0)}${this.#user.lastName.charAt(0)}`
            : 'U';
    });

    constructor(user: ChatUser) {
        this.#user = user;
        console.log('IdentityState constructor', user);
    }

    get user() {
        return this.#user;
    }

    get isInternalUser() {
        return this.#isInternalUser;
    }

    updateUserOverrideData(chatAppId: string, data: RecordOrUndef) {
        if (!this.#user.overrideData) {
            this.#user.overrideData = {};
        }
        this.#user.overrideData[chatAppId] = data;
    }

    clearUserOverrideData(chatAppId: string) {
        if (!this.#user.overrideData) {
            return;
        }
        delete this.#user.overrideData[chatAppId];
    }

    async logout() {
        //TODO: Implement logout
    }
}
