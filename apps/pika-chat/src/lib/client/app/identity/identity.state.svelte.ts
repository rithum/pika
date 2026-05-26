import type { ChatUser, ChatUserLite, RecordOrUndef, ShowToastFn, UserAwsCredentials } from 'pika-shared/types/chatbot/chatbot-types';
import type { IIdentityState } from 'pika-shared/types/chatbot/webcomp-types';
import type { FetchZ } from '../types';
import { AwsCredsState } from './aws-creds.state.svelte';
import { isInternalUser } from '$lib/custom/effective-user';

export class IdentityState implements IIdentityState {
    #fetchz: FetchZ;
    #user = $state<ChatUser<RecordOrUndef>>() as ChatUser<RecordOrUndef>;
    #isInternalUser = $derived(this.#user && isInternalUser(this.#user));
    #isSiteAdmin = $derived(this.#user && this.#user.roles?.includes('pika:site-admin'));
    #isContentAdmin = $derived(this.#user && this.#user.roles?.includes('pika:content-admin'));
    #awsCredsState = $state<AwsCredsState | undefined>(undefined);

    fullName = $derived.by(() => {
        return this.#user.firstName && this.#user.lastName ? `${this.#user.firstName} ${this.#user.lastName}` : 'YOU';
    });

    initials = $derived.by(() => {
        return this.#user.firstName && this.#user.lastName ? `${this.#user.firstName.charAt(0)}${this.#user.lastName.charAt(0)}` : 'U';
    });

    #showToast: ShowToastFn;

    constructor(user: ChatUser, showToast: ShowToastFn, fetchz: FetchZ) {
        this.#user = user;
        this.#showToast = showToast;
        this.#fetchz = fetchz;
    }

    get showToast() {
        return this.#showToast;
    }

    get user() {
        return this.#user;
    }

    get isSiteAdmin() {
        return this.#isSiteAdmin ?? false;
    }

    get isInternalUser() {
        return this.#isInternalUser;
    }

    get isContentAdmin() {
        return this.#isContentAdmin ?? false;
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

    async getUserAwsCredentials(): Promise<UserAwsCredentials | undefined> {
        if (!this.#awsCredsState) {
            this.#awsCredsState = new AwsCredsState(this.#fetchz, this.#showToast);
        }
        return this.#awsCredsState.getAwsCredentials();
    }
}
