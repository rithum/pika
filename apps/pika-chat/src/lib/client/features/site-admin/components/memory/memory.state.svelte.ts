import type { IdentityState } from '$lib/client/app/identity/identity.state.svelte';
import type { FetchZ } from '$lib/client/app/types';
import type { UserPrefsState } from '$lib/client/features/prefs/user-prefs.state.svelte';
import { checkClientResponseAndBody, CLIENT_RESOURCE_NAMES, handleClientError } from '$lib/client/util';
import type {
    ChatUserLite,
    GetAllMemoryRecordsAdminRequest,
    GetInstructionsAddedForUserMemoryAdminResponse,
    GetValuesForUserAutoCompleteResponse,
    RetrievedMemoryRecordSummary,
    SearchAllMemoryRecordsResponse,
    ShowToastFn
} from 'pika-shared/types/chatbot/chatbot-types';
import { DEFAULT_MAX_K_MATCHES_PER_STRATEGY, DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT, DEFAULT_MEMORY_STRATEGIES } from 'pika-shared/types/chatbot/chatbot-types';

export class MemoryState {
    #userPrefs: UserPrefsState;
    #identity: IdentityState;
    #allMemoryRecords = $state<RetrievedMemoryRecordSummary[]>([]);
    #allMemoryRecordsSorted = $derived.by(() => {
        const arr = [...this.#allMemoryRecords];
        return arr.sort((a, b) => {
            return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
        });
    });
    #instructionsAddedForUserMemory = $state<string | undefined>(undefined);
    #searchError = $state<string | undefined>(undefined);
    #isSearching = $state(false);
    #isGettingInstructionsAddedForUserMemory = $state(false);
    userAutoCompleteSearchInProgress = $state(false);
    valuesForUserAutoComplete = $state<ChatUserLite[] | undefined>(undefined);
    #lastSearchTimestamp = $state<Date | undefined>(undefined);
    timezone = $state<string>(Intl.DateTimeFormat().resolvedOptions().timeZone);
    #loading = $derived.by(() => {
        const searching = this.#isSearching ? 'Getting memory records...' : undefined;
        const loadingInstructionsAddedForUserMemory = this.#isGettingInstructionsAddedForUserMemory ? 'Loading instructions added for user memory...' : undefined;
        return searching ?? loadingInstructionsAddedForUserMemory ?? undefined;
    });
    prompt = $state<string>('');
    maxMemoryRecordsPerPrompt = $state<number>(DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT);
    maxKMatchesPerStrategy = $state<number>(DEFAULT_MAX_K_MATCHES_PER_STRATEGY);
    userForMemory = $state<ChatUserLite | undefined>(undefined);
    userForInstructions = $state<ChatUserLite | undefined>(undefined);
    readyToGetMemoryInstructions = $state(false);
    #showToast: ShowToastFn;

    constructor(
        private readonly fetchz: FetchZ,
        userPrefs: UserPrefsState,
        identity: IdentityState,
        showToast: ShowToastFn
    ) {
        this.#userPrefs = userPrefs;
        this.#identity = identity;
        this.#showToast = showToast;
    }

    get showToast() {
        return this.#showToast;
    }

    get allMemoryRecordsSorted() {
        return this.#allMemoryRecordsSorted;
    }

    get instructionsAddedForUserMemory() {
        return this.#instructionsAddedForUserMemory;
    }

    get userPrefs() {
        return this.#userPrefs;
    }

    get identity() {
        return this.#identity;
    }

    get searchError() {
        return this.#searchError;
    }

    get loading() {
        return this.#loading;
    }

    get lastSearchTimestamp() {
        return this.#lastSearchTimestamp;
    }

    get isSearching() {
        return this.#isSearching;
    }

    get isGettingInstructionsAddedForUserMemory() {
        return this.#isGettingInstructionsAddedForUserMemory;
    }

    async loadAllMemoryRecords() {
        if (!this.userForMemory) {
            throw new Error('User is not set');
        }

        this.#isSearching = true;
        try {
            const strategies = DEFAULT_MEMORY_STRATEGIES;
            this.#allMemoryRecords = [];
            for (const strategy of strategies) {
                let nextToken: string | undefined = undefined;
                do {
                    const obj: GetAllMemoryRecordsAdminRequest = {
                        command: 'getAllMemoryRecords',
                        request: {
                            userId: this.userForMemory.userId,
                            strategy,
                            nextToken
                        }
                    };
                    const response = await this.fetchz('/api/site-admin', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(obj)
                    });

                    const json = await checkClientResponseAndBody<SearchAllMemoryRecordsResponse>(
                        response,
                        'loading memory records',
                        this.#showToast,
                        CLIENT_RESOURCE_NAMES.MEMORY
                    );
                    // console.log('json', json);
                    this.#allMemoryRecords.push(...json.results.records);
                    nextToken = json.results.nextToken;
                } while (nextToken);
            }
        } catch (e) {
            handleClientError(e, 'loading memory records', this.#showToast);
            throw e;
        } finally {
            this.#isSearching = false;
        }
    }

    clearAllMemoryRecords() {
        this.#allMemoryRecords = [];
    }

    async getInstructionsAddedForUserMemory() {
        if (!this.userForInstructions) {
            throw new Error('User is not set');
        }

        this.#isGettingInstructionsAddedForUserMemory = true;
        try {
            const response = await this.fetchz('/api/site-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    command: 'getInstructionsAddedForUserMemory',
                    request: {
                        userId: this.userForInstructions.userId,
                        strategies: DEFAULT_MEMORY_STRATEGIES,
                        maxMemoryRecordsPerPrompt: this.maxMemoryRecordsPerPrompt,
                        maxKMatchesPerStrategy: this.maxKMatchesPerStrategy,
                        prompt: this.prompt
                    }
                })
            });

            const responseBody = await checkClientResponseAndBody<GetInstructionsAddedForUserMemoryAdminResponse>(
                response,
                'getting memory instructions',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.MEMORY
            );
            // console.log('responseBody', responseBody);
            this.#instructionsAddedForUserMemory = responseBody.instructions;
        } catch (error) {
            handleClientError(error, 'getting memory instructions', this.#showToast);
            throw error;
        } finally {
            this.#isGettingInstructionsAddedForUserMemory = false;
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
}
