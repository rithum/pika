import type { IdentityState } from '$lib/client/app/identity/identity.state.svelte';
import type { FetchZ } from '$lib/client/app/types';
import type { UserPrefsState } from '$lib/client/features/prefs/user-prefs.state.svelte';
import deepEqual from 'deep-equal';
import cloneDeep from 'lodash.clonedeep';
import type {
    AgentDefinition,
    ChatApp,
    ChatUserLite,
    GetAllAgentsAdminResponse,
    GetAllChatAppsAdminResponse,
    GetAllToolsAdminResponse,
    GetValuesForEntityAutoCompleteRequest,
    GetValuesForEntityAutoCompleteResponse,
    GetValuesForUserAutoCompleteResponse,
    InstructionAugmentationScopeType,
    SearchSemanticDirectivesAdminRequest,
    SearchSemanticDirectivesRequest,
    SearchSemanticDirectivesResponse,
    SemanticDirective,
    SemanticDirectiveCreateOrUpdateAdminRequest,
    SemanticDirectiveCreateOrUpdateResponse,
    SemanticDirectiveDeleteAdminRequest,
    SemanticDirectiveDeleteRequest,
    SemanticDirectiveForCreateOrUpdate,
    SimpleOption,
    ToolDefinition
} from 'pika-shared/types/chatbot/chatbot-types';
import { SvelteMap } from 'svelte/reactivity';

const DEFAULT_SEARCH_ERROR = 'Unknown error occurred while searching semantic directives.  Please try again later.';

