import type { FetchZ } from '$client/app/types';
import type { AppState } from '$lib/client/app/app.state.svelte';
import type { SidebarState } from '$ui/shadcn/sidebar/context.svelte';
import type {
    AddChatSessionFeedbackResponse,
    ChatAppMode,
    ChatSession,
    ChatUserLite,
    CreateOrUpdateChatAppOverrideResponse,
    DeleteChatAppOverrideResponse,
    GetValuesForEntityAutoCompleteResponse,
    GetValuesForUserAutoCompleteResponse,
    RefreshChatAppResponse,
    SessionSearchResponse,
    SimpleOption,
    SiteAdminCommand,
    SiteAdminRequest,
    SiteAdminResponse,
    SiteFeatures,
    UpdateChatSessionFeedbackResponse
} from 'pika-shared/types/chatbot/chatbot-types';
import { type ChatApp } from 'pika-shared/types/chatbot/chatbot-types';
import type { Page } from '@sveltejs/kit';
import type { Snippet } from 'svelte';
import { SiteAdminNavState } from './nav/site-admin-nav.state.svelte';
import type { ServerSideTableState } from '$ui/pika/pika-table/types';
import { UserPrefsState } from '$client/features/prefs/user-prefs.state.svelte';
import { SessionInsightsState } from './components/session-insights/session-insights.state.svelte';
import type { ComponentRegistry } from '../chat/message-segments/component-registry';
import type { IdentityState } from '$lib/client/app/identity/identity.state.svelte';

