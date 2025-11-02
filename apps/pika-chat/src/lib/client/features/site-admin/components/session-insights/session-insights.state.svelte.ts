import type { IdentityState } from '$lib/client/app/identity/identity.state.svelte';
import type { FetchZ } from '$lib/client/app/types';
import type { ComponentRegistry } from '$lib/client/features/chat/message-segments/component-registry';
import { MessageSegmentProcessor } from '$lib/client/features/chat/message-segments/segment-processor';
import type { UserPrefsState } from '$lib/client/features/prefs/user-prefs.state.svelte';
import { checkClientResponse, checkClientResponseAndBody, CLIENT_RESOURCE_NAMES, handleClientError } from '$lib/client/util';
import deepEqual from 'deep-equal';
import cloneDeep from 'lodash.clonedeep';
import type {
    Attachment,
    ChatMessageForRendering,
    ChatMessagesResponse,
    ChatSession,
    ChatSessionFeedback,
    ChatSessionFeedbackForCreate,
    ChatSessionFeedbackForUpdate,
    ChatUserLite,
    GetValuesForEntityAutoCompleteRequest,
    GetValuesForEntityAutoCompleteResponse,
    GetValuesForUserAutoCompleteResponse,
    RecordOrUndef,
    SessionInsights,
    SessionSearchAdminRequest,
    SessionSearchRequest,
    SessionSearchResponse,
    ShowToastFn,
    SimpleOption,
    SiteFeatures
} from 'pika-shared/types/chatbot/chatbot-types';
import { SvelteMap } from 'svelte/reactivity';
import type { ImageForLightbox, SavedSearch } from './types';
import { createDefaultSearchQuery } from './utils';

const DEFAULT_SEARCH_ERROR = 'Unknown error occurred while searching sessions.  Please try again later.';
const SAVED_SEARCHES_KEY = 'pika:admin:session-insights:saved-searches';

export const DEFAULT_PAGE_SIZE = 500;

