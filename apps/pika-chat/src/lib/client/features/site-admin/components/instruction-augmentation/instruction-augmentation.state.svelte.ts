import type { IdentityState } from '$lib/client/app/identity/identity.state.svelte';
import type { FetchZ } from '$lib/client/app/types';
import type { UserPrefsState } from '$lib/client/features/prefs/user-prefs.state.svelte';
import { checkClientResponseAndBody, CLIENT_RESOURCE_NAMES, handleClientError } from '$lib/client/util';
import deepEqual from 'deep-equal';
import cloneDeep from 'lodash.clonedeep';
import type {
    AgentDefinition,
    ChatUserLite,
    GetAllAgentsAdminResponse,
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
    SemanticDirectiveDeleteResponse,
    SemanticDirectiveForCreateOrUpdate,
    ShowToastFn,
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
    #showToast: ShowToastFn;

    constructor(
        private readonly fetchz: FetchZ,
        userPrefs: UserPrefsState,
        identity: IdentityState,
        showToast: ShowToastFn
    ) {
        this.#userPrefs = userPrefs;
        this.searchQuery = {};
        this.#identity = identity;
        this.#showToast = showToast;

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

    get showToast() {
        return this.#showToast;
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
        try {
            const [agents, tools] = await Promise.all([
                this.fetchz('/api/site-admin', { method: 'POST', body: JSON.stringify({ command: 'getAllAgents' }) }),
                this.fetchz('/api/site-admin', { method: 'POST', body: JSON.stringify({ command: 'getAllTools' }) })
            ]);

            // Use unified error handling for both responses
            const agentsJson = await checkClientResponseAndBody<GetAllAgentsAdminResponse>(agents, 'loading agents', this.#showToast);
            const toolsJson = await checkClientResponseAndBody<GetAllToolsAdminResponse>(tools, 'loading tools', this.#showToast);

            this.#allAgents = agentsJson.agents;
            this.#allTools = toolsJson.tools;
            this.#initialized = true;
        } catch (error) {
            handleClientError(error, 'loading agents and tools', this.#showToast);
            throw error;
        }
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

            const responseBody = await checkClientResponseAndBody<GetValuesForEntityAutoCompleteResponse>(resp, 'getting entity auto-complete values', this.#showToast);

            this.#valuesForEntityAutoComplete = responseBody.data;
            responseBody.data?.forEach((entity) => this.#entitiesRetrievedMap.set(entity.value, entity));
        } catch (error) {
            handleClientError(error, 'getting entity auto-complete values', this.#showToast);
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

            await checkClientResponseAndBody<SemanticDirectiveDeleteResponse>(response, 'deleting semantic directive', this.#showToast, CLIENT_RESOURCE_NAMES.SEMANTIC_DIRECTIVE);

            const idx = this.#semanticDirectives.findIndex((d) => d.scope === directive.scope && d.id === directive.id);
            if (idx !== -1) {
                this.#semanticDirectives.splice(idx, 1);
            }
        } catch (error) {
            handleClientError(error, 'deleting semantic directive', this.#showToast);
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

            await checkClientResponseAndBody<SemanticDirectiveCreateOrUpdateResponse>(
                response,
                'saving semantic directive',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.SEMANTIC_DIRECTIVE
            );

            worked = true;
        } catch (error) {
            handleClientError(error, 'saving semantic directive', this.#showToast);
            throw error;
        } finally {
            this.isSavingSemanticDirective = false;
        }

        if (worked && deleteThisWhenDoneSaving) {
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

            const responseBody = await checkClientResponseAndBody<SearchSemanticDirectivesResponse>(
                response,
                'checking if semantic directive exists',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.SEMANTIC_DIRECTIVE
            );

            return responseBody.semanticDirectives.length > 0;
        } catch (error) {
            this.#searchError = DEFAULT_SEARCH_ERROR;
            handleClientError(error, 'checking if semantic directive exists', this.#showToast);
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

            const responseBody = await checkClientResponseAndBody<SearchSemanticDirectivesResponse>(
                response,
                'searching semantic directives',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.SEMANTIC_DIRECTIVE
            );

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
            this.#searchError = DEFAULT_SEARCH_ERROR;
            handleClientError(error, 'searching semantic directives', this.#showToast);
        } finally {
            this.#isSearching = false;
        }
    }
}