export class SiteAdminState {
    #appState: AppState;
    #identity: IdentityState;
    #chatApps = $state<ChatApp[]>([]);
    #siteFeatures = $state<SiteFeatures>();
    #nav = $state<SiteAdminNavState>() as SiteAdminNavState;
    #pageTitle = $state<string | undefined>(undefined);
    #pageHeaderRight = $state<Snippet | undefined>(undefined);
    #mode: ChatAppMode = $state('standalone');
    #chatSessions = $state<ChatSession[]>([]);
    #sessionInsights = $state<SessionInsightsState>() as SessionInsightsState;
    #userPrefs = $state<UserPrefsState>() as UserPrefsState;
    #sessionsPagination = $state<ServerSideTableState>({
        pageIndex: 0,
        pageSize: 20,
        totalRecords: 0,
        scrollId: undefined as string | undefined,
        hasNextPage: false,
        isLoading: false,
        error: undefined as string | undefined,
        sorting: [],
        columnFilters: [],
        requestId: ''
    });
    valuesForInternalEntityAutoComplete = $state<SimpleOption[] | undefined>(undefined);
    valuesForExternalEntityAutoComplete = $state<SimpleOption[] | undefined>(undefined);
    valuesForAutoCompleteForUserAccessControl = $state<ChatUserLite[] | undefined>(undefined);
    #componentRegistry: ComponentRegistry;

    siteAdminOperationInProgress: Record<SiteAdminCommand, boolean> = $state({
        getInitialData: false,
        refreshChatApp: false,
        createOrUpdateChatAppOverride: false,
        deleteChatAppOverride: false,
        getValuesForEntityAutoComplete: false,
        getValuesForUserAutoComplete: false,
        clearChatAppCache: false,
        addChatSessionFeedback: false,
        updateChatSessionFeedback: false,
        sessionSearch: false,
        getChatMessagesAsAdmin: false
    });

    #appSidebarState: SidebarState | undefined;
    #appSidebarOpen = $derived.by(() => {
        if (!this.#appSidebarState) {
            return false;
        }
        return this.#appState.isMobile ? this.#appSidebarState.openMobile : this.#appSidebarState.open;
    });

    constructor(
        private readonly fetchz: FetchZ,
        appState: AppState,
        chatApps: ChatApp[],
        siteFeatures: SiteFeatures,
        page: Page,
        componentRegistry: ComponentRegistry,
        identity: IdentityState
    ) {
        this.#chatApps = chatApps;
        this.#siteFeatures = siteFeatures;
        this.#appState = appState;
        this.#nav = new SiteAdminNavState(page, siteFeatures);
        this.#userPrefs = new UserPrefsState(this.fetchz);
        this.#componentRegistry = componentRegistry;
        this.#identity = identity;
    }

    get sessionInsights() {
        if (!this.#sessionInsights) {
            this.#sessionInsights = new SessionInsightsState(this.fetchz, this.#userPrefs, this.#componentRegistry, this.#identity);
        }
        return this.#sessionInsights;
    }

    get userPrefs() {
        return this.#userPrefs;
    }

    get chatSessions() {
        return this.#chatSessions;
    }

    get sessionsPagination() {
        return this.#sessionsPagination;
    }

    get chatApps() {
        return this.#chatApps;
    }

    get siteFeatures() {
        return this.#siteFeatures;
    }

    get mode() {
        return this.#mode;
    }

    get nav() {
        return this.#nav!;
    }

    get pageTitle() {
        return this.#pageTitle;
    }

    get pageHeaderRight() {
        return this.#pageHeaderRight;
    }

    setPageTitle(title: string) {
        this.#pageTitle = title;
    }

    setPageHeaderRight(rightHeaderArea: Snippet | undefined) {
        this.#pageHeaderRight = rightHeaderArea;
    }

    setPageHeader(title: string, rightHeaderArea?: Snippet) {
        this.#pageTitle = title;
        this.#pageHeaderRight = rightHeaderArea;
    }

    get appSidebarState(): SidebarState | undefined {
        return this.#appSidebarState;
    }

    get appSidebarOpen() {
        return this.#appSidebarOpen;
    }

    set appSidebarState(value: SidebarState) {
        this.#appSidebarState = value;
    }

    set appSidebarOpen(value: boolean) {
        if (!this.#appSidebarState) {
            return;
        }
        if (this.#appState.isMobile) {
            this.#appSidebarState.setOpenMobile(this.#appState.isMobile);
        } else {
            this.#appSidebarState.setOpen(value);
        }
    }

    get appSidebarFloating() {
        return this.#appState.isMobile && this.#appSidebarOpen;
    }

    async sendSiteAdminCommand(request: SiteAdminRequest) {
        try {
            this.siteAdminOperationInProgress[request.command] = true;
            const response = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                //TODO: handle error
                throw new Error('Failed to send site admin command');
            }

            const json: SiteAdminResponse = await response.json();
            if (!json) {
                throw new Error('Invalid response for site admin command');
            } else if ('success' in json && json.success === false) {
                //TODO: throw a toast
                throw new Error(json.error);
            } else if (request.command === 'getValuesForEntityAutoComplete') {
                const values = (json as GetValuesForEntityAutoCompleteResponse).data ?? undefined;
                if (request.type === 'internal-user') {
                    this.valuesForInternalEntityAutoComplete = values;
                } else if (request.type === 'external-user') {
                    this.valuesForExternalEntityAutoComplete = values;
                }
            } else if (request.command === 'getValuesForUserAutoComplete') {
                this.valuesForAutoCompleteForUserAccessControl = (json as GetValuesForUserAutoCompleteResponse).data ?? undefined;
            } else if (request.command === 'refreshChatApp') {
                const response = json as RefreshChatAppResponse;
                // Replace the chat app in the list with the new one if it's there
                const idx = this.#chatApps.findIndex((chatApp) => chatApp.chatAppId === response.chatApp.chatAppId);
                if (idx !== -1) {
                    this.#chatApps[idx] = response.chatApp;
                } else {
                    this.#chatApps.push(response.chatApp);
                }
            } else if (request.command === 'createOrUpdateChatAppOverride') {
                const response = json as CreateOrUpdateChatAppOverrideResponse;
                const idx = this.#chatApps.findIndex((chatApp) => chatApp.chatAppId === request.chatAppId);
                if (idx !== -1) {
                    this.#chatApps[idx].override = response.chatAppOverride;
                } else {
                    // Didn't find the chat app to add/update the override for, so throw an error, shouldn't happen
                    throw new Error(`Chat app ${request.chatAppId} not found when creating or updating chat app override`);
                }
            } else if (request.command === 'deleteChatAppOverride') {
                const response = json as DeleteChatAppOverrideResponse;
                const idx = this.#chatApps.findIndex((chatApp) => chatApp.chatAppId === request.chatAppId);
                if (idx !== -1) {
                    delete this.#chatApps[idx].override;
                } else {
                    // Didn't find the chat app to delete the override for, so throw an error, shouldn't happen
                    throw new Error(`Chat app ${request.chatAppId} not found when deleting chat app override`);
                }
            } else if (request.command === 'clearChatAppCache') {
                if (!request.chatAppId) {
                    throw new Error('chatAppId is required for clearChatAppCache');
                }
                await this.sendSiteAdminCommand({
                    command: 'refreshChatApp',
                    chatAppId: request.chatAppId
                });
            } else if (request.command === 'addChatSessionFeedback') {
                const response = json as AddChatSessionFeedbackResponse;
                const feedback = response.feedback;
                const idx = this.#chatSessions.findIndex((session) => session.sessionId === feedback.sessionId);
                if (idx !== -1) {
                    if (!this.#chatSessions[idx].feedback) {
                        this.#chatSessions[idx].feedback = [];
                    }
                    this.#chatSessions[idx].feedback.push(feedback);
                }
            } else if (request.command === 'updateChatSessionFeedback') {
                const response = json as UpdateChatSessionFeedbackResponse;
                const feedback = response.feedback;
                const idx = this.#chatSessions.findIndex((session) => session.sessionId === feedback.sessionId);
                if (idx !== -1) {
                    if (!this.#chatSessions[idx].feedback) {
                        this.#chatSessions[idx].feedback = [];
                    }
                    const feedbackIdx = this.#chatSessions[idx].feedback.findIndex((f) => f.feedbackId === feedback.feedbackId);
                    if (feedbackIdx !== -1) {
                        this.#chatSessions[idx].feedback[feedbackIdx] = feedback;
                    } else {
                        this.#chatSessions[idx].feedback.push(feedback);
                    }
                }
            } else if (request.command === 'sessionSearch') {
                const response = json as SessionSearchResponse;

                // Update data
                this.#chatSessions = response.sessions;

                // Update pagination metadata
                this.#sessionsPagination.totalRecords = response.total;
                this.#sessionsPagination.pageSize = response.pageSize;
                this.#sessionsPagination.scrollId = response.scrollId;
                this.#sessionsPagination.hasNextPage = !!response.scrollId;
                this.#sessionsPagination.isLoading = false;
                this.#sessionsPagination.error = undefined;
            }
        } catch (e) {
            console.error('Error sending content admin command', e);
            throw e;
        } finally {
            this.siteAdminOperationInProgress[request.command] = false;
        }
    }
}
