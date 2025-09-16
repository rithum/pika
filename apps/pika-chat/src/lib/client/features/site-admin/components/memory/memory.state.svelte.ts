import type { IdentityState } from '$lib/client/app/identity/identity.state.svelte';
import type { FetchZ } from '$lib/client/app/types';
import type { UserPrefsState } from '$lib/client/features/prefs/user-prefs.state.svelte';
import type {
    ChatUserLite,
    GetAllMemoryRecordsAdminRequest,
    GetInstructionsAddedForUserMemoryAdminResponse,
    GetValuesForUserAutoCompleteResponse,
    RetrievedMemoryRecordSummary,
    SearchAllMemoryRecordsResponse
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

    constructor(
        private readonly fetchz: FetchZ,
        userPrefs: UserPrefsState,
        identity: IdentityState
    ) {
        this.#userPrefs = userPrefs;
        this.#identity = identity;
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

                    if (!response.ok) {
                        throw new Error('Failed to get memory records');
                    }

                    const json = (await response.json()) as SearchAllMemoryRecordsResponse;
                    console.log('json', json);
                    this.#allMemoryRecords.push(...json.results.records);
                    nextToken = json.results.nextToken;
                } while (nextToken);
            }
        } catch (e) {
            console.error('Error loading all memory records', e);
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

            if (!response.ok) {
                throw new Error('Failed to get instructions added for user memory');
            }

            const responseBody = (await response.json()) as GetInstructionsAddedForUserMemoryAdminResponse;
            console.log('responseBody', responseBody);
            this.#instructionsAddedForUserMemory = responseBody.instructions;
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
}
