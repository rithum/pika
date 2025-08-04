import type { FetchZ } from '$lib/client/app/types';
import type {
    SessionSearchRequest,
    SessionSearchResponse,
    ChatSession,
    RecordOrUndef,
    SessionSearchAdminRequest,
    ChatUserLite,
    GetValuesForAutoCompleteResponse,
    GetValuesForUserAutoCompleteResponse,
    ChatMessageForRendering,
    ChatMessagesResponse
} from '@pika/shared/types/chatbot/chatbot-types';
import { createDefaultSearchQuery } from './utils';
import type { AdvancedSearchState, SavedSearch, SimpleSearchState } from './types';
import type { UserPrefsState } from '$lib/client/features/prefs/user-prefs.state.svelte';
import cloneDeep from 'lodash.clonedeep';
import deepEqual from 'deep-equal';
import { untrack } from 'svelte';
import { MessageSegmentProcessor } from '$lib/client/features/chat/message-segments/segment-processor';
import type { ComponentRegistry } from '$lib/client/features/chat/message-segments/component-registry';

const DEFAULT_SEARCH_ERROR = 'Unknown error occurred while searching sessions.  Please try again later.';
const SAVED_SEARCHES_KEY = 'pika:admin:session-insights:saved-searches';

export class SessionInsightsState {
    #userPrefs: UserPrefsState;
    #sessions = $state<ChatSession<RecordOrUndef>[]>([]);
    #selectedSessions = $state<string[]>([]);
    #isSearching = $state(false);
    #isUpdatingUserPrefs = $state(false);
    #searchError = $state<string | undefined>(undefined);
    #totalResults = $state(0);
    #expandedRows = $state<Set<string>>(new Set());
    #savedSearches = $state<SavedSearch[]>([]);
    #lastSearchTimestamp = $state<Date | undefined>(undefined);
    #hasMore = $state(false);
    searchQuery = $state<SessionSearchRequest<RecordOrUndef>>() as SessionSearchRequest<RecordOrUndef>;
    #scrollId = $state<string | undefined>(undefined);
    #previousSearchQuery = $state<SessionSearchRequest<RecordOrUndef> | undefined>(undefined);
    timezone = $state<string>(Intl.DateTimeFormat().resolvedOptions().timeZone);
    valuesForUserAutoComplete = $state<ChatUserLite[] | undefined>(undefined);
    userAutoCompleteSearchInProgress = $state(false);
    sessionIdToShowMessagesForInline = $state<string | undefined>(undefined);
    #currentSession = $derived.by(() => {
        if (!this.sessionIdToShowMessagesForInline) {
            return undefined;
        }
        return this.#sessions.find((session) => session.sessionId === this.sessionIdToShowMessagesForInline);
    });
    #curSessionMessages = $state<ChatMessageForRendering[]>([]);
    #retrievingMessages = $state(false);
    #messageProcessor = $state<MessageSegmentProcessor>() as MessageSegmentProcessor;
    #componentRegistry: ComponentRegistry;

    constructor(
        private readonly fetchz: FetchZ,
        userPrefs: UserPrefsState,
        componentRegistry: ComponentRegistry
    ) {
        this.#userPrefs = userPrefs;
        this.#messageProcessor = new MessageSegmentProcessor(componentRegistry);
        this.loadSavedSearches();
        this.searchQuery = createDefaultSearchQuery();
        this.#componentRegistry = componentRegistry;

        $effect(() => {
            const query = this.searchQuery;
            const previousQuery = this.#previousSearchQuery;

            if (deepEqual(query, previousQuery)) {
                return;
            }

            this.performSearch();
        });

        $effect(() => {
            if (this.#currentSession) {
                this.refreshMessagesForCurrentSession();
            }
        });
    }

    get componentRegistry() {
        return this.#componentRegistry;
    }

    get retrievingMessages() {
        return this.#retrievingMessages;
    }

    get currentSession() {
        return this.#currentSession;
    }

    get currentSessionMessages() {
        return this.#curSessionMessages;
    }

    get scrollId() {
        return this.#scrollId;
    }

    get totalResults() {
        return this.#totalResults;
    }

    get lastSearchTimestamp() {
        return this.#lastSearchTimestamp;
    }

    get isSearching() {
        return this.#isSearching;
    }

    get savedSearches() {
        return this.#savedSearches;
    }

    get hasMore() {
        return this.#hasMore;
    }

    get selectedSessions() {
        return this.#selectedSessions;
    }

    get sessions() {
        return this.#sessions;
    }

    clearSelection() {
        this.#selectedSessions = [];
    }

    async refreshData() {
        this.#sessions = [];
        this.#hasMore = false;
        this.#totalResults = 0;
        this.#lastSearchTimestamp = undefined;
        this.#scrollId = undefined;
        this.performSearch();
    }

    private async loadSavedSearches() {
        const savedSearches = this.#userPrefs.getPref<SavedSearch[]>(SAVED_SEARCHES_KEY);
        this.#savedSearches = savedSearches ?? [];
    }

    async saveSearch(search: SavedSearch) {
        this.#savedSearches = [...this.#savedSearches, search];
        await this.#userPrefs.modifyPref(SAVED_SEARCHES_KEY, this.#savedSearches);
    }

    async loadMore() {
        if (!this.#hasMore) return;

        await this.performSearch(true);
    }

    async refreshMessagesForCurrentSession() {
        if (!this.#currentSession) {
            this.#curSessionMessages = [];
            return;
        }

        try {
            this.#retrievingMessages = true;
            const chatAppId = this.#currentSession.chatAppId;
            const resp = await this.fetchz(`/api/message/${chatAppId}/${this.#currentSession.sessionId}`);
            if (resp.ok) {
                const msgResult = (await resp.json()) as ChatMessagesResponse;
                if (msgResult.success) {
                    this.#curSessionMessages = msgResult.messages.map((msg) => this.#processMessageIntoSegments({ ...msg, segments: [] }, false));
                } else {
                    console.error('Error refreshing messages for current session', msgResult.error);
                }
            }
        } catch (e) {
            console.error('Error refreshing messages for current session', e);
        } finally {
            this.#retrievingMessages = false;
        }
    }

    #processMessageIntoSegments(message: ChatMessageForRendering, isStreaming: boolean): ChatMessageForRendering {
        this.#messageProcessor.parseMessage(message.message, message.segments, isStreaming);
        return message;
    }

    async getValuesForUserAutoComplete(valueProvidedByUser: string) {
        try {
            this.userAutoCompleteSearchInProgress = true;
            const response = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ command: 'getValuesForUserAutoComplete', valueProvidedByUser })
            });

            if (!response.ok) {
                throw new Error('Failed to get values for auto complete');
            }

            const responseBody = (await response.json()) as GetValuesForUserAutoCompleteResponse;

            if (!responseBody.success) {
                throw new Error('Failed to get values for auto complete');
            }

            this.valuesForUserAutoComplete = (responseBody.data ?? []) as ChatUserLite[];
        } finally {
            this.userAutoCompleteSearchInProgress = false;
        }
    }

    async performSearch(append = false) {
        if (this.#isSearching) return;

        this.#isSearching = true;
        this.#searchError = undefined;

        try {
            if (append && !this.#scrollId) {
                throw new Error('Cannot append to search without a scrollId');
            }

            if (!append) {
                this.#scrollId = undefined;
            }

            const savedQuery = cloneDeep(this.searchQuery);
            const query = { ...cloneDeep(this.searchQuery), scrollId: this.#scrollId };
            const titlePartial = (query.titlePartial ?? '').trim();
            query.titlePartial = titlePartial.length >= 3 ? titlePartial : undefined;

            let request: SessionSearchAdminRequest = {
                command: 'sessionSearch',
                search: query
            };

            const response = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                this.#searchError = DEFAULT_SEARCH_ERROR;
                console.error('Unknown error searching sessions', JSON.stringify(this.searchQuery, null, 2));
                return;
            }

            const responseBody = (await response.json()) as SessionSearchResponse<RecordOrUndef>;

            if (!responseBody.success) {
                this.#searchError = DEFAULT_SEARCH_ERROR;
                console.error('Unknown error searching sessions.  Error: ', responseBody.error, 'Response body:', JSON.stringify(responseBody, null, 2));
                return;
            }

            if (append) {
                this.#sessions.push(...responseBody.sessions);
            } else {
                this.#sessions = responseBody.sessions;
            }

            this.#previousSearchQuery = savedQuery;

            this.#scrollId = responseBody.scrollId;
            this.#hasMore = !!responseBody.scrollId;
            this.#totalResults = responseBody.total || 0;
            this.#lastSearchTimestamp = new Date();
        } catch (error) {
            console.error(`Error searching sessions: ${error instanceof Error ? error.message + ' ' + error.stack : error}`);
            this.#searchError = DEFAULT_SEARCH_ERROR;
        } finally {
            this.#isSearching = false;
        }
    }
}

// function setDatePreset(preset: 'today' | 'week' | 'month' | '3months') {
//     const now = new Date();
//     let start: Date;

//     switch (preset) {
//         case 'today':
//             start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
//             break;
//         case 'week':
//             start = new Date();
//             start.setDate(start.getDate() - 7);
//             break;
//         case 'month':
//             start = new Date();
//             start.setMonth(start.getMonth() - 1);
//             break;
//         case '3months':
//             start = new Date();
//             start.setMonth(start.getMonth() - 3);
//             break;
//     }

//     updateSimpleSearch({
//         dateRange: {
//             start,
//             end: null,
//             preset
//         }
//     });
// }
