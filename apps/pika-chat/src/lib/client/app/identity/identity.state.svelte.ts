import type { ChatUser, ChatUserLite, RecordOrUndef } from '@pika/shared/types/chatbot/chatbot-types';

export class IdentityState {
    #user = $state<ChatUser<RecordOrUndef>>() as ChatUser<RecordOrUndef>;
    #isInternalUser = $derived(this.#user && this.#user.userType === 'internal-user');
    fullName = $derived.by(() => {
        return this.#user.firstName && this.#user.lastName ? `${this.#user.firstName} ${this.#user.lastName}` : 'YOU';
    });

    initials = $derived.by(() => {
        return this.#user.firstName && this.#user.lastName ? `${this.#user.firstName.charAt(0)}${this.#user.lastName.charAt(0)}` : 'U';
    });

    constructor(user: ChatUser) {
        this.#user = user;
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

    updateViewingContentFor(chatAppId: string, data: ChatUserLite) {
        if (!this.#user.viewingContentFor) {
            this.#user.viewingContentFor = {};
        }
        this.#user.viewingContentFor[chatAppId] = data;
    }

    clearUserOverrideData(chatAppId: string) {
        if (!this.#user.overrideData) {
            return;
        }
        delete this.#user.overrideData[chatAppId];
    }

    clearViewingContentFor(chatAppId: string) {
        if (!this.#user.viewingContentFor) {
            return;
        }
        delete this.#user.viewingContentFor[chatAppId];
    }

    async logout() {
        //TODO: Implement logout
    }
}
