import type { ChatUser, ChatUserLite, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import type { ShowToastFn } from '../types';

export class IdentityState {
    #user = $state<ChatUser<RecordOrUndef>>() as ChatUser<RecordOrUndef>;
    #isInternalUser = $derived(this.#user && this.#user.userType === 'internal-user');
    #isSiteAdmin = $derived(this.#user && this.#user.roles?.includes('pika:site-admin'));
    #isContentAdmin = $derived(this.#user && this.#user.roles?.includes('pika:content-admin'));
    fullName = $derived.by(() => {
        return this.#user.firstName && this.#user.lastName ? `${this.#user.firstName} ${this.#user.lastName}` : 'YOU';
    });

    initials = $derived.by(() => {
        return this.#user.firstName && this.#user.lastName ? `${this.#user.firstName.charAt(0)}${this.#user.lastName.charAt(0)}` : 'U';
    });

    #showToast: ShowToastFn;

    constructor(user: ChatUser, showToast: ShowToastFn) {
        this.#user = user;
        this.#showToast = showToast;
    }

    get showToast() {
        return this.#showToast;
    }

    get user() {
        return this.#user;
    }

    get isSiteAdmin() {
        return this.#isSiteAdmin;
    }

    get isInternalUser() {
        return this.#isInternalUser;
    }

    get isContentAdmin() {
        return this.#isContentAdmin;
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

    /**
     * Updates the user data reactively when server-side changes are detected
     */
    updateUser(newUser: ChatUser<RecordOrUndef>) {
        // console.log('[Identity] User updated:', { userId: newUser.userId, firstName: newUser.firstName });
        this.#user = newUser;
    }

    async logout() {
        //TODO: Implement logout
    }
}
