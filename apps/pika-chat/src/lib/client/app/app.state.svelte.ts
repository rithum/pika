import { IsMobile } from '$lib/hooks/is-mobile.svelte';
import { getCodeChar, getHotKeyDisplay, getHotKeyForDisplay } from '$lib/utils';
import type { Page } from '@sveltejs/kit';
import type {
    ChatApp,
    ChatAppLite,
    ChatAppMode,
    ChatAppOverridableFeatures,
    ChatUser,
    CustomDataUiRepresentation,
    HomePageSiteFeature,
    LogoutFeature,
    SiteFeatures,
    TagDefinition,
    TagDefinitionWidget,
    UserDataOverrideSettings
} from 'pika-shared/types/chatbot/chatbot-types';
import { ChatAppState } from '../features/chat/chat-app.state.svelte';
import type { ComponentRegistry } from '../features/chat/message-segments/component-registry';
import { SiteAdminState } from '../features/site-admin/site-admin.state.svelte';
import { IdentityState } from './identity/identity.state.svelte';
import { AppSettingsState } from './settings/app-settings.state.svelte';
import type { FetchZ, HotKey, ShowToastFn } from './types';

export class AppState {
    #settings: AppSettingsState | undefined;
    #chatApps = $state<Record<string, ChatAppState>>({});
    #identity: IdentityState;
    #siteAdmin: SiteAdminState | undefined;
    showLogoutDialog = $state<boolean>(false);

    #homePageSiteFeature = $state<HomePageSiteFeature | undefined>(undefined);
    #logoutSiteFeature = $state<LogoutFeature | undefined>(undefined);
    #allChatApps = $state<ChatAppLite[]>([]);

    // This is a site-wide version of this setting, if in a chat app, it will have a version
    // that may be specific to the chat app
    #customDataUiRepresentation: CustomDataUiRepresentation | undefined;
    #page: Page | undefined;
    #isMobile: IsMobile;
    #showToast: ShowToastFn;
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
        user: ChatUser,
        customDataUiRepresentation: CustomDataUiRepresentation | undefined,
        homePageSiteFeature: HomePageSiteFeature | undefined,
        logoutSiteFeature: LogoutFeature | undefined,
        allChatApps: ChatAppLite[],
        showToast: ShowToastFn
    ) {
        this.#isMobile = new IsMobile();
        this.#identity = new IdentityState(user, showToast);
        this.#customDataUiRepresentation = customDataUiRepresentation;
        this.#homePageSiteFeature = homePageSiteFeature;
        this.#logoutSiteFeature = logoutSiteFeature;
        this.#allChatApps = allChatApps;
        this.#showToast = showToast;
    }

    addChatApp(
        chatApp: ChatApp,
        componentRegistry: ComponentRegistry,
        userDataOverrideSettings: UserDataOverrideSettings,
        userIsContentAdmin: boolean,
        features: ChatAppOverridableFeatures,
        // Note we are passing this in here and not using the global one because we want to be able to
        // override the custom data ui representation for a specific chat app
        customDataUiRepresentation: CustomDataUiRepresentation | undefined,
        mode: ChatAppMode,
        tagDefinitions: TagDefinition<TagDefinitionWidget>[]
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
                mode,
                tagDefinitions,
                this.#showToast
            );
        }
        return this.#chatApps[chatApp.chatAppId];
    }

    addSiteAdminState(chatApps: ChatApp[], siteFeatures: SiteFeatures, page: Page, componentRegistry: ComponentRegistry): SiteAdminState {
        this.#siteAdmin = new SiteAdminState(this.fetchz, this, chatApps, siteFeatures, page, componentRegistry, this.#identity, this.#showToast);
        return this.#siteAdmin;
    }

    getChatApp(chatAppId: string): ChatAppState | undefined {
        return this.#chatApps[chatAppId];
    }

    get showToast() {
        return this.#showToast;
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
            this.#settings = new AppSettingsState(this.#showToast);
        }
        return this.#settings;
    }

    get customDataUiRepresentation() {
        return this.#customDataUiRepresentation;
    }

    set customDataUiRepresentation(value: CustomDataUiRepresentation | undefined) {
        this.#customDataUiRepresentation = value;
    }

    set page(page: Page) {
        this.#page = page;
    }

    get homePageSiteFeature() {
        return this.#homePageSiteFeature;
    }

    get logoutSiteFeature() {
        return this.#logoutSiteFeature;
    }

    get allChatApps() {
        return this.#allChatApps;
    }

    /**
     * Updates the user data across all relevant state objects when server-side changes are detected
     */
    updateUser(newUser: ChatUser) {
        this.#identity.updateUser(newUser);
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