export class InstructionAugmentationState {
    #userPrefs: UserPrefsState;
    #identity: IdentityState;
    #semanticDirectives = $state<SemanticDirective[]>([]);
    #searchError = $state<string | undefined>(undefined);
    #allAgents = $state<AgentDefinition[]>([]);
    #allTools = $state<ToolDefinition[]>([]);
    #initialized = $state(false);
    #currentDirective = $state<SemanticDirective | undefined>(undefined);
    selectedSemanticDirectives = $state<SemanticDirective[]>([]);
    #isSearching = $state(false);
    userAutoCompleteSearchInProgress = $state(false);
    valuesForUserAutoComplete = $state<ChatUserLite[] | undefined>(undefined);
    #lastSearchTimestamp = $state<Date | undefined>(undefined);
    #hasMore = $state(false);
    searchQuery = $state<SearchSemanticDirectivesRequest>({});
    #paginationToken = $state<Record<string, any> | undefined>(undefined);
    #previousSearchQuery = $state<SearchSemanticDirectivesRequest | undefined>(undefined);
    timezone = $state<string>(Intl.DateTimeFormat().resolvedOptions().timeZone);
    #valuesForEntityAutoComplete = $state<SimpleOption[] | undefined>(undefined);
    #entityAutoCompleteSearchInProgress = $state(false);
    #entitiesRetrievedMap = $state<SvelteMap<string, SimpleOption>>(new SvelteMap());
    #entitiesRetrieved = $derived.by(() => {
        return Array.from(this.#entitiesRetrievedMap.values());
    });
    #loadingAgents = $state(false);
    #loadingTools = $state(false);
    #loading = $derived.by(() => {
        const loadingAgents = this.#loadingAgents ? 'Loading agents...' : undefined;
        const loadingTools = this.#loadingTools ? 'Loading tools...' : undefined;
        const searching = this.#isSearching ? 'Filtering semantic directives...' : undefined;
        const entityAutoCompleteSearchInProgress = this.#entityAutoCompleteSearchInProgress ? 'Searching...' : undefined;
        return loadingAgents ?? loadingTools ?? searching ?? entityAutoCompleteSearchInProgress ?? undefined;
    });

    // Panel visibility state
    #showDetailPanel = $state(true);
    #currentDirectiveChanged = $state(false);
    #currentDirectiveWaitingToMakeCurrent = $state<SemanticDirective | undefined>(undefined);
    showConfirmSaveDirectiveDialog = $state(false);
    isDeletingSemanticDirective = $state(false);
    isSavingSemanticDirective = $state(false);
    directiveDialogMode = $state<'create' | 'edit'>('create');
    showDirectiveDialog = $state(false);
    #isCheckingSemanticDirectiveExists = $state(false);

    constructor(
        private readonly fetchz: FetchZ,
        userPrefs: UserPrefsState,
        identity: IdentityState
    ) {
        this.#userPrefs = userPrefs;
        this.searchQuery = {};
        this.#identity = identity;

        $effect(() => {
            const query = this.searchQuery;
            const previousQuery = this.#previousSearchQuery;

            if (deepEqual(query, previousQuery)) {
                return;
            }

            this.performSearch();
        });

        $effect(() => {
            if (!this.#initialized) {
                this.loadAllAgentsTools();
            }
        });
    }

    get userPrefs() {
        return this.#userPrefs;
    }

    get currentDirectiveWaitingToMakeCurrent() {
        return this.#currentDirectiveWaitingToMakeCurrent;
    }

    get identity() {
        return this.#identity;
    }

    get searchError() {
        return this.#searchError;
    }

    get semanticDirectives() {
        return this.#semanticDirectives;
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

    get valuesForEntityAutoComplete() {
        return this.#valuesForEntityAutoComplete;
    }

    get allAgents() {
        return this.#allAgents;
    }

    get allTools() {
        return this.#allTools;
    }

    get paginationToken() {
        return this.#paginationToken;
    }

    get lastSearchTimestamp() {
        return this.#lastSearchTimestamp;
    }

    get isSearching() {
        return this.#isSearching;
    }
    get hasMore() {
        return this.#hasMore;
    }

    get loadingAgents() {
        return this.#loadingAgents;
    }

    get loadingTools() {
        return this.#loadingTools;
    }

    get showDetailPanel() {
        return this.#showDetailPanel;
    }

    get currentDirective() {
        return this.#currentDirective;
    }

    get currentDirectiveChanged() {
        return this.#currentDirectiveChanged;
    }

    set currentDirectiveChanged(value: boolean) {
        this.#currentDirectiveChanged = value;
    }

    get isCheckingSemanticDirectiveExists() {
        return this.#isCheckingSemanticDirectiveExists;
    }

    setCurrentDirective(directive: SemanticDirective | undefined, forceChange = false) {
        if (this.#currentDirective && (directive === undefined || this.#currentDirective.id !== directive.id) && this.#currentDirectiveChanged && !forceChange) {
            this.#currentDirectiveWaitingToMakeCurrent = directive;
            this.showConfirmSaveDirectiveDialog = true;
            return;
        }
        this.#currentDirective = directive;
        this.#currentDirectiveWaitingToMakeCurrent = undefined;
    }

    clearCurrentDirectiveWaitingToMakeCurrent() {
        this.#currentDirectiveWaitingToMakeCurrent = undefined;
    }

    clearSelection() {
        this.selectedSemanticDirectives = [];
    }

    async loadAllAgentsTools() {
        const [agents, tools] = await Promise.all([
            this.fetchz('/api/site-admin', { method: 'POST', body: JSON.stringify({ command: 'getAllAgents' }) }),
            this.fetchz('/api/site-admin', { method: 'POST', body: JSON.stringify({ command: 'getAllTools' }) })
        ]);

        if (!agents.ok || !tools.ok) {
            throw new Error('Failed to load all chat apps, agents, and tools');
        }

        const agentsJson = (await agents.json()) as GetAllAgentsAdminResponse;
        const toolsJson = (await tools.json()) as GetAllToolsAdminResponse;

        if (!agentsJson.success || !toolsJson.success) {
            throw new Error('Failed to load all chat apps, agents, and tools');
        }

        this.#allAgents = agentsJson.agents;
        this.#allTools = toolsJson.tools;
        this.#initialized = true;
    }

    toggleDetailPanel() {
        this.#showDetailPanel = !this.#showDetailPanel;

        // If all panels are hidden, close the entire right panel
        if (!this.#showDetailPanel) {
            this.setCurrentDirective(undefined);
        }
    }

    async refreshData() {
        this.#semanticDirectives = [];
        this.#hasMore = false;
        this.#lastSearchTimestamp = undefined;
        this.#paginationToken = undefined;
        this.performSearch();
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

            if (!resp.ok) {
                throw new Error('Failed to get values for entity auto complete');
            }

            const responseBody = (await resp.json()) as GetValuesForEntityAutoCompleteResponse;

            if (!responseBody.success) {
                throw new Error('Failed to get values for entity auto complete');
            }

            this.#valuesForEntityAutoComplete = responseBody.data;
            responseBody.data?.forEach((entity) => this.#entitiesRetrievedMap.set(entity.value, entity));
        } finally {
            this.#entityAutoCompleteSearchInProgress = false;
        }
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

    async deleteSemanticDirective(directive: SemanticDirective | { scope: string; id: string }) {
        if (this.isDeletingSemanticDirective) return;
        this.isDeletingSemanticDirective = true;
        try {
            const request: SemanticDirectiveDeleteAdminRequest = {
                command: 'deleteSemanticDirective',
                request: {
                    semanticDirective: {
                        scope: directive.scope,
                        id: directive.id
                    },
                    userId: this.#identity.user?.userId
                }
            };

            const response = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                throw new Error('Failed to delete semantic directive');
            }

            const idx = this.#semanticDirectives.findIndex((d) => d.scope === directive.scope && d.id === directive.id);
            console.log('idx', idx);
            if (idx !== -1) {
                console.log('splicing', idx);
                this.#semanticDirectives.splice(idx, 1);
            }
        } finally {
            this.isDeletingSemanticDirective = false;
        }
    }

    async createOrUpdateSemanticDirective(directive: SemanticDirectiveForCreateOrUpdate, deleteThisWhenDoneSaving: { scope: string; id: string } | undefined = undefined) {
        if (this.isSavingSemanticDirective) return;

        this.isSavingSemanticDirective = true;

        const currentUser = this.#identity.user?.userId;

        let d = { ...directive };
        d.lastUpdatedBy = currentUser;

        const saveRequest: SemanticDirectiveCreateOrUpdateAdminRequest = {
            command: 'createOrUpdateSemanticDirective',
            request: {
                semanticDirective: d,
                userId: currentUser
            }
        };

        let worked = false;
        try {
            const response = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(saveRequest)
            });

            if (!response.ok) {
                throw new Error('Failed to create or update semantic directive');
            }

            const responseBody = (await response.json()) as SemanticDirectiveCreateOrUpdateResponse;

            if (!responseBody.success) {
                throw new Error('Failed to create or update semantic directive');
            }

            worked = true;
        } catch (error) {
            console.error('Failed to create semantic directive:', error);
            throw error;
        } finally {
            this.isSavingSemanticDirective = false;
        }

        if (worked && deleteThisWhenDoneSaving) {
            console.log('deleting', deleteThisWhenDoneSaving);
            await this.deleteSemanticDirective(deleteThisWhenDoneSaving);
        }

        return worked;
    }

    async semanticDirectiveExists(scopeType: InstructionAugmentationScopeType, scopeValue: string | number | Record<string, string | number>, id: string) {
        this.#isCheckingSemanticDirectiveExists = true;
        this.#searchError = undefined;

        try {
            let request: SearchSemanticDirectivesAdminRequest = {
                command: 'searchSemanticDirectives',
                request: { findOne: { scopeType, scopeValue, id } }
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
                console.error('Unknown error searching for a single semantic directive', JSON.stringify(request, null, 2));
                return;
            }

            const responseBody = (await response.json()) as SearchSemanticDirectivesResponse;

            if (!responseBody.success) {
                this.#searchError = DEFAULT_SEARCH_ERROR;
                console.error('Unknown error searching for a single semantic directive. Response body:', JSON.stringify(responseBody, null, 2));
                return;
            }

            return responseBody.semanticDirectives.length > 0;
        } catch (error) {
            console.error(`Error searching for a single semantic directive: ${error instanceof Error ? error.message + ' ' + error.stack : error}`);
        } finally {
            this.#isCheckingSemanticDirectiveExists = false;
        }
    }

    async performSearch(append = false) {
        if (this.#isSearching) return;

        this.#isSearching = true;
        this.#searchError = undefined;

        try {
            if (append && !this.#paginationToken) {
                throw new Error('Cannot append to search without a paginationToken');
            }

            if (!append) {
                this.#paginationToken = undefined;
            }

            const savedQuery = cloneDeep(this.searchQuery);
            const query = { ...cloneDeep(this.searchQuery), paginationToken: this.#paginationToken };

            let request: SearchSemanticDirectivesAdminRequest = {
                command: 'searchSemanticDirectives',
                request: query
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
                console.error('Unknown error searching semantic directives', JSON.stringify(this.searchQuery, null, 2));
                return;
            }

            const responseBody = (await response.json()) as SearchSemanticDirectivesResponse;

            if (!responseBody.success) {
                this.#searchError = DEFAULT_SEARCH_ERROR;
                console.error('Unknown error searching semantic directives. Response body:', JSON.stringify(responseBody, null, 2));
                return;
            }

            if (append) {
                this.#semanticDirectives.push(...responseBody.semanticDirectives);
            } else {
                this.#semanticDirectives = responseBody.semanticDirectives;
            }

            this.#previousSearchQuery = savedQuery;

            this.#paginationToken = responseBody.paginationToken;
            this.#hasMore = !!responseBody.paginationToken;
            this.#lastSearchTimestamp = new Date();
        } catch (error) {
            console.error(`Error searching semantic directives: ${error instanceof Error ? error.message + ' ' + error.stack : error}`);
            this.#searchError = DEFAULT_SEARCH_ERROR;
        } finally {
            this.#isSearching = false;
        }
    }
}
