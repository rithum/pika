import type { ChatUser } from '@pika/shared/types/chatbot/chatbot-types';

export class IdentityState {
    #user = $state<ChatUser>() as ChatUser;
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
    }

    get user() {
        return this.#user;
    }

    async logout() {
        //TODO: Implement logout
    }
}
