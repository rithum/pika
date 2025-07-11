import { getCodeChar, getHotKeyDisplay, getHotKeyForDisplay } from '$lib/utils';
import { AppSettingsState } from './settings/app-settings.state.svelte';
import type { FetchZ, HotKey } from './types';
import { IsMobile } from '$lib/hooks/is-mobile.svelte';
import type {
    ChatApp,
    ChatUser,
    ChatAppOverridableFeatures,
    CustomDataUiRepresentation,
    SiteFeatures,
    ChatAppMode,
} from '@pika/shared/types/chatbot/chatbot-types';
import type { Page } from '@sveltejs/kit';
import { ChatAppState } from '../features/chat/chat-app.state.svelte';
import { IdentityState } from './identity/identity.state.svelte';
import type { ComponentRegistry } from '../features/chat/message-segments/component-registry';
import type { UserDataOverrideSettings } from '@pika/shared/types/chatbot/chatbot-types';
import { SiteAdminState } from '../features/site-admin/site-admin.state.svelte';

export class AppState {
    #settings: AppSettingsState | undefined;
    #chatApps: Record<string, ChatAppState> = {};
    #identity: IdentityState;
    #siteAdmin: SiteAdminState | undefined;

    #page: Page | undefined;
    #isMobile: IsMobile;
    #hotKeys: Record<string, HotKey> = {};

    addHotKey(hotKey: HotKey) {
        const display = getHotKeyDisplay(hotKey);
        if (this.#hotKeys[display]) {
            throw new Error(`Hotkey ${display} already added to the app state`);
        }
        this.#hotKeys[display] = hotKey;
    }

    removeHotKey(hotKey: HotKey) {
        delete this.#hotKeys[getHotKeyDisplay(hotKey)];
    }

    checkForHotKey(e: KeyboardEvent) {
        const key = getCodeChar(e.code);

        if (!key || key.length !== 1) {
            // Have to have a key to check for a hotkey
            return;
        }

        const hotKeyStr = getHotKeyForDisplay(e.altKey, e.ctrlKey, e.shiftKey, e.metaKey, key);
        const hotKey = this.#hotKeys[hotKeyStr];
        if (hotKey && hotKey.fn) {
            hotKey.fn();
        }
    }

    constructor(
        private readonly fetchz: FetchZ,
        user: ChatUser
    ) {
        this.#isMobile = new IsMobile();
        this.#identity = new IdentityState(user);
    }

    addChatApp(
        chatApp: ChatApp,
        componentRegistry: ComponentRegistry,
        userDataOverrideSettings: UserDataOverrideSettings,
        userIsContentAdmin: boolean,
        features: ChatAppOverridableFeatures,
        customDataUiRepresentation: CustomDataUiRepresentation | undefined,
        mode: ChatAppMode
    ): ChatAppState {
        if (!this.#page) {
            throw new Error('Page object is not set in app state when trying to add chat app');
        }

        const chatAppState = this.getChatApp(chatApp.chatAppId);
        if (chatAppState) {
            chatAppState.chatApp = chatApp;
        } else {
            this.#chatApps[chatApp.chatAppId] = new ChatAppState(
                this.fetchz,
                chatApp,
                this.#page,
                this,
                componentRegistry,
                userDataOverrideSettings,
                userIsContentAdmin,
                features,
                customDataUiRepresentation,
                mode
            );
        }
        return this.#chatApps[chatApp.chatAppId];
    }

    addSiteAdminState(chatApps: ChatApp[], siteFeatures: SiteFeatures, page: Page): SiteAdminState {
        this.#siteAdmin = new SiteAdminState(this.fetchz, this, chatApps, siteFeatures, page);
        return this.#siteAdmin;
    }

    getChatApp(chatAppId: string): ChatAppState | undefined {
        return this.#chatApps[chatAppId];
    }

    get siteAdmin() {
        if (!this.#siteAdmin) {
            throw new Error('Site admin state is not set in app state');
        }
        return this.#siteAdmin;
    }

    get identity() {
        return this.#identity;
    }

    get hotKeys() {
        return this.#hotKeys;
    }

    get isMobile() {
        return this.#isMobile.current;
    }

    get settings() {
        if (!this.#settings) {
            this.#settings = new AppSettingsState();
        }
        return this.#settings;
    }

    set page(page: Page) {
        this.#page = page;
    }

    // closeAllFloatingSidebars() {
    //     if (this.appSidebarFloating && this.#appSidebarState) {
    //         if (this.isMobile) {
    //             this.#appSidebarState.setOpenMobile(false);
    //         } else {
    //             this.#appSidebarState.setOpen(false);
    //         }
    //     }
    //     if (this.#help) {
    //         if (this.#help.helpShowing) {
    //             this.#help.helpShowing = false;
    //         }
    //         if (this.#help.searchShowing) {
    //             this.#help.searchShowing = false;
    //         }
    //     }
    // }
    // }

    // async initializeIdentity(crypto: Crypto) {
    //     console.log('Initializing identity');
    //     const secureStore = await this.getSecureStore();
    //     await this.#identity.initialize(crypto, secureStore);
    // }

    // async logout() {
    //     await this.#identity.logout();
    // }

    /** Lazy initialize the help state */
    // get help() {
    //     if (!this.#help) {
    //         this.#help = new HelpState(this.fetchz, () => this.closeAllFloatingSidebars(), this);
    //     }
    //     return this.#help;
    // }
}
