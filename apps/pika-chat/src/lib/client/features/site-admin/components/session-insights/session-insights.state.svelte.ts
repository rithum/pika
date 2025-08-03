import type { FetchZ } from '$lib/client/app/types';
import type { SessionSearchRequest, SessionSearchResponse, ChatSession, RecordOrUndef, SessionSearchAdminRequest } from '@pika/shared/types/chatbot/chatbot-types';
import { createDefaultSearchQuery } from './utils';
import type { AdvancedSearchState, SavedSearch, SimpleSearchState } from './types';
import type { UserPrefsState } from '$lib/client/features/prefs/user-prefs.state.svelte';
import cloneDeep from 'lodash.clonedeep';

const DEFAULT_SEARCH_ERROR = 'Unknown error occurred while searching sessions.  Please try again later.';
const SAVED_SEARCHES_KEY = 'pika:admin:session-insights:saved-searches';

export class SessionInsightsState {
    #userPrefs: UserPrefsState;
    #sessions = $state<ChatSession[]>([]);
    #selectedSessions = $state<string[]>([]);
    #isSearching = $state(false);
    #isUpdatingUserPrefs = $state(false);
    #searchError = $state<string | undefined>(undefined);
    #totalResults = $state(0);
    #expandedRows = $state<Set<string>>(new Set());
    #savedSearches = $state<SavedSearch[]>([]);
    #lastSearchTimestamp = $state<Date | undefined>(undefined);
    #hasMore = $state(false);
    searchQuery = $state<SessionSearchRequest<RecordOrUndef>>(createDefaultSearchQuery());
    timezone = $state<string>(Intl.DateTimeFormat().resolvedOptions().timeZone);

    constructor(
        private readonly fetchz: FetchZ,
        userPrefs: UserPrefsState
    ) {
        this.#userPrefs = userPrefs;
        this.loadSavedSearches();
        this.performSearch();
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

    async performSearch(append = false) {
        if (this.#isSearching) return;

        this.#isSearching = true;
        this.#searchError = undefined;

        try {
            if (append && !this.searchQuery.scrollId) {
                throw new Error('Cannot append to search without a scrollId');
            }

            if (!append) {
                delete this.searchQuery.scrollId;
            }

            const query = cloneDeep(this.searchQuery);
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

            const responseBody = await response.json();
            if (!responseBody.success) {
                this.#searchError = DEFAULT_SEARCH_ERROR;
                console.error('Unknown error searching sessions.  Error: ', responseBody.error, 'Response body:', JSON.stringify(responseBody, null, 2));
                return;
            }

            const responseData = responseBody.search as SessionSearchResponse;

            if (append) {
                this.#sessions.push(...responseData.sessions);
            } else {
                this.#sessions = responseData.sessions;
            }

            this.searchQuery.scrollId = responseData.scrollId;
            this.#hasMore = !!responseData.scrollId;
            this.#totalResults = responseData.total || 0;
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