export class SessionInsightsState {
    #userPrefs: UserPrefsState;
    #identity: IdentityState;
    #siteFeatures: SiteFeatures | undefined;
    #sessions = $state<ChatSession<RecordOrUndef>[]>([]);
    #selectedSessions = $state<string[]>([]);
    #isSearching = $state(false);
    #isRetrievingCompleteSession = $state(false);
    #isUpdatingUserPrefs = $state(false);
    #searchError = $state<string | undefined>(undefined);
    #totalResults = $state(0);
    #expandedRows = $state<Set<string>>(new Set());
    #savedSearches = $state<SavedSearch[]>([]);
    savedSearchInUse = $state<SavedSearch | undefined>(undefined);
    #savingSavedSearch = $state(false);
    #deletingSavedSearch = $state(false);
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
    #curSessionFeedback = $state<ChatSessionFeedback[] | undefined>(undefined);
    #curSessionInsights = $state<SessionInsights | undefined>(undefined);
    #retrievingMessages = $state(false);
    #messageProcessor = $state<MessageSegmentProcessor>() as MessageSegmentProcessor;
    #componentRegistry: ComponentRegistry;
    #valuesForEntityAutoComplete = $state<SimpleOption[] | undefined>(undefined);
    #entityAutoCompleteSearchInProgress = $state(false);
    #entitiesRetrievedMap = $state<SvelteMap<string, SimpleOption>>(new SvelteMap());
    #entitiesRetrieved = $derived.by(() => {
        return Array.from(this.#entitiesRetrievedMap.values());
    });
    #entityNamesMap = $state<SvelteMap<string, string>>(new SvelteMap());
    #userNamesMap = $state<SvelteMap<string, ChatUserLite>>(new SvelteMap());
    #loading = $derived.by(() => {
        const savingSavedSearch = this.#savingSavedSearch ? 'Saving search...' : undefined;
        const deletingSavedSearch = this.#deletingSavedSearch ? 'Deleting...' : undefined;
        const searching = this.#isSearching ? 'Filtering sessions...' : undefined;
        const entityAutoCompleteSearchInProgress = this.#entityAutoCompleteSearchInProgress ? 'Searching...' : undefined;
        const retrievingMessages = this.#retrievingMessages ? 'Retrieving messages...' : undefined;
        const userSearch = this.userAutoCompleteSearchInProgress ? 'Searching...' : undefined;
        const retrievingCompleteSession = this.#isRetrievingCompleteSession ? 'Retrieving session...' : undefined;

        return savingSavedSearch ?? searching ?? entityAutoCompleteSearchInProgress ?? retrievingMessages ?? userSearch ?? retrievingCompleteSession ?? undefined;
    });
    imageForLightbox = $state<ImageForLightbox | undefined>(undefined);
    showImageLightbox = $state(false);
    loadingImageLightbox = $state(false);

    // Panel visibility state
    #showInsightsPanel = $state(true);
    #showMessagesPanel = $state(true);
    #showFeedbackPanel = $state(true);
    #savingFeedback = $state(false);
    #updatingFeedback = $state(false);
    #addingInternalComment = $state(false);
    attachmentOperationInProgress = $state(false);
    #showToast: ShowToastFn;

    constructor(
        private readonly fetchz: FetchZ,
        userPrefs: UserPrefsState,
        componentRegistry: ComponentRegistry,
        identity: IdentityState,
        showToast: ShowToastFn,
        siteFeatures: SiteFeatures | undefined
    ) {
        this.#userPrefs = userPrefs;
        this.#messageProcessor = new MessageSegmentProcessor(componentRegistry, showToast);
        this.loadSavedSearches();
        this.searchQuery = createDefaultSearchQuery();
        this.#componentRegistry = componentRegistry;
        this.#identity = identity;
        this.#showToast = showToast;
        this.#siteFeatures = siteFeatures;

        // Pre-populate chat-app-global entity with a dash as the display name
        this.#entitiesRetrievedMap.set('chat-app-global', { value: 'chat-app-global', label: '-' });
        this.#entityNamesMap.set('chat-app-global', '-');

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
                this.#curSessionInsights = undefined;
                this.#curSessionFeedback = undefined;
                this.refreshMessagesForCurrentSession();
                this.getCompleteSessionObjectForCurrentSession();
            }
        });
    }

    get showToast() {
        return this.#showToast;
    }

    get curSessionInsights() {
        return this.#curSessionInsights;
    }

    get curSessionFeedback() {
        return this.#curSessionFeedback;
    }

    get isRetrievingCompleteSession() {
        return this.#isRetrievingCompleteSession;
    }

    get savingFeedback() {
        return this.#savingFeedback;
    }

    get updatingFeedback() {
        return this.#updatingFeedback;
    }

    get addingInternalComment() {
        return this.#addingInternalComment;
    }

    get savingSavedSearch() {
        return this.#savingSavedSearch;
    }

    get loading() {
        return this.#loading;
    }

    get entityAutoCompleteSearchInProgress() {
        return this.#entityAutoCompleteSearchInProgress;
    }

    get entitiesRetrieved() {
        return this.#entitiesRetrieved;
    }

    get entityNamesMap() {
        return this.#entityNamesMap;
    }

    get userNamesMap() {
        return this.#userNamesMap;
    }

    get valuesForEntityAutoComplete() {
        return this.#valuesForEntityAutoComplete;
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

    get showInsightsPanel() {
        return this.#showInsightsPanel;
    }

    get showMessagesPanel() {
        return this.#showMessagesPanel;
    }

    get showFeedbackPanel() {
        return this.#showFeedbackPanel;
    }

    get pageSize() {
        return DEFAULT_PAGE_SIZE;
    }

    /**
     * Load an image into the lightbox and show it.
     *
     * Convert to a temporary signed download via /api/download and display inline
     * We'll fetch blob and create object URL for preview
     *
     * @param s3Url - The S3 URL of the image to load.
     * @param name - The name of the image.
     * @param urlObj - The URL object to use to create the object URL.
     */
    async loadLightboxImageAndShowLightbox(s3Url: string, name: string, urlObj: typeof URL) {
        if (this.imageForLightbox?.src) {
            urlObj.revokeObjectURL(this.imageForLightbox.src);
        }

        this.imageForLightbox = undefined;
        this.showImageLightbox = true;

        this.loadingImageLightbox = true;
        try {
            const s3Key = this.getS3KeyFromUrl(s3Url);
            const resp = await fetch(`/api/download/${encodeURIComponent(s3Key)}`);
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            this.imageForLightbox = { src: url, name, s3Url, alt: name };
        } catch (e) {
            console.error('Error loading lightbox image', e);
            this.showImageLightbox = false;
            this.downloadAttachment(s3Url);
        } finally {
            this.loadingImageLightbox = false;
        }
    }

    clearSelection() {
        this.#selectedSessions = [];
    }

    toggleInsightsPanel() {
        this.#showInsightsPanel = !this.#showInsightsPanel;

        // If all panels are hidden, close the entire right panel
        if (!this.#showInsightsPanel && !this.#showMessagesPanel && !this.#showFeedbackPanel) {
            this.sessionIdToShowMessagesForInline = undefined;
        }
    }

    toggleMessagesPanel() {
        this.#showMessagesPanel = !this.#showMessagesPanel;

        // If all panels are hidden, close the entire right panel
        if (!this.#showInsightsPanel && !this.#showMessagesPanel && !this.#showFeedbackPanel) {
            this.sessionIdToShowMessagesForInline = undefined;
        }
    }

    closeRightPanel() {
        this.#showMessagesPanel = false;
        this.#showInsightsPanel = false;
        this.#showFeedbackPanel = false;
        this.sessionIdToShowMessagesForInline = undefined;
    }

    toggleFeedbackPanel() {
        this.#showFeedbackPanel = !this.#showFeedbackPanel;

        // If all panels are hidden, close the entire right panel
        if (!this.#showInsightsPanel && !this.#showMessagesPanel && !this.#showFeedbackPanel) {
            this.sessionIdToShowMessagesForInline = undefined;
        }
    }

    // Reset panel visibility when opening a new session
    openSession(sessionId: string) {
        this.sessionIdToShowMessagesForInline = sessionId;
        this.#showInsightsPanel = true;
        this.#showMessagesPanel = true;
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
        const savedSearches = await this.#userPrefs.getPref<SavedSearch[]>(SAVED_SEARCHES_KEY);
        if (savedSearches && savedSearches.length > 0) {
            // Descending order by createdAt
            savedSearches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        this.#savedSearches = savedSearches ?? [];
    }

    async saveSearch(name: string) {
        try {
            this.#savingSavedSearch = true;
            let existing = this.#savedSearches.find((s) => s.name === name);
            if (existing) {
                existing.searchParams = cloneDeep(this.searchQuery);
            } else {
                this.#savedSearches.unshift({
                    id: crypto.randomUUID(),
                    name,
                    searchParams: cloneDeep(this.searchQuery),
                    createdAt: new Date(),
                    createdBy: this.#identity.user.userId
                });
            }

            await this.#userPrefs.modifyPref(SAVED_SEARCHES_KEY, this.#savedSearches);
        } finally {
            this.#savingSavedSearch = false;
        }
    }

    async deleteSavedSearch(search: SavedSearch) {
        try {
            this.#deletingSavedSearch = true;
            this.#savedSearches = this.#savedSearches.filter((s) => s.name !== search.name);
            if (this.savedSearchInUse?.name === search.name) {
                this.savedSearchInUse = undefined;
                this.searchQuery = createDefaultSearchQuery();
            }
            await this.#userPrefs.modifyPref(SAVED_SEARCHES_KEY, this.#savedSearches);
        } finally {
            this.#deletingSavedSearch = false;
        }
    }

    async loadMore() {
        if (!this.#hasMore) return;

        await this.performSearch(true);
    }

    async getValuesForEntityAutoComplete(valueProvidedByUser: string) {
        try {
            this.#entityAutoCompleteSearchInProgress = true;

            const request: GetValuesForEntityAutoCompleteRequest = {
                command: 'getValuesForEntityAutoComplete',
                valueProvidedByUser
            };
            const resp = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
            });

            const responseBody = await checkClientResponseAndBody<GetValuesForEntityAutoCompleteResponse>(resp, 'getting entity auto-complete values', this.#showToast);

            this.#valuesForEntityAutoComplete = responseBody.data;
            responseBody.data?.forEach((entity) => this.#entitiesRetrievedMap.set(entity.value, entity));
        } catch (error) {
            handleClientError(error, 'getting entity auto-complete values', this.#showToast);
        } finally {
            this.#entityAutoCompleteSearchInProgress = false;
        }
    }

    async refreshMessagesForCurrentSession() {
        this.#curSessionMessages = [];
        if (!this.#currentSession) {
            return;
        }

        try {
            this.#retrievingMessages = true;
            const chatAppId = this.#currentSession.chatAppId;
            const resp = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ command: 'getChatMessagesAsAdmin', sessionId: this.#currentSession.sessionId, chatAppId, userId: this.#currentSession.userId })
            });

            const msgResult = await checkClientResponseAndBody<ChatMessagesResponse>(resp, 'refreshing session messages', this.#showToast, CLIENT_RESOURCE_NAMES.MESSAGE);

            this.#curSessionMessages = msgResult.messages.map((msg) => this.#processMessageIntoSegments({ ...msg, segments: [] }, false));
        } catch (e) {
            handleClientError(e, 'refreshing session messages', this.#showToast);
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

            const responseBody = await checkClientResponseAndBody<GetValuesForUserAutoCompleteResponse>(
                response,
                'getting user auto-complete values',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.USER
            );

            this.valuesForUserAutoComplete = (responseBody.data ?? []) as ChatUserLite[];
        } catch (error) {
            handleClientError(error, 'getting user auto-complete values', this.#showToast);
        } finally {
            this.userAutoCompleteSearchInProgress = false;
        }
    }

    getS3KeyFromUrl(s3Url: string): string {
        // expects s3://bucket/key
        if (!s3Url.startsWith('s3://')) return s3Url;
        const firstSlash = s3Url.indexOf('/', 's3://'.length);
        return s3Url.substring(firstSlash + 1);
    }

    async downloadAttachment(s3Url: string) {
        try {
            const s3Key = this.getS3KeyFromUrl(s3Url);
            const resp = await this.fetchz(`/api/download/${encodeURIComponent(s3Key)}`);
            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = s3Key.split('/').pop() || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Error downloading attachment', e);
        }
    }

    async uploadFeedbackAttachment(file: File): Promise<Attachment> {
        this.attachmentOperationInProgress = true;
        try {
            const form = new FormData();
            form.append('file', file);
            const resp = await this.fetchz('/api/site-admin/file', { method: 'POST', body: form });

            const json = await checkClientResponseAndBody<{ success: boolean; attachment: Attachment }>(resp, 'uploading attachment', this.#showToast);

            if (!json.attachment) {
                this.#showToast('Failed to upload attachment. Please try again.', { type: 'error' });
                throw new Error('Invalid upload response - no attachment');
            }
            return json.attachment;
        } catch (error) {
            handleClientError(error, 'uploading attachment', this.#showToast);
            throw error;
        } finally {
            this.attachmentOperationInProgress = false;
        }
    }

    async deleteFeedbackAttachmentByS3Key(s3Key: string): Promise<void> {
        this.attachmentOperationInProgress = true;
        try {
            const resp = await this.fetchz(`/api/site-admin/file?s3Key=${encodeURIComponent(s3Key)}`, { method: 'DELETE' });

            checkClientResponse(resp, 'deleting attachment', this.#showToast);
        } catch (error) {
            handleClientError(error, 'deleting attachment', this.#showToast);
            throw error;
        } finally {
            this.attachmentOperationInProgress = false;
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
            const queryStr = (query.query ?? '').trim();
            query.query = queryStr.length >= 3 ? queryStr : undefined;

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

            const responseBody = await checkClientResponseAndBody<SessionSearchResponse<RecordOrUndef>>(
                response,
                'searching sessions',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.SESSION
            );

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

            // Enrich entity names if entity feature is enabled
            await this.enrichEntityNames();
            
            // Enrich user names
            await this.enrichUserNames();
        } catch (error) {
            this.#searchError = DEFAULT_SEARCH_ERROR;
            handleClientError(error, 'searching sessions', this.#showToast);
        } finally {
            this.#isSearching = false;
        }
    }

    /**
     * Enrich entity IDs with their display names by fetching in batch.
     * Based on session-analytics enrichEntityNames implementation.
     */
    private async enrichEntityNames() {
        // Only enrich if entity feature is enabled
        if (!this.#siteFeatures?.entity?.enabled) {
            return;
        }

        try {
            // Extract unique entity IDs from loaded sessions using top-level entityId
            const entityIds = new Set<string>();
            for (const session of this.#sessions) {
                const entityId = (session as any).entityId;
                if (entityId && typeof entityId === 'string') {
                    entityIds.add(entityId);
                }
            }

            if (entityIds.size === 0) {
                return;
            }

            // Filter out IDs we already have names for
            // This automatically excludes 'chat-app-global' which is pre-populated in constructor
            const entityIdsToFetch = Array.from(entityIds).filter(id => !this.#entityNamesMap.has(id));
            
            if (entityIdsToFetch.length === 0) {
                return;
            }

            const response = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    command: 'getValuesForEntityList',
                    entityIds: entityIdsToFetch
                })
            });

            checkClientResponse(response, 'enrich entity names', this.#showToast, CLIENT_RESOURCE_NAMES.SESSION);
            const result: { success: boolean; data?: { value: string; label?: string }[] } = await response.json();

            if (result.data) {
                // Update the entity names map
                for (const entity of result.data) {
                    this.#entityNamesMap.set(entity.value, entity.label ?? entity.value);
                    
                    // Also add to entitiesRetrievedMap for use in filter
                    this.#entitiesRetrievedMap.set(entity.value, {
                        value: entity.value,
                        label: entity.label ?? entity.value
                    });
                }
            }
        } catch (err) {
            // If enrichment fails, log but continue with unenriched data
            console.error('Failed to enrich entity names:', err);
        }
    }

    /**
     * Get the display name for an entity ID
     */
    getEntityName(entityId: string | undefined): string | undefined {
        if (!entityId) return undefined;
        return this.#entityNamesMap.get(entityId) ?? entityId;
    }

    /**
     * Get the user display info for a user ID (firstName, lastName if available)
     */
    getUserDisplayInfo(userId: string | undefined): ChatUserLite | undefined {
        if (!userId) return undefined;
        return this.#userNamesMap.get(userId);
    }

    /**
     * Enrich user IDs with their display names by fetching in batch.
     * Similar to enrichEntityNames implementation.
     */
    private async enrichUserNames() {
        try {
            // Extract unique user IDs from loaded sessions
            const userIds = new Set<string>();
            for (const session of this.#sessions) {
                const userId = session.userId;
                if (userId && typeof userId === 'string') {
                    userIds.add(userId);
                }
            }

            if (userIds.size === 0) {
                return;
            }

            // Filter out IDs we already have names for
            const userIdsToFetch = Array.from(userIds).filter(id => !this.#userNamesMap.has(id));
            
            if (userIdsToFetch.length === 0) {
                return;
            }

            const response = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    command: 'getUsersForUserList',
                    userIds: userIdsToFetch
                })
            });

            checkClientResponse(response, 'enrich user names', this.#showToast, CLIENT_RESOURCE_NAMES.USER);
            const result: { success: boolean; data?: ChatUserLite[] } = await response.json();

            if (result.data) {
                // Update the user names map
                for (const user of result.data) {
                    this.#userNamesMap.set(user.userId, user);
                }
            }
        } catch (err) {
            // If enrichment fails, log but continue with unenriched data
            console.error('Failed to enrich user names:', err);
        }
    }

    async getCompleteSessionObjectForCurrentSession() {
        if (!this.#currentSession) return;

        this.#isRetrievingCompleteSession = true;
        this.#searchError = undefined;

        try {
            const request: SessionSearchAdminRequest = {
                command: 'sessionSearch',
                search: { sessionId: this.#currentSession.sessionId, includeInsights: true, includeFeedback: true }
            };

            const response = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
            });

            const responseBody = await checkClientResponseAndBody<SessionSearchResponse<RecordOrUndef>>(
                response,
                'retrieving complete session',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.SESSION
            );

            if (responseBody.sessions.length === 0) {
                console.error('No session found for current session');
                return;
            }

            this.#curSessionFeedback = responseBody.sessions[0].feedback;
            this.#curSessionInsights = responseBody.sessions[0].insights;
        } catch (error) {
            this.#searchError = DEFAULT_SEARCH_ERROR;
            handleClientError(error, 'retrieving complete session', this.#showToast);
        } finally {
            this.#isRetrievingCompleteSession = false;
        }
    }

    /**
     * Add feedback to the current session (or any session by id) and update local state.
     * Follows existing site-admin POST command patterns used elsewhere in this class.
     */
    async addChatSessionFeedback(feedback: ChatSessionFeedbackForCreate): Promise<ChatSessionFeedback | undefined> {
        try {
            this.#savingFeedback = true;
            const resp = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'addChatSessionFeedback', feedback })
            });

            const json = await checkClientResponseAndBody<{ success: boolean; feedback?: ChatSessionFeedback }>(
                resp,
                'adding session feedback',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.FEEDBACK
            );

            if (!json.feedback) {
                this.#showToast('Failed to add session feedback. Please try again.', { type: 'error' });
                return undefined;
            }

            // Update local sessions cache
            const newFeedback = json.feedback;
            if (this.#currentSession && this.#currentSession.sessionId === newFeedback.sessionId) {
                if (!this.#curSessionFeedback) {
                    this.#curSessionFeedback = [newFeedback];
                } else {
                    this.#curSessionFeedback.push(newFeedback);
                }
            }

            return newFeedback;
        } catch (e) {
            handleClientError(e, 'adding session feedback', this.#showToast);
            return undefined;
        } finally {
            this.#savingFeedback = false;
        }
    }

    /**
     * Update feedback (status, severity, type, internal comments, etc.) and update local state.
     */
    async updateChatSessionFeedback(feedback: ChatSessionFeedbackForUpdate): Promise<ChatSessionFeedback | undefined> {
        try {
            this.#updatingFeedback = true;
            const resp = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'updateChatSessionFeedback', feedback })
            });

            const json = await checkClientResponseAndBody<{ success: boolean; feedback?: ChatSessionFeedback }>(
                resp,
                'updating session feedback',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.FEEDBACK
            );

            if (!json.feedback) {
                this.#showToast('Failed to update session feedback. Please try again.', { type: 'error' });
                return undefined;
            }

            // Update local sessions cache
            const updated = json.feedback;
            if (this.#currentSession && this.#currentSession.sessionId === updated.sessionId) {
                const fbIdx = (this.#curSessionFeedback ?? []).findIndex((f) => f.feedbackId === updated.feedbackId);
                if (fbIdx !== -1) {
                    this.#curSessionFeedback![fbIdx] = updated;
                } else {
                    this.#curSessionFeedback!.push(updated);
                }
            }

            return updated;
        } catch (e) {
            handleClientError(e, 'updating session feedback', this.#showToast);
            return undefined;
        } finally {
            this.#updatingFeedback = false;
        }
    }

    // TODO(bruce): add helpers for adding/editing internal comments if needed at the state level.
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

//     }

//     updateSimpleSearch({
//         dateRange: {
//             start,
//             end: null,
//             preset
//         }
//     });
// }
