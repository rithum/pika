import type { AppState } from '$client/app/app.state.svelte';
import type { FetchZ } from '$client/app/types';
import { UserWidgetDataStoreState } from '$client/features/chat/user-widget-data-store.state.svelte';
import { UserPrefsState } from '$client/features/prefs/user-prefs.state.svelte';
import { checkClientResponse, checkClientResponseAndBody, CLIENT_RESOURCE_NAMES, handleClientError } from '$client/util';
import { initializeCanonicalTagMap } from '$lib/client/webcomponent-utils';
import type { Page } from '@sveltejs/kit';
import findAndParseJsonLikeText from 'json-like-parse';
import type {
    AddChatSessionFeedbackRequest,
    ChatAppAction,
    ChatAppActionMenu,
    ChatAppMode,
    ChatSessionFeedbackForCreate,
    CreateSharedSessionRequest,
    CreateSharedSessionResponse,
    GetPinnedSessionsRequest,
    GetPinnedSessionsResponse,
    GetRecentSharedResponse,
    InvokeAgentAsComponentOptions,
    PinnedObjAndChatSession,
    PinSessionRequest,
    RecordOrUndef,
    RetrievedMemoryRecordSummary,
    RevokeSharedSessionRequest,
    RevokeSharedSessionResponse,
    SearchAllMyMemoryRecordsResponse,
    SharedSessionVisitHistory,
    ShareSessionState,
    ShowToastFn,
    StaticWidgetTagDefinition,
    TagDefinition,
    TagDefinitionWidget,
    TagDefinitionWidgetWebComponent,
    UnpinSessionRequest,
    UnrevokeSharedSessionRequest,
    UnrevokeSharedSessionResponse,
    UserDataOverrideSettings,
    ValidateShareAccessRequest,
    ValidateShareAccessResponse,
    WidgetAction,
    WidgetInstance,
    WidgetMetadata,
    WidgetMetadataState,
    WidgetRenderingContextType
} from 'pika-shared/types/chatbot/chatbot-types';
import {
    ContentAdminCommand,
    DEFAULT_MEMORY_STRATEGIES,
    UserOverrideDataCommand,
    type ChatApp,
    type ChatAppOverridableFeatures,
    type ChatMessage,
    type ChatMessageFile,
    type ChatMessageForRendering,
    type ChatMessagesResponse,
    type ChatSession,
    type ChatSessionsResponse,
    type ChatUserLite,
    type ContentAdminRequest,
    type ContentAdminResponse,
    type ConverseRequest,
    type CustomDataUiRepresentation,
    type GetInitialDialogDataResponse,
    type GetValuesForAutoCompleteResponse,
    type GetValuesForContentAdminAutoCompleteResponse,
    type SaveUserOverrideDataResponse,
    type UserOverrideDataCommandRequest,
    type UserOverrideDataCommandResponse
} from 'pika-shared/types/chatbot/chatbot-types';
import type { IChatAppState, IWidgetMetadataAPI } from 'pika-shared/types/chatbot/webcomp-types';
import { generateChatFileUploadS3KeyName, sanitizeFileName } from 'pika-shared/util/chatbot-shared-utils';
import type { SidebarState } from 'pika-ux/shadcn/sidebar/context.svelte';
import type { Component, Snippet } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { v7 as uuidv7 } from 'uuid';
import { UploadInstance } from '../upload/upload-instance.svelte';
import { UploadState } from '../upload/upload.state.svelte';
import { ChatFileValidationError } from './lib/ChatFileValidationError';
import type { ComponentRegistry } from './message-segments/component-registry';
import { MessageSegmentProcessor } from './message-segments/segment-processor';
import { ChatNavState } from './nav/chat-nav.state.svelte';
import { WidgetRegistry } from './widgets/widget-registry';

const MAX_FILES = 5;

//TODO: get from feature, it's already there just use it
const SUPPORTED_FILE_TYPES: Record<string, string> = {
    'text/csv': 'csv (Comma Separated Values)'
    // 'application/pdf': 'pdf (Portable Document Format)',
    // 'text/plain': 'txt (Plain Text)',
};

//TODO: put this in the download feature
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const INPROGRESS_INPUT_MSGS_KEY = 'inprogress-input-msgs';

/**
 * An interim session is one that is not yet saved to the server and has a sessionId that starts with 'interim-'.
 *
 * An interim message is a message that is not yet saved to the server and has a messageId that starts with 'interim-'.
 * It is used to store the input message that the user is typing in the prompt input field.
 * When the user sends a message, we get back a real session ID and we replace the interim session with the real session.
 * The interim message is then replaced with the real message when we refresh messages and sessions.
 *
 * There will always be a current session.  Current session will be an interim session if we haven't submitted a message to the server yet.
 */
export class ChatAppState implements IChatAppState {
    #chatApp = $state<ChatApp>() as ChatApp;
    #mode = $state<ChatAppMode>('standalone');
    #appState = $state<AppState>() as AppState;
    #userPrefs = $state<UserPrefsState>() as UserPrefsState;
    #userWidgetDataCache = new Map<string, UserWidgetDataStoreState>();

    // Widget metadata storage - keyed by instanceId
    #widgetMetadata = $state<Map<string, WidgetMetadataState>>(new SvelteMap());

    // Widget instance tracking - maps instanceId to WidgetInstance (includes DOM element reference)
    #widgetInstances = $state<Map<string, WidgetInstance>>(new SvelteMap());

    // Action button/action button menu that will appear at the top of the chat app in the title bar. Used by widgets to register global actions.
    #customTitleBarActions = $state<(ChatAppActionMenu | ChatAppAction)[]>([]);

    #chatSessions = $state<ChatSession<RecordOrUndef>[]>([]);
    #sortedChatSessions = $derived.by(() => {
        const arr = [...this.#chatSessions];
        return arr.sort((a, b) => {
            return new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime();
        });
    });
    #currentSession = $state<ChatSession<RecordOrUndef>>() as ChatSession<RecordOrUndef>; // Initialized in constructor
    #curSessionMessages = $state<ChatMessageForRendering[]>([]);
    #refreshingChatSessions = $state<boolean>(false);
    #inputFiles = $state<UploadInstance[]>([]);
    #newSession = $derived(!!this.#currentSession); // We don't have a session created yet that we are working within
    #isInterimSession = $derived(this.#currentSession?.sessionId?.startsWith('interim-'));
    #streamingResponseNow = $state<boolean>(false);
    #interimMessageId = $state<string | undefined>(undefined);
    #chatInput = $state<string>(''); // The message that the user is typing in the prompt input field
    #inprogressInputs = $state<Record<string, PersistedInputState>>({});
    #uploadState = $state<UploadState>() as UploadState;
    #retrievingMessages = $state<boolean>(false);
    #messageChunkCount = $state<number>(0); // Allows reactive response to streaming response (scroll to bottom most obvious case)
    #componentRegistry = $state<ComponentRegistry>() as ComponentRegistry; // renderers and metadata handlers for chat message segments
    #widgetRegistry = $state<WidgetRegistry>() as WidgetRegistry; // registry for multi-context widgets (spotlight, canvas, dialog)
    #messageProcessor = $state<MessageSegmentProcessor>() as MessageSegmentProcessor;
    #waitingForFirstStreamedResponse = $derived.by(() => {
        const streaming = this.#streamingResponseNow;
        const interimMessageId = this.#interimMessageId;
        return !streaming || !interimMessageId ? false : this.getMessageByMessageId(interimMessageId)?.message === '';
    });
    // This is here to help test, leave it here for now
    #loadMockDataStartTime = $state<number | undefined>(undefined); // Used to track the start time of the mock data loading
    #nav = $state<ChatNavState | undefined>(undefined);
    #page: Page | undefined;
    #pageTitle = $state<string | undefined>(undefined);
    #pageHeaderRight = $state<Snippet | undefined>(undefined);
    #userIsContentAdmin = $state<boolean>(false);
    #contentAdminDialogOpen = $state<boolean>(false);
    #userDataOverrideSettings = $state<UserDataOverrideSettings>() as UserDataOverrideSettings;
    #userDataOverrideDialogOpen = $state(false);
    #isViewingContentForAnotherUser = $derived(this.#appState.identity.user.viewingContentFor && !!this.#appState.identity.user.viewingContentFor[this.chatApp.chatAppId]);
    #addingFeedback = $state<boolean>(false);
    #feedbackDialogOpen = $state<boolean>(false);
    #allMemoryRecords = $state<RetrievedMemoryRecordSummary[]>([]);
    #allMemoryRecordsSorted = $derived.by(() => {
        return this.#allMemoryRecords.sort((a, b) => {
            return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
        });
    });
    #customDataForChatApp = $state<Record<string, unknown> | undefined>(undefined);

    // Sharing-related state
    #recentSharedSessionVisits = $state<SharedSessionVisitHistory[]>([]);
    #recentSharedSessions = $state<ChatSession<RecordOrUndef>[]>([]);
    #pinnedSessions = $state<PinnedObjAndChatSession[]>([]);
    showCurrentSessionDialog = $state<boolean>(false);
    #currentSessionIsSharedBySomeoneElse = $derived.by(() => {
        return this.#currentSession?.shareId !== undefined && this.#currentSession.userId !== this.#user.userId;
    });
    #currentShareId = $state<string | undefined>(undefined);
    #pinningSession = $state<boolean>(false);
    #unpinningSession = $state<boolean>(false);
    #sharingSession = $state<boolean>(false);
    #unsharingSession = $state<boolean>(false);
    #loadingPinnedSessions = $state<boolean>(false);
    #ensureThisSessionIsInList = $state<ChatSession<RecordOrUndef> | undefined>(undefined);
    #pinCurrentSessionState: 'disable-pin-feature' | 'pinned' | 'not-pinned' = $derived.by(() => {
        const currentSession = this.#currentSession;
        const isInterimSession = this.#isInterimSession;
        const pinnedSessions = this.#pinnedSessions;
        const pinningSession = this.#pinningSession;
        const unpinningSession = this.#unpinningSession;
        const loadingPinnedSessions = this.#loadingPinnedSessions;

        if (!currentSession || isInterimSession || loadingPinnedSessions || pinningSession || unpinningSession) {
            return 'disable-pin-feature';
        }

        const val = pinnedSessions.find((pin) => pin.chatSession.sessionId === currentSession.sessionId) ? 'pinned' : 'not-pinned';

        return val;
    });
    #shareCurrentSessionState: ShareSessionState = $derived.by(() => {
        const currentSession = this.#currentSession;
        const isInterimSession = this.#isInterimSession;
        const sharingSession = this.#sharingSession;
        const unsharingSession = this.#unsharingSession;

        if (!currentSession || isInterimSession || sharingSession || unsharingSession || this.#streamingResponseNow) {
            return 'disable-share-feature';
        }

        if (currentSession.userId === this.#user.userId) {
            // THis is a session that I created.
            if (currentSession.shareId) {
                return 'shared-by-me';
            } else {
                return 'not-shared';
            }
        } else {
            // This session was shared by someone else.
            if (currentSession.shareId) {
                return 'shared-by-someone-else';
            } else {
                return 'not-shared';
            }
        }
    });

    // Derived sharing properties
    #pinnedOwnSessions = $derived.by(() => this.#pinnedSessions.filter((pin) => pin.pinnedSession.sessionId));
    #pinnedSharedSessions = $derived.by(() => this.#pinnedSessions.filter((pin) => pin.pinnedSession.shareId));

    #currentSessionIsReadOnly = $derived(this.#currentSessionIsSharedBySomeoneElse);

    // You may not have overridden data if you are viewing content for another user.
    #userNeedsToProvideDataOverrides = $derived(
        !this.#isViewingContentForAnotherUser && this.#userDataOverrideSettings?.enabled && this.#userDataOverrideSettings?.userNeedsToProvideDataOverrides
    );

    userDataOverrideOperationInProgress: Record<UserOverrideDataCommand, boolean> = $state({
        getInitialDialogData: false,
        getValuesForAutoComplete: false,
        saveUserOverrideData: false,
        clearUserOverrideData: false
    });
    contentAdminOperationInProgress: Record<ContentAdminCommand, boolean> = $state({
        viewContentForUser: false,
        stopViewingContentForUser: false,
        getValuesForAutoComplete: false
    });
    #appSidebarState: SidebarState | undefined;
    #appSidebarOpen = $derived.by(() => {
        if (!this.#appSidebarState) {
            return false;
        }
        return this.#appState.isMobile ? this.#appSidebarState.openMobile : this.#appSidebarState.open;
    });
    #enableFileUpload = $derived.by(() => {
        return !this.#isViewingContentForAnotherUser && this.#features.fileUpload.mimeTypesAllowed.length > 0;
    });

    #user = $derived.by(() => {
        // If the user has override data for this chat app, we need to merge it with the user object.
        const user = this.#appState.identity.user;

        // console.log('[ChatAppState] User derived.by running:', { userId: user.userId, firstName: user.firstName });

        // You don't get to override data if you are viewing content for another user.
        if (!this.#isViewingContentForAnotherUser) {
            const userOverrideData = user.overrideData?.[this.chatApp.chatAppId];
            if (userOverrideData) {
                return { ...user, customData: userOverrideData };
            }
        }

        return user;
    });
    valuesForAutoCompleteForUserOverrideDialog = $state<Record<string, unknown[] | undefined>>({});
    initialDataForUserOverrideDialog = $state<unknown | undefined>(undefined);
    valuesForAutoCompleteForContentAdminDialog = $state<ChatUserLite[] | undefined>(undefined);
    #features = $state<ChatAppOverridableFeatures>() as ChatAppOverridableFeatures;
    #customDataUiRepresentation = $state<CustomDataUiRepresentation | undefined>(undefined);
    #tagDefs = $state<TagDefinition<TagDefinitionWidget>[]>([]);
    #showToast: ShowToastFn;
    #entityFeatureEnabled = $derived.by(() => {
        return this.#features.entity.enabled;
    });

    #spotlightWidgets = $state<SpotlightWidget[]>([]);
    #staticWidgets = $state<StaticWidgetTagDefinition[]>([]);
    #spotlightUserPrefs = $state<UserSpotlightPreferences | undefined>(undefined);
    #canvasWidget = $state<CanvasWidgetState | undefined>(undefined);
    #canvasOpen = $state(false);
    #dialogWidget = $state<DialogWidgetState | undefined>(undefined);
    #widgetDialogOpen = $state(false);
    #webComponentRenderer = $state<Component<any>>() as Component<any>;
    #webComponentUrls = $state<Record<string, string> | undefined>(undefined);

    // #userActionsInProgress: Record<string, boolean> = $state({
    //     pin-session: false,
    //     unpin-session: false,
    //     add-feedback: false,
    //     remove-feedback: false
    // });

    /**
     * Fisher-Yates shuffle algorithm for proper randomization
     */
    #shuffleArray<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    #suggestions: string[] = $derived.by(() => {
        const { suggestions, randomize, randomizeAfter, maxToShow } = this.#features.suggestions;
        if (suggestions.length === 0) {
            return [];
        }

        // Early return if no randomization needed
        if (!randomize) {
            return suggestions.length > maxToShow ? suggestions.slice(0, maxToShow) : suggestions;
        }

        // Handle randomization
        let result: string[];
        if (randomizeAfter > 0 && randomizeAfter < suggestions.length) {
            // Keep first N in order, shuffle the rest
            const keepInOrder = suggestions.slice(0, randomizeAfter);
            const toShuffle = suggestions.slice(randomizeAfter);
            const shuffled = this.#shuffleArray(toShuffle);
            result = [...keepInOrder, ...shuffled];
        } else {
            // Shuffle all suggestions
            result = this.#shuffleArray(suggestions);
        }

        // Apply maxToShow limit
        return result.length > maxToShow ? result.slice(0, maxToShow) : result;
    });

    get customTitleBarActions(): (ChatAppActionMenu | ChatAppAction)[] {
        return this.#customTitleBarActions;
    }

    get entityFeatureEnabled() {
        return this.#entityFeatureEnabled;
    }

    get shareCurrentSessionState() {
        return this.#shareCurrentSessionState;
    }

    // Spotlight getters
    get spotlightWidgets() {
        return this.#spotlightWidgets;
    }

    get staticWidgets() {
        return this.#staticWidgets;
    }

    // Canvas getters
    get canvasWidget() {
        return this.#canvasWidget;
    }

    get canvasOpen() {
        return this.#canvasOpen;
    }

    // Dialog getters
    get dialogWidget() {
        return this.#dialogWidget;
    }

    get widgetDialogOpen() {
        return this.#widgetDialogOpen;
    }

    set widgetDialogOpen(value: boolean) {
        this.#widgetDialogOpen = value;
    }

    get pinningSession() {
        return this.#pinningSession;
    }

    get unpinningSession() {
        return this.#unpinningSession;
    }

    get sharingSession() {
        return this.#sharingSession;
    }

    get unsharingSession() {
        return this.#unsharingSession;
    }

    get pinCurrentSessionState() {
        return this.#pinCurrentSessionState;
    }

    get showToast() {
        return this.#showToast;
    }

    get addingFeedback() {
        return this.#addingFeedback;
    }

    get feedbackDialogOpen() {
        return this.#feedbackDialogOpen;
    }

    set feedbackDialogOpen(value: boolean) {
        this.#feedbackDialogOpen = value;
    }

    /**
     * The user prefs for the current user for this chat app.
     */
    get userPrefs() {
        return this.#userPrefs;
    }

    /**
     * Get component-specific values set for a given user state for a given scope/tag.
     * Creates instance on first access and caches it.
     */
    getUserWidgetDataStoreState(scope: string, tag: string): UserWidgetDataStoreState {
        const key = `${scope}.${tag}`;

        if (!this.#userWidgetDataCache.has(key)) {
            const state = new UserWidgetDataStoreState(this.fetchz, scope, tag, this.#showToast);
            this.#userWidgetDataCache.set(key, state);
        }

        return this.#userWidgetDataCache.get(key)!;
    }

    /**
     * Getter for widget metadata Map (for parent components to access metadata by instanceId)
     */
    get widgetMetadata(): Map<string, WidgetMetadataState> {
        return this.#widgetMetadata;
    }

    /**
     * Get all tracked widget instances (includes DOM element references).
     * Map is keyed by instanceId.
     */
    get widgetInstances(): Map<string, WidgetInstance> {
        return this.#widgetInstances;
    }

    /**
     * Register a widget instance with its DOM element and metadata.
     * Called by renderers after injecting a web component.
     */
    registerWidgetInstance(instance: WidgetInstance): void {
        this.#widgetInstances.set(instance.instanceId, instance);
    }

    /**
     * Unregister a widget instance.
     * Called when a widget is removed/destroyed.
     */
    unregisterWidgetInstance(instanceId: string): void {
        this.#widgetInstances.delete(instanceId);
    }

    /**
     * Get a widget instance by its instanceId.
     */
    getWidgetInstance(instanceId: string): WidgetInstance | undefined {
        return this.#widgetInstances.get(instanceId);
    }

    /**
     * You set or update a custom title bar action by passing in a ChatAppActionMenu or ChatAppAction.
     * If you want to disable an action in the action menu, still just pass in the whole menu object that
     * includes the action you want to disable.
     *
     * @param action - The action to set or update
     * @example
     * ```
     * ctx.chatAppState.setOrUpdateCustomTitleBarAction({
     *   id: 'refresh',
     *   title: 'Refresh',
     *   iconSvg: '<svg>...</svg>',
     *   callback: () => refresh()
     * });
     * ```
     */
    setOrUpdateCustomTitleBarAction(action: ChatAppActionMenu | ChatAppAction) {
        // Loop through and if this ID exists, replace it, otherwise add it to the end.
        const existingIndex = this.#customTitleBarActions.findIndex((a) => a.id === action.id);
        if (existingIndex !== -1) {
            this.#customTitleBarActions[existingIndex] = action;
        } else {
            this.#customTitleBarActions.push(action);
        }
    }

    /**
     * Remove a custom title bar action by its ID.
     * @param actionId - The ID of the action to remove
     * @example
     * ```
     * ctx.chatAppState.removeCustomTitleBarAction('refresh');
     * ```
     */
    removeCustomTitleBarAction(actionId: string) {
        this.#customTitleBarActions = this.#customTitleBarActions.filter((a) => a.id !== actionId);
    }

    /**
     * Get a scoped metadata API for registering widget title and actions.
     * This returns an API object bound to a specific widget instance.
     *
     * **IMPORTANT**: instanceId and renderingContext are REQUIRED and must come from PikaWCContext.
     * These values are automatically set during component injection via injectChatAppWebComponent().
     *
     * @param scope - Widget scope (e.g., 'weather', 'pika')
     * @param tag - Widget tag (e.g., 'favorite-cities')
     * @param instanceId - Unique instance ID from context.instanceId (REQUIRED)
     * @param renderingContext - Rendering context from context.renderingContext (REQUIRED)
     * @returns Scoped API for this widget instance
     *
     * @example
     * ```
     * const ctx = await getPikaContext($host());
     * const metadata = ctx.chatAppState.getWidgetMetadataAPI(
     *   'weather',
     *   'my-widget',
     *   ctx.instanceId,  // REQUIRED - set during injection
     *   ctx.renderingContext       // REQUIRED - set during injection
     * );
     * ```
     */
    getWidgetMetadataAPI(scope: string, tag: string, instanceId: string, renderingContext: WidgetRenderingContextType): IWidgetMetadataAPI {
        // Validate required parameters
        if (!instanceId) {
            console.error(`[Widget Metadata] instanceId is required for ${scope}.${tag}. This should come from context.instanceId set during injection.`);
            throw new Error(`instanceId is required for getWidgetMetadataAPI. Widget: ${scope}.${tag}`);
        }

        if (!renderingContext) {
            console.error(`[Widget Metadata] renderingContext is required for ${scope}.${tag}. This should come from context.renderingContext set during injection.`);
            throw new Error(`renderingContext is required for getWidgetMetadataAPI. Widget: ${scope}.${tag}`);
        }

        // Return scoped API object
        return {
            setMetadata: (metadata: WidgetMetadata) => {
                // console.log(`[Widget Metadata] setMetadata called for ${scope}.${tag} (instance: ${instanceId})`, metadata);

                // Validate actions
                // if (metadata.actions && metadata.actions.length > 5) {
                //     console.warn(`[Widget Metadata] Widget ${scope}.${tag} has ${metadata.actions.length} actions (>5 recommended max)`);
                // }

                // Check for multiple primary actions
                // const primaryCount = metadata.actions?.filter((a) => a.primary).length || 0;
                // if (primaryCount > 1) {
                //     console.warn(`[Widget Metadata] Widget ${scope}.${tag} has ${primaryCount} primary actions (only first will be used)`);
                // }

                // Store metadata
                const storedMetadata = {
                    instanceId: instanceId,
                    scope,
                    tag,
                    title: metadata.title,
                    iconSvg: metadata.iconSvg,
                    iconColor: metadata.iconColor,
                    actions: metadata.actions || [],
                    renderingContext: renderingContext,
                    loadingStatus: metadata.loadingStatus
                };

                // console.log(`[Widget Metadata] Storing metadata for ${scope}.${tag}:`, storedMetadata);
                this.#widgetMetadata.set(instanceId, storedMetadata);

                // console.log(`[Widget Metadata] After set, widgetMetadata size:`, this.#widgetMetadata.size);
                // console.log(`[Widget Metadata] Can retrieve?`, this.#widgetMetadata.get(instanceId));
            },

            updateTitle: (title: string) => {
                const existing = this.#widgetMetadata.get(instanceId);
                if (existing) {
                    this.#widgetMetadata.set(instanceId, {
                        ...existing,
                        title
                    });
                    // console.log(`[Widget Metadata] Updated title for ${scope}.${tag} (instance: ${widgetInstanceId}): "${title}"`);
                }
            },

            updateAction: (actionId: string, updates: Partial<Omit<WidgetAction, 'id' | 'callback'>>) => {
                const existing = this.#widgetMetadata.get(instanceId);
                if (existing && existing.actions) {
                    const actionIndex = existing.actions.findIndex((a) => a.id === actionId);
                    if (actionIndex !== -1) {
                        const updatedActions = [...existing.actions];
                        updatedActions[actionIndex] = {
                            ...updatedActions[actionIndex],
                            ...updates
                        };
                        this.#widgetMetadata.set(instanceId, {
                            ...existing,
                            actions: updatedActions
                        });
                        // console.log(`[Widget Metadata] Updated action "${actionId}" for ${scope}.${tag} (instance: ${widgetInstanceId})`, updates);
                    }
                }
            },

            addAction: (action: WidgetAction) => {
                const existing = this.#widgetMetadata.get(instanceId);
                if (existing) {
                    this.#widgetMetadata.set(instanceId, {
                        ...existing,
                        actions: [...(existing.actions || []), action]
                    });
                    // console.log(`[Widget Metadata] Added action "${action.id}" for ${scope}.${tag} (instance: ${widgetInstanceId})`);
                }
            },

            removeAction: (actionId: string) => {
                const existing = this.#widgetMetadata.get(instanceId);
                if (existing && existing.actions) {
                    this.#widgetMetadata.set(instanceId, {
                        ...existing,
                        actions: existing.actions.filter((a) => a.id !== actionId)
                    });
                    // console.log(`[Widget Metadata] Removed action "${actionId}" for ${scope}.${tag} (instance: ${widgetInstanceId})`);
                }
            },

            setLoadingStatus: (loading: boolean, loadingMsg?: string) => {
                // console.log(`[Widget Metadata] setLoadingStatus called for ${scope}.${tag} (instance: ${instanceId})`, { loading, loadingMsg });
                const existing = this.#widgetMetadata.get(instanceId);
                // console.log(`[Widget Metadata] Existing metadata:`, existing);

                if (existing) {
                    const updated = {
                        ...existing,
                        loadingStatus: {
                            loading,
                            loadingMsg
                        }
                    };
                    // console.log(`[Widget Metadata] Setting updated metadata:`, updated);
                    this.#widgetMetadata.set(instanceId, updated);
                    // console.log(`[Widget Metadata] After setLoadingStatus, can retrieve?`, this.#widgetMetadata.get(instanceId));
                } else {
                    console.warn(`[Widget Metadata] No existing metadata found for ${scope}.${tag} (instance: ${instanceId})`);
                }
            }
        };
    }

    get mode() {
        return this.#mode;
    }

    get customDataUiRepresentation() {
        return this.#customDataUiRepresentation;
    }

    get features() {
        return this.#features;
    }

    get tagDefs() {
        return this.#tagDefs;
    }

    get userIsContentAdmin() {
        return this.#userIsContentAdmin;
    }

    get contentAdminDialogOpen() {
        return this.#contentAdminDialogOpen;
    }

    set contentAdminDialogOpen(value: boolean) {
        if (!this.#userIsContentAdmin) {
            return;
        }

        this.#contentAdminDialogOpen = value;
    }

    get userNeedsToProvideDataOverrides() {
        return this.#userNeedsToProvideDataOverrides;
    }

    get isViewingContentForAnotherUser() {
        return this.#isViewingContentForAnotherUser ?? false;
    }

    get user() {
        return this.#user;
    }

    get allMemoryRecordsSorted() {
        return this.#allMemoryRecordsSorted;
    }

    // Sharing getters
    get recentSharedSessionVisits() {
        return this.#recentSharedSessionVisits;
    }

    get pinnedSessions() {
        return this.#pinnedSessions;
    }

    get pinnedOwnSessions() {
        return this.#pinnedOwnSessions;
    }

    get pinnedSharedSessions() {
        return this.#pinnedSharedSessions;
    }

    get currentSessionIsSharedBySomeoneElse() {
        return this.#currentSessionIsSharedBySomeoneElse;
    }

    get currentShareId() {
        return this.#currentShareId;
    }

    get currentSessionIsReadOnly() {
        return this.#currentSessionIsReadOnly;
    }

    get sortedChatSessions() {
        return this.#sortedChatSessions;
    }

    get userDataOverrideSettings() {
        return this.#userDataOverrideSettings;
    }

    get userDataOverrideDialogOpen() {
        return this.#userDataOverrideDialogOpen;
    }

    set userDataOverrideDialogOpen(value: boolean) {
        // Just in case, if they aren't allowed to use user overrides, don't let them open the dialog
        if (!this.#userDataOverrideSettings.enabled) {
            return;
        }
        this.#userDataOverrideDialogOpen = value;
    }

    get componentRegistry() {
        return this.#componentRegistry;
    }

    get widgetRegistry() {
        return this.#widgetRegistry;
    }

    get suggestions() {
        return this.#suggestions;
    }

    get enableFileUpload() {
        return this.#enableFileUpload;
    }

    get chatSessions() {
        return this.#chatSessions;
    }

    get messageChunkCount() {
        return this.#messageChunkCount;
    }

    get waitingForFirstStreamedResponse() {
        return this.#waitingForFirstStreamedResponse;
    }

    get isStreamingResponseNow() {
        return this.#streamingResponseNow;
    }

    get isInterimSession() {
        return this.#isInterimSession;
    }

    get currentSession() {
        return this.#currentSession;
    }

    get currentSessionMessages() {
        return this.#curSessionMessages;
    }

    get inputFiles() {
        return this.#inputFiles;
    }

    get newSession() {
        return this.#newSession;
    }

    get chatInput() {
        return this.#isViewingContentForAnotherUser ? 'You may not send messages while viewing content for another user.' : this.#chatInput;
    }

    set chatInput(msg: string) {
        if (this.#isViewingContentForAnotherUser) {
            return;
        }

        this.#chatInput = msg;
        this.#persistInputState();
    }

    get chatApp() {
        return this.#chatApp;
    }

    set chatApp(chatApp: ChatApp) {
        this.#chatApp = chatApp;
    }

    get retrievingMessages() {
        return this.#retrievingMessages;
    }

    get nav() {
        if (!this.#nav) {
            if (!this.#page) {
                throw new Error('Page object is not set in app state when trying to create nav state');
            }
            this.#nav = new ChatNavState(this.#page);
        }
        return this.#nav;
    }

    get pageTitle() {
        return this.#pageTitle;
    }

    get pageHeaderRight() {
        return this.#pageHeaderRight;
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

    constructor(
        private readonly fetchz: FetchZ,
        chatApp: ChatApp,
        page: Page,
        appState: AppState,
        componentRegistry: ComponentRegistry,
        userDataOverrideSettings: UserDataOverrideSettings,
        userIsContentAdmin: boolean,
        features: ChatAppOverridableFeatures,
        customDataUiRepresentation: CustomDataUiRepresentation | undefined,
        mode: ChatAppMode,
        tagDefinitions: TagDefinition<TagDefinitionWidget>[],
        showToast: ShowToastFn,
        webComponentRenderer: Component<any>,
        webComponentUrls: Record<string, string> | undefined,
        customDataForChatApp: Record<string, unknown> | undefined
    ) {
        this.#chatApp = chatApp;
        this.#appState = appState;
        this.#loadInprogressInputs();
        this.#uploadState = new UploadState(this.fetchz, showToast);
        this.#setSession(undefined);
        this.#page = page;
        this.#componentRegistry = componentRegistry;
        this.#widgetRegistry = new WidgetRegistry();
        this.#webComponentUrls = webComponentUrls;
        this.#customDataForChatApp = customDataForChatApp;

        // Apply local URL overrides to tag definitions for rapid development
        const tagDefinitionsWithOverrides = this.#applyWebComponentUrlOverrides(tagDefinitions);

        // Initialize canonical tag map to ensure same S3 files use same URL
        initializeCanonicalTagMap(tagDefinitionsWithOverrides);

        this.#widgetRegistry.registerTagDefinitions(tagDefinitionsWithOverrides);

        this.#webComponentRenderer = webComponentRenderer;

        // Register web component renderers dynamically based on tag definitions
        this.registerWebComponentRenderers(tagDefinitionsWithOverrides);

        this.#messageProcessor = new MessageSegmentProcessor(componentRegistry, showToast);
        this.#userDataOverrideSettings = userDataOverrideSettings;
        this.#userIsContentAdmin = userIsContentAdmin;
        this.#features = features;
        this.#customDataUiRepresentation = customDataUiRepresentation;
        this.#tagDefs = tagDefinitionsWithOverrides;
        this.#mode = mode;
        this.#userPrefs = new UserPrefsState(this.fetchz, showToast);

        // Initialize static widgets
        this.#initializeStaticWidgets();
        this.#showToast = showToast;

        if (this.#userDataOverrideSettings?.userNeedsToProvideDataOverrides) {
            this.#userDataOverrideDialogOpen = true;
        }

        // Add logging for session messages array changes
        // $effect(() => {
        //     const messages = this.#curSessionMessages;
        //     console.log('[CHAT-APP-STATE] Session messages array changed:', {
        //         messagesCount: messages.length,
        //         messagesArrayId: Object.prototype.toString.call(messages),
        //         messageIds: messages.map((msg) => msg.messageId),
        //         interimMessage: messages.find((msg) => msg.messageId?.startsWith('interim-'))
        //             ? {
        //                   messageId: messages.find((msg) => msg.messageId?.startsWith('interim-'))!.messageId,
        //                   messageObjectId: Object.prototype.toString.call(messages.find((msg) => msg.messageId?.startsWith('interim-'))),
        //                   segmentsArrayId: Object.prototype.toString.call(messages.find((msg) => msg.messageId?.startsWith('interim-'))!.segments),
        //                   segmentsCount: messages.find((msg) => msg.messageId?.startsWith('interim-'))!.segments.length
        //               }
        //             : undefined
        //     });
        // });
    }

    /**
     * Register web component renderers dynamically based on tag definitions.
     * This allows inline rendering of web component tags in chat messages.
     */
    private registerWebComponentRenderers(tagDefinitions: TagDefinition<TagDefinitionWidget>[]) {
        // Register a renderer for each web component tag
        for (const tagDef of tagDefinitions) {
            if (tagDef.widget.type === 'web-component' && tagDef.renderingContexts?.inline?.enabled) {
                // Register with full tag name (scope.tag format)
                const fullTagName = `${tagDef.scope}.${tagDef.tag}`;
                this.#componentRegistry.registerRenderer(fullTagName, this.#webComponentRenderer);
            }
        }
    }

    /**
     * Apply local web component URL overrides for rapid development.
     * Allows developers to point tag definitions to local dev servers without redeploying.
     *
     * @param tagDefinitions - Original tag definitions from the server
     * @returns Tag definitions with URL overrides applied
     */
    #applyWebComponentUrlOverrides(tagDefinitions: TagDefinition<TagDefinitionWidget>[]): TagDefinition<TagDefinitionWidget>[] {
        // If no overrides configured, return original definitions
        if (!this.#webComponentUrls || Object.keys(this.#webComponentUrls).length === 0) {
            return tagDefinitions;
        }

        // Clone and apply overrides
        return tagDefinitions.map((tagDef) => {
            const key = `${tagDef.scope}.${tagDef.tag}`;
            const overrideUrl = this.#webComponentUrls![key];

            // If no override for this tag, or not a web component, return as-is
            if (!overrideUrl || tagDef.widget.type !== 'web-component') {
                return tagDef;
            }

            // Clone the tag definition and apply the override
            const clonedTagDef = { ...tagDef };
            clonedTagDef.widget = {
                ...tagDef.widget,
                webComponent: {
                    ...tagDef.widget.webComponent,
                    url: overrideUrl,
                    s3: undefined // Remove S3 config when using URL override
                }
            };

            // console.log(`[ChatAppState] Applied web component URL override for ${key}:`, overrideUrl);
            return clonedTagDef;
        });
    }

    setCurrentSessionById(sessionId: string) {
        this.#setSession(this.#chatSessions.find((session) => session.sessionId === sessionId));
    }

    /**
     * Load in-progress inputs from localStorage
     */
    #loadInprogressInputs() {
        try {
            const stored = localStorage.getItem(INPROGRESS_INPUT_MSGS_KEY);
            if (!stored) {
                this.#inprogressInputs = {};
                return;
            }

            this.#inprogressInputs = JSON.parse(stored);
        } catch (e) {
            console.error('Error loading in-progress inputs from localStorage:', e);
            this.#inprogressInputs = {};
        }
    }

    /**
     * Persist current input state (text and completed uploads) to localStorage
     */
    #persistInputState() {
        const sessionId = this.#currentSession?.sessionId ?? 'interim';
        const text = this.#chatInput;
        const completedUploads = this.#inputFiles
            .filter((upload) => upload.status.status === 'completed')
            .map(
                (upload) =>
                    ({
                        s3Key: upload.s3Key,
                        fileName: upload.fileName,
                        size: upload.size,
                        lastModified: upload.lastModified,
                        type: upload.type,
                        status: upload.status
                    }) as UploadInstance
            );

        const hasFileStillOnTheObject = completedUploads.some((upload) => !!upload.file);
        if (hasFileStillOnTheObject) {
            throw new Error('Uploads still have files on the object, not persisting.  Should not be possible so this is a bug.');
        }

        if (text === '' && completedUploads.length === 0) {
            delete this.#inprogressInputs[sessionId];
        } else {
            this.#inprogressInputs[sessionId] = {
                text,
                uploads: completedUploads
            };
        }

        localStorage.setItem(INPROGRESS_INPUT_MSGS_KEY, JSON.stringify(this.#inprogressInputs));
    }

    /**
     * Pass in undefined to create a new interim session for a new chat session.
     */
    #setSession(session: ChatSession<RecordOrUndef> | undefined) {
        if (session) {
            this.#currentSession = session;
            this.#curSessionMessages = [];
            this.refreshMessagesForCurrentSession();
        } else {
            // Make a new interim session if we don't have an interim sessionId/message in progress in local storage
            // otherwise use the interim sessionId from local storage
            let inprogressInterimSessionId = Object.keys(this.#inprogressInputs).find((key) => key.startsWith('interim-'));
            this.#currentSession = {
                sessionId: inprogressInterimSessionId ?? `interim-${uuidv7()}`,
                userId: this.#user.userId,
                chatAppId: this.#chatApp.chatAppId,
                agentId: 'interim-agent-id',
                identityId: this.#user.userId,
                source: 'user',
                entityId: '', // Don't need a real value for this on an interim session
                invocationMode: 'chat-app',
                sessionAttributes: {
                    token: 'interim-token',
                    firstName: this.#user.firstName,
                    lastName: this.#user.lastName,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    ...(this.#user.customData ? this.#user.customData : {}),
                    agentId: this.#chatApp.agentId,
                    userId: this.#user.userId,
                    chatAppId: this.#chatApp.chatAppId,
                    currentDate: new Date().toISOString()
                },
                createDate: new Date().toISOString(),
                lastUpdate: new Date().toISOString()
            };
            this.#curSessionMessages = [];
        }

        // Restore both text input and upload instances for this session
        const persistedState = this.#inprogressInputs[this.#currentSession.sessionId];
        this.#chatInput = persistedState?.text ?? '';
        this.#inputFiles = persistedState?.uploads || [];
    }

    async addFeedback(feedback: ChatSessionFeedbackForCreate) {
        this.#addingFeedback = true;
        try {
            const req: AddChatSessionFeedbackRequest = {
                feedback: feedback
            };
            const response = await this.fetchz('/api/session-feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(req)
            });

            checkClientResponse(response, 'adding feedback', this.#showToast, CLIENT_RESOURCE_NAMES.FEEDBACK);
        } catch (error) {
            handleClientError(error, 'adding feedback', this.#showToast, 'adding feedback failed:');
            throw error;
        } finally {
            this.#addingFeedback = false;
        }
    }

    removeFile(s3Key: string) {
        this.#inputFiles = this.#inputFiles.filter((file) => file.s3Key !== s3Key);
        // Persist the updated state
        this.#persistInputState();
    }

    startNewChatSession() {
        if (this.#isInterimSession) {
            throw new Error('Cannot start a new chat session from an interim session');
        }

        this.#setSession(undefined);
    }

    async refreshChatSessions() {
        try {
            this.#refreshingChatSessions = true;
            const resp = await this.fetchz(`/api/session/${this.#chatApp.chatAppId}`);

            const sessionsResult = await checkClientResponseAndBody<ChatSessionsResponse>(resp, 'refreshing chat sessions', this.#showToast, CLIENT_RESOURCE_NAMES.SESSION);

            this.#chatSessions = sessionsResult.sessions;

            const ensureThisSessionIsInList = this.#ensureThisSessionIsInList;

            if (ensureThisSessionIsInList) {
                if (!this.#chatSessions.find((s) => s.sessionId === ensureThisSessionIsInList.sessionId)) {
                    this.#chatSessions.push(ensureThisSessionIsInList);
                }
                this.setCurrentSessionById(ensureThisSessionIsInList.sessionId);
                this.#ensureThisSessionIsInList = undefined;
            }
        } catch (error) {
            handleClientError(error, 'refreshing chat sessions', this.#showToast, 'refreshing chat sessions failed:');
            throw error;
        } finally {
            this.#refreshingChatSessions = false;
        }
    }

    async downloadFile(s3Key: string) {
        try {
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
            console.error('Error downloading file', e);
            throw e;
        }
    }

    async getS3TextFileContent(s3Key: string) {
        const resp = await this.fetchz(`/api/s3-file-content/${encodeURIComponent(s3Key)}`);
        const blob = await resp.blob();
        return await blob.text();
    }

    async refreshMessagesForCurrentSession() {
        if (this.#isInterimSession) return; // Not a real session yet

        try {
            this.#retrievingMessages = true;
            const resp = await this.fetchz(
                `/api/message/${this.#chatApp.chatAppId}/${this.#currentSession.sessionId}${this.#currentSessionIsSharedBySomeoneElse ? `?shareId=${this.#currentSession.shareId}` : ''}`
            );

            const msgResult = await checkClientResponseAndBody<ChatMessagesResponse>(resp, 'refreshing messages', this.#showToast, CLIENT_RESOURCE_NAMES.MESSAGE);

            this.#curSessionMessages = msgResult.messages.map((msg) => this.#processMessageIntoSegments({ ...msg, segments: [] }, false));
        } catch (error) {
            handleClientError(error, 'refreshing messages', this.#showToast, 'refreshing messages failed:');
        } finally {
            this.#retrievingMessages = false;
        }
    }

    async loadAllMemoryRecords() {
        try {
            const strategies = DEFAULT_MEMORY_STRATEGIES;
            this.#allMemoryRecords = [];
            for (const strategy of strategies) {
                let nextToken: string | undefined = undefined;
                do {
                    const response = await this.fetchz('/api/memory', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ strategy, nextToken })
                    });

                    checkClientResponse(response, 'loading memory records', this.#showToast, CLIENT_RESOURCE_NAMES.MEMORY);

                    const json = (await response.json()) as SearchAllMyMemoryRecordsResponse;
                    this.#allMemoryRecords.push(...json.results.records);
                    nextToken = json.results.nextToken;
                } while (nextToken);
            }
        } catch (error) {
            handleClientError(error, 'loading memory records', this.#showToast, 'loading memory records failed:');
            throw error;
        }
    }

    async sendMessage() {
        if (!this.#chatInput.trim()) return;

        if (this.#userNeedsToProvideDataOverrides) {
            this.#userDataOverrideDialogOpen = true;
            return;
        }

        this.#streamingResponseNow = true;
        this.#messageChunkCount = 0;
        const messageToSendToServer = this.#chatInput;

        let sessionId = this.#currentSession.sessionId;

        // Add user message to the conversation immediately (a ChatMessage is what is sent to the server and saved to the database)
        const userMessage: ChatMessage = {
            userId: this.#user.userId,
            sessionId,
            messageId: `user-${uuidv7()}`,
            message: messageToSendToServer,
            source: 'user',
            timestamp: new Date().toISOString(),
            ...(this.#inputFiles.length > 0 && {
                files: this.#inputFiles.map((file) => ({
                    fileId: `s3://REPLACE_ME_SERVER_SIDE/${file.s3Key}`,
                    s3Bucket: 'REPLACE_ME_SERVER_SIDE',
                    s3Key: file.s3Key,
                    fileName: file.fileName,
                    locationType: 's3',
                    size: file.size,
                    lastModified: file.lastModified,
                    type: file.type
                }))
            })
        };
        this.#curSessionMessages.push(this.#processMessageIntoSegments({ ...userMessage, segments: [] }, false));

        // Add interim assistant message for streaming
        const interimMessageId = `interim-${uuidv7()}`;
        const interimMessage: ChatMessageForRendering = {
            userId: this.#user.userId,
            sessionId,
            messageId: interimMessageId,
            message: '',
            segments: [],
            isStreaming: true,
            source: 'assistant',
            timestamp: new Date().toISOString()
        };
        this.#curSessionMessages.push(interimMessage);

        this.#interimMessageId = interimMessageId;
        this.chatInput = ''; // Be sure to use the setter so side effects are triggered

        //TODO: how do we figure out the right file use case? pass-through or chat or analytics?
        const files: ChatMessageFile[] | undefined =
            this.#inputFiles.length === 0
                ? undefined
                : this.#inputFiles.map((file) => ({
                      fileId: `s3://REPLACE_ME_SERVER_SIDE/${file.s3Key}`,
                      s3Bucket: 'REPLACE_ME_SERVER_SIDE',
                      s3Key: file.s3Key,
                      fileName: file.fileName,
                      locationType: 's3',
                      size: file.size,
                      lastModified: file.lastModified,
                      type: file.type
                  }));

        const wasInterimSession = this.#isInterimSession;

        try {
            const converseRequest: ConverseRequest = {
                message: messageToSendToServer,
                userId: this.#user.userId,
                source: 'user',
                sessionId: wasInterimSession ? undefined : sessionId,
                agentId: this.#chatApp.agentId,
                chatAppId: this.#chatApp.chatAppId,
                features: {} as ChatAppOverridableFeatures, // This will be set server side
                timezone: this.#currentSession.sessionAttributes?.timezone,
                ...(files && { files })
            };
            // Send the message to the server and stream the response
            const response = await this.fetchz('/api/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(converseRequest)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            let newSessionId: string | undefined;

            // Extract session ID from headers if this was a new session
            if (wasInterimSession) {
                newSessionId = response.headers.get('x-chatbot-session-id') ?? undefined;
                // If we don't get a new session ID, then we need to throw an error
                if (!newSessionId) {
                    interimMessage.isStreaming = false;
                    throw new Error('No session ID returned from server');
                }

                // Clear input files and persist state before changing session ID
                // This will clean up the interim session entry with empty state
                this.#inputFiles = [];
                this.#persistInputState();

                // console.log('[CHAT-APP-STATE] Updating session ID from interim to real:', {
                //     oldSessionId: this.#currentSession.sessionId,
                //     newSessionId: newSessionId,
                //     messagesCount: this.#curSessionMessages.length,
                //     currentInterimMsg: interimMessage
                //         ? {
                //               messageId: interimMessage.messageId,
                //               segmentsCount: interimMessage.segments.length,
                //               messageObjectId: Object.prototype.toString.call(interimMessage),
                //               segmentsArrayId: Object.prototype.toString.call(interimMessage.segments)
                //           }
                //         : 'not found'
                // });

                // Update the current session with the real session ID
                // Create a new session object instead of mutating the existing one
                const oldSession = this.#currentSession;

                // Create entirely new session object with updated sessionId
                this.#currentSession = {
                    ...oldSession,
                    sessionId: newSessionId
                };

                // Update the messages with the new session ID
                const oldMessages = this.#curSessionMessages;
                this.#curSessionMessages = this.#curSessionMessages.map((msg) => ({
                    ...msg,
                    sessionId: newSessionId!
                }));

                // console.log('[CHAT-APP-STATE] After session ID update:', {
                //     oldMessagesArrayId: Object.prototype.toString.call(oldMessages),
                //     newMessagesArrayId: Object.prototype.toString.call(this.#curSessionMessages),
                //     interimMsgAfterUpdate: this.getMessageByMessageId(interimMessageId)
                //         ? {
                //               messageId: this.getMessageByMessageId(interimMessageId)!.messageId,
                //               messageObjectId: Object.prototype.toString.call(this.getMessageByMessageId(interimMessageId)),
                //               segmentsArrayId: Object.prototype.toString.call(this.getMessageByMessageId(interimMessageId)!.segments),
                //               segmentsCount: this.getMessageByMessageId(interimMessageId)!.segments.length
                //           }
                //         : 'not found after update'
                // });
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }

            const decoder = new TextDecoder();

            // Read the stream chunk by chunk
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    // Stream is complete
                    break;
                }

                // Decode the chunk and append to accumulated text of the interim message
                this.#appendToInterimMessage(decoder.decode(value, { stream: true }));
            }

            // Streaming is complete - convert any incomplete/streaming segments to text
            if (this.#interimMessageId) {
                const interimMsg = this.getMessageByMessageId(this.#interimMessageId);
                if (interimMsg) {
                    this.#messageProcessor.doneStreaming(interimMsg.segments);
                    interimMsg.isStreaming = false;
                }
            }

            // Refresh sessions and its messages
            await this.refreshChatSessions();

            // After refreshing sessions, make sure currentSession points to the fresh object from the server
            if (wasInterimSession) {
                const freshSession = this.#chatSessions.find((s) => s.sessionId === newSessionId);
                if (freshSession) {
                    this.#currentSession = freshSession;
                }
            }

            this.refreshMessagesForCurrentSession();

            // Files already cleared above for interim sessions, but clear for non-interim sessions too
            if (!wasInterimSession) {
                this.#inputFiles = [];
                this.#persistInputState();
            }
        } catch (error) {
            console.error('Error sending message:', error);
            //TODO: what should we do here?
            // // Remove the interim message on error
            // if (this.#curSessionMessages && this.#interimMessageId) {
            //     this.#curSessionMessages = this.#curSessionMessages.filter(
            //         (msg) => msg.messageId !== this.#interimMessageId!.messageId
            //     );
            // }
            // You might want to show an error message to the user here
            this.#showToast('Error sending message.  Please try again later.', { type: 'error' });
        } finally {
            //TODO: if we get an error what do we do with the interim messages and session?  I think we keep them there.
            this.#streamingResponseNow = false;
        }
    }

    /**
     * Invoke the agent directly from a web component using the 'chat-app-component' invocation mode.
     * This is used for out-of-band requests that don't show up as user-created sessions.
     *
     * @param scope - The scope of the tag definition (e.g., 'weather')
     * @param tag - The tag name (e.g., 'favorite-cities')
     * @param instructionName - The key in the tag definition's componentAgentInstructionsMd
     * @param userMessage - The message/query to send to the agent
     * @param options - Optional streaming callbacks and control options
     * @returns The parsed JSON response from the agent
     * @throws Error if the request fails or response cannot be parsed
     */
    async invokeAgentAsComponent<T = any>(scope: string, tag: string, instructionName: string, userMessage: string, options?: InvokeAgentAsComponentOptions): Promise<T> {
        try {
            const converseRequest: ConverseRequest = {
                message: userMessage,
                userId: this.#user.userId,
                source: options?.source ?? 'component',
                agentId: this.#chatApp.agentId,
                chatAppId: this.#chatApp.chatAppId,
                features: {} as ChatAppOverridableFeatures, // This will be set server side
                timezone: this.#currentSession.sessionAttributes?.timezone,
                invocationMode: 'chat-app-component',
                chatAppComponentConfig: {
                    componentAgentInstructionName: instructionName,
                    componentTagDefinition: {
                        scope,
                        tag
                    }
                }
            };

            const response = await this.fetchz('/api/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(converseRequest)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Process the streamed response
            const answerText = await this.#processComponentStream(response, options);

            // Try to parse as JSON
            try {
                return JSON.parse(answerText) as T;
            } catch (parseError) {
                // If direct JSON parsing fails, try to extract JSON-like text
                const parsed = findAndParseJsonLikeText(answerText);

                if (parsed.length > 0) {
                    // console.log('Extracted and parsed JSON:', parsed[0]);
                    return parsed[0] as T;
                }

                // If nothing worked, return the text as-is
                console.warn('Component invocation response was not JSON, returning as text:', answerText);
                return answerText as T;
            }
        } catch (error) {
            console.error('Error invoking component:', error);
            throw error;
        }
    }

    /**
     * Process a component invocation stream, extracting the answer text and calling callbacks
     * @param response The fetch response
     * @param options Optional streaming callbacks
     * @returns The extracted answer text (without traces or tags)
     */
    async #processComponentStream(response: Response, options?: InvokeAgentAsComponentOptions): Promise<string> {
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('Response body is not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let answerText = '';

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process any complete elements in the buffer
                const result = this.#extractFromBuffer(buffer, options);
                answerText += result.answerChunk;
                buffer = result.remainingBuffer;
            }

            // Process any remaining buffer content
            if (buffer.trim()) {
                // Any remaining non-tag content is part of the answer
                const result = this.#extractFromBuffer(buffer + '\n', options);
                answerText += result.answerChunk;
            }

            return answerText;
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Extract traces and answer content from a buffer chunk
     * @param buffer The buffer to process
     * @param options Optional callbacks
     * @returns Object with extracted answer chunk and remaining buffer
     */
    #extractFromBuffer(buffer: string, options?: InvokeAgentAsComponentOptions): { answerChunk: string; remainingBuffer: string } {
        let answerChunk = '';
        let processedUpTo = 0;

        // Find and process all <trace>...</trace> tags
        const traceRegex = /<trace>(.*?)<\/trace>/gs;
        let match: RegExpExecArray | null;
        let lastIndex = 0;

        while ((match = traceRegex.exec(buffer)) !== null) {
            // Everything before this trace is potential answer content
            if (match.index > lastIndex) {
                answerChunk += buffer.substring(lastIndex, match.index);
            }

            // Process the trace
            if (options?.onTrace || options?.onThinking || options?.onToolCall) {
                try {
                    const traceJson = JSON.parse(match[1]);

                    if (options.onTrace && options.includeTraces) {
                        options.onTrace(traceJson);
                    }

                    // Extract thinking/rationale
                    if (options.onThinking && traceJson.orchestrationTrace?.rationale?.text) {
                        options.onThinking(traceJson.orchestrationTrace.rationale.text);
                    }

                    // Extract tool calls
                    if (options.onToolCall && traceJson.orchestrationTrace?.invocationInput?.actionGroupInvocationInput) {
                        const invocation = traceJson.orchestrationTrace.invocationInput.actionGroupInvocationInput;
                        options.onToolCall({
                            name: `${invocation.actionGroupName}__${invocation.function}`,
                            params: invocation.parameters || {}
                        });
                    }
                } catch (e) {
                    console.warn('Failed to parse trace:', e);
                }
            }

            lastIndex = match.index + match[0].length;
            processedUpTo = lastIndex;
        }

        // Add any remaining content after the last trace
        if (lastIndex < buffer.length) {
            // Check if there's an incomplete trace at the end
            const incompleteTraceStart = buffer.lastIndexOf('<trace>', lastIndex);
            if (incompleteTraceStart > lastIndex) {
                // We have an incomplete trace, don't include it in answer yet
                answerChunk += buffer.substring(lastIndex, incompleteTraceStart);
                processedUpTo = incompleteTraceStart;
            } else {
                // No incomplete trace, add everything
                answerChunk += buffer.substring(lastIndex);
                processedUpTo = buffer.length;
            }
        }

        // Extract content from <answer>...</answer> tags if present
        const answerMatch = answerChunk.match(/<answer>(.*?)<\/answer>/s);
        if (answerMatch) {
            answerChunk = answerMatch[1];
        }

        // Call onProgress if provided
        if (options?.onProgress && answerChunk) {
            options.onProgress(answerChunk);
        }

        return {
            answerChunk,
            remainingBuffer: buffer.substring(processedUpTo)
        };
    }

    async sendUserOverrideDataCommand(request: UserOverrideDataCommandRequest) {
        try {
            this.userDataOverrideOperationInProgress[request.command] = true;
            const response = await this.fetchz('/api/user-data-override', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
            });

            checkClientResponse(response, 'sending user override data command', this.#showToast);

            const json: UserOverrideDataCommandResponse = await response.json();
            if (!json) {
                this.#showToast('Invalid response for user override data command', { type: 'error' });
                throw new Error('Invalid response for user override data command');
            } else if ('success' in json && json.success === false) {
                this.#showToast(json.error || 'User override data command failed', { type: 'error' });
                throw new Error(json.error || 'User override data command failed');
            } else if (request.command === 'getInitialDialogData') {
                this.initialDataForUserOverrideDialog = (json as GetInitialDialogDataResponse).data ?? undefined;
            } else if (request.command === 'getValuesForAutoComplete') {
                if (!this.valuesForAutoCompleteForUserOverrideDialog) {
                    this.valuesForAutoCompleteForUserOverrideDialog = {};
                }

                const values = (json as GetValuesForAutoCompleteResponse).data ?? undefined;
                if (values) {
                    this.valuesForAutoCompleteForUserOverrideDialog[request.componentName] = values;
                } else {
                    delete this.valuesForAutoCompleteForUserOverrideDialog[request.componentName];
                }
            } else if (request.command === 'saveUserOverrideData') {
                this.#appState.identity.updateUserOverrideData(this.#chatApp.chatAppId, (json as SaveUserOverrideDataResponse).data);
            } else if (request.command === 'clearUserOverrideData') {
                this.#appState.identity.clearUserOverrideData(this.#chatApp.chatAppId);
            }
        } catch (error) {
            handleClientError(error, 'sending user override data command', this.#showToast, 'sending user override data command failed:');
            throw error;
        } finally {
            this.userDataOverrideOperationInProgress[request.command] = false;
        }
    }

    async sendContentAdminCommand(request: ContentAdminRequest) {
        try {
            this.contentAdminOperationInProgress[request.command] = true;
            const response = await this.fetchz('/api/content-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
            });

            checkClientResponse(response, 'sending content admin command', this.#showToast);

            const json: ContentAdminResponse = await response.json();
            if (!json) {
                this.#showToast('Invalid response for content admin command', { type: 'error' });
                throw new Error('Invalid response for content admin command');
            } else if ('success' in json && json.success === false) {
                this.#showToast(json.error || 'Content admin command failed', { type: 'error' });
                throw new Error(json.error || 'Content admin command failed');
            } else if (request.command === 'getValuesForAutoComplete') {
                if (!this.valuesForAutoCompleteForContentAdminDialog) {
                    this.valuesForAutoCompleteForContentAdminDialog = [];
                }
                this.valuesForAutoCompleteForContentAdminDialog = (json as GetValuesForContentAdminAutoCompleteResponse).data ?? undefined;
            } else if (request.command === 'viewContentForUser') {
                this.#appState.identity.updateViewingContentFor(this.#chatApp.chatAppId, request.user);
            } else if (request.command === 'stopViewingContentForUser') {
                this.#appState.identity.clearViewingContentFor(this.#chatApp.chatAppId);
            }
        } catch (error) {
            handleClientError(error, 'sending content admin command', this.#showToast, 'sending content admin command failed:');
            throw error;
        } finally {
            this.contentAdminOperationInProgress[request.command] = false;
        }
    }

    #appendToInterimMessage(message: string) {
        // console.log('[CHAT-APP-STATE] appendToInterimMessage called:', {
        //     chunkLength: message.length,
        //     chunkPreview: message.substring(0, 50),
        //     interimMessageId: this.#interimMessageId,
        //     messageChunkCount: this.#messageChunkCount
        // });

        if (this.#interimMessageId) {
            const interimMsg = this.getMessageByMessageId(this.#interimMessageId);
            if (interimMsg) {
                // console.log('[CHAT-APP-STATE] Found interim message:', {
                //     messageId: interimMsg.messageId,
                //     currentMessageLength: interimMsg.message.length,
                //     segmentsCount: interimMsg.segments.length,
                //     messageObjectId: Object.prototype.toString.call(interimMsg),
                //     segmentsArrayId: Object.prototype.toString.call(interimMsg.segments)
                // });

                const oldMessage = interimMsg.message;
                interimMsg.message += message;

                // console.log('[CHAT-APP-STATE] Updated message text:', {
                //     oldLength: oldMessage.length,
                //     newLength: interimMsg.message.length,
                //     chunkAdded: message.length
                // });

                // Pass only the new chunk to the processor, not the full accumulated message
                // console.log('[CHAT-APP-STATE] Calling messageProcessor.parseMessage:', {
                //     chunkLength: message.length,
                //     segmentsBeforeProcessing: interimMsg.segments.length,
                //     streaming: true
                // });

                this.#messageProcessor.parseMessage(message, interimMsg.segments, true); // streaming=true

                // console.log('[CHAT-APP-STATE] After messageProcessor.parseMessage:', {
                //     segmentsAfterProcessing: interimMsg.segments.length,
                //     segmentStatuses: interimMsg.segments.map((seg, idx) => ({
                //         index: idx,
                //         segmentType: seg.segmentType,
                //         streamingStatus: seg.streamingStatus,
                //         rawContentPreview: seg.rawContent?.substring(0, 30) || '<no content>',
                //         tag: seg.segmentType === 'tag' ? (seg as any).tag : undefined
                //     }))
                // });

                this.#messageChunkCount++;
            } else {
                // console.warn('[CHAT-APP-STATE] Could not find interim message with ID:', this.#interimMessageId);
            }
        } else {
            // console.warn('[CHAT-APP-STATE] No interim message ID set');
        }
    }
    #processMessageIntoSegments(message: ChatMessageForRendering, isStreaming: boolean): ChatMessageForRendering {
        this.#messageProcessor.parseMessage(message.message, message.segments, isStreaming);
        return message;
    }

    getMessageByMessageId(messageId: string): ChatMessageForRendering | undefined {
        const foundMessage = this.#curSessionMessages?.find((msg) => msg.messageId === messageId);

        // Only log for interim messages to avoid spam
        // if (messageId.startsWith('interim-')) {
        //     console.log('[CHAT-APP-STATE] getMessageByMessageId called:', {
        //         requestedMessageId: messageId,
        //         foundMessage: foundMessage
        //             ? {
        //                   messageId: foundMessage.messageId,
        //                   messageObjectId: Object.prototype.toString.call(foundMessage),
        //                   segmentsArrayId: Object.prototype.toString.call(foundMessage.segments),
        //                   segmentsCount: foundMessage.segments.length,
        //                   messageLength: foundMessage.message.length
        //               }
        //             : undefined,
        //         totalMessages: this.#curSessionMessages?.length || 0,
        //         messagesArrayId: Object.prototype.toString.call(this.#curSessionMessages)
        //     });
        // }

        return foundMessage;
    }

    async uploadFiles(files: File[]) {
        // First validate them.  If there are more than a total of 5 files attached to the current message, return an error
        if (files.length + this.inputFiles.length > MAX_FILES) {
            throw new ChatFileValidationError('You may only attach up to 5 files to a message');
        }

        // Throw an error if any of the files are larger than the max file size
        if (files.some((file) => file.size > MAX_FILE_SIZE)) {
            throw new ChatFileValidationError('Each file must be less than 25MB');
        }

        // Throw an error if any of the files are not one of the supported file types
        if (files.some((file) => !Object.keys(SUPPORTED_FILE_TYPES).includes(file.type))) {
            throw new ChatFileValidationError('Each file must be one of the following types: ' + Object.values(SUPPORTED_FILE_TYPES).join(', '));
        }

        // Create upload instances for the new files
        const newInstances: UploadInstance[] = [];
        for (const file of files) {
            const fileName = sanitizeFileName(file.name);
            const s3Key = generateChatFileUploadS3KeyName(this.#user.userId, fileName, uuidv7());
            const instance = new UploadInstance({ s3Key, file, fileName }, this.#showToast);
            newInstances.push(instance);
            this.#inputFiles.push(instance);
        }

        // Upload files in batches of 5 at a time
        const BATCH_SIZE = 5;
        for (let i = 0; i < newInstances.length; i += BATCH_SIZE) {
            const batch = newInstances.slice(i, i + BATCH_SIZE);
            await Promise.all(
                batch.map(async (instance) => {
                    await this.#uploadState.upload(instance);

                    // After each upload completes, persist the updated state, removing the file from the instance objects
                    // as we no longer need it
                    instance.file = undefined;
                    this.#persistInputState();
                })
            );
        }
    }

    // This is here to help test, leave it here for now
    loadMockDataIntoMessages() {
        // Set the start time for tracking how long we've been going
        this.#loadMockDataStartTime = Date.now();
        this.#streamingResponseNow = true;
        this.#messageChunkCount = 0;

        // Create a user message asking about weather
        const userMessage: ChatMessage = {
            userId: this.#user.userId,
            sessionId: this.#currentSession.sessionId,
            messageId: `user-mock-${uuidv7()}`,
            message: 'What is the weather like in New York?',
            source: 'user',
            timestamp: new Date().toISOString()
        };

        // Add the user message to current session messages
        this.#curSessionMessages.push(this.#processMessageIntoSegments({ ...userMessage, segments: [] }, false));

        // Wait 1 second, then create assistant response and start streaming
        setTimeout(() => {
            // Create assistant message with empty content initially
            const assistantMessageId = `assistant-mock-${uuidv7()}`;
            const assistantMessage: ChatMessage = {
                userId: this.#user.userId,
                sessionId: this.#currentSession.sessionId,
                messageId: assistantMessageId,
                message: '',
                source: 'assistant',
                timestamp: new Date().toISOString()
            };

            // Add the assistant message to current session messages
            this.#curSessionMessages.push(this.#processMessageIntoSegments({ ...assistantMessage, segments: [] }, true));

            // Define the mock weather response content to stream
            const mockResponse =
                '# Weather Report for New York City\n\n## Current Conditions\n\n**Temperature:** 72°F (22°C)\n\n**Sky:** Partly cloudy with scattered clouds\n\n**Wind:** Gentle breeze from the southwest at 8 mph\n- Occasional gusts up to 12 mph\n- Overall calm conditions\n\n**Humidity:** 65%\n\n**Visibility:** Excellent at 10 miles\n\n**UV Index:** 6 (Moderate)\n\n## Additional Details\n\n- **Barometric Pressure:** 30.15 inches (steady)\n- **Dew Point:** 58°F (comfortable)\n- **Air Quality Index:** 45 (Good for outdoor activities)\n\n## Sun & Moon Information\n\n🌅 **Sunrise:** 6:42 AM\n\n🌇 **Sunset:** 7:28 PM\n\n⏰ **Daylight:** 12 hours and 46 minutes\n\n🌙 **Moon Phase:** Waxing gibbous at 78% illumination\n\n## Forecast\n\n### Tomorrow\n- Similar pleasant conditions\n- High of 75°F\n- Continued partly cloudy skies\n\n### Weekend Outlook\n- **Saturday:** Pleasant conditions continue\n- **Sunday:** Slight chance of afternoon showers (low confidence)\n\n## Recommendations\n\n✅ **Great day to be outdoors!**\n\n✅ **Perfect for exercise and outdoor activities**\n\n✅ **No precipitation expected today**\n\n---\n\n*This weather pattern is typical for this time of year in the New York metropolitan area.*## Current Conditions\n\n**Temperature:** 72°F (22°C)\n\n**Sky:** Partly cloudy with scattered clouds\n\n**Wind:** Gentle breeze from the southwest at 8 mph\n- Occasional gusts up to 12 mph\n- Overall calm conditions\n\n**Humidity:** 65%\n\n**Visibility:** Excellent at 10 miles\n\n**UV Index:** 6 (Moderate)\n\n## Additional Details\n\n- **Barometric Pressure:** 30.15 inches (steady)\n- **Dew Point:** 58°F (comfortable)\n- **Air Quality Index:** 45 (Good for outdoor activities)\n\n## Sun & Moon Information\n\n🌅 **Sunrise:** 6:42 AM\n\n🌇 **Sunset:** 7:28 PM\n\n⏰ **Daylight:** 12 hours and 46 minutes\n\n🌙 **Moon Phase:** Waxing gibbous at 78% illumination\n\n## Forecast\n\n### Tomorrow\n- Similar pleasant conditions\n- High of 75°F\n- Continued partly cloudy skies\n\n### Weekend Outlook\n- **Saturday:** Pleasant conditions continue\n- **Sunday:** Slight chance of afternoon showers (low confidence)\n\n## Recommendations\n\n✅ **Great day to be outdoors!**\n\n✅ **Perfect for exercise and outdoor activities**\n\n✅ **No precipitation expected today**\n\n---\n\n*This weather pattern is typical for this time of year in the New York metropolitan area.*## Current Conditions\n\n**Temperature:** 72°F (22°C)\n\n**Sky:** Partly cloudy with scattered clouds\n\n**Wind:** Gentle breeze from the southwest at 8 mph\n- Occasional gusts up to 12 mph\n- Overall calm conditions\n\n**Humidity:** 65%\n\n**Visibility:** Excellent at 10 miles\n\n**UV Index:** 6 (Moderate)\n\n## Additional Details\n\n- **Barometric Pressure:** 30.15 inches (steady)\n- **Dew Point:** 58°F (comfortable)\n- **Air Quality Index:** 45 (Good for outdoor activities)\n\n## Sun & Moon Information\n\n🌅 **Sunrise:** 6:42 AM\n\n🌇 **Sunset:** 7:28 PM\n\n⏰ **Daylight:** 12 hours and 46 minutes\n\n🌙 **Moon Phase:** Waxing gibbous at 78% illumination\n\n## Forecast\n\n### Tomorrow\n- Similar pleasant conditions\n- High of 75°F\n- Continued partly cloudy skies\n\n### Weekend Outlook\n- **Saturday:** Pleasant conditions continue\n- **Sunday:** Slight chance of afternoon showers (low confidence)\n\n## Recommendations\n\n✅ **Great day to be outdoors!**\n\n✅ **Perfect for exercise and outdoor activities**\n\n✅ **No precipitation expected today**\n\n---\n\n*This weather pattern is typical for this time of year in the New York metropolitan area.*';

            let currentIndex = 0;
            const chunkSize = 3; // Characters to add each time

            // Stream content every 100ms for 10 seconds (100 intervals total)
            const streamInterval = setInterval(() => {
                const elapsed = Date.now() - this.#loadMockDataStartTime!;
                this.#messageChunkCount++;

                // Stop streaming after 10 seconds
                if (elapsed >= 10000) {
                    clearInterval(streamInterval);
                    this.#streamingResponseNow = false;
                    return;
                }

                // Add more content if we haven't reached the end
                if (currentIndex < mockResponse.length) {
                    const chunk = mockResponse.slice(currentIndex, currentIndex + chunkSize);
                    this.#curSessionMessages[this.#curSessionMessages.length - 1]!.message += chunk;
                    currentIndex += chunkSize;
                }
            }, 10); // Update every 100ms
        }, 1000); // Wait 1 second before starting assistant response
    }

    // === SHARING-RELATED METHODS ===

    async initializeData() {
        await Promise.all([this.refreshChatSessions(), this.refreshRecentSharedSessions(), this.refreshPinnedSessions()]);
    }

    async refreshRecentSharedSessions() {
        try {
            const resp = await this.fetchz(`/api/session/share/recent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatAppId: this.#chatApp.chatAppId })
            });

            const result = await checkClientResponseAndBody<GetRecentSharedResponse>(
                resp,
                'refreshing recent shared sessions',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.SHARED_SESSION
            );

            this.#recentSharedSessionVisits = result.recentShared;
            this.#recentSharedSessions = [];
        } catch (error) {
            handleClientError(error, 'refreshing recent shared sessions', this.#showToast, 'refreshing recent shared sessions failed:');
        }
    }

    /**
     * We need to get all pinned sessions, not just the first 20.  So we need to keep calling the API until we get all pinned sessions.
     */
    async refreshPinnedSessions() {
        this.#loadingPinnedSessions = true;
        let pinnedSessions: PinnedObjAndChatSession[] = [];
        let nextToken: string | undefined = undefined;
        try {
            do {
                try {
                    let resp: Response = await this.fetchz('/api/session/pinned/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chatAppId: this.#chatApp.chatAppId,
                            limit: 20,
                            nextToken
                        } as GetPinnedSessionsRequest)
                    });

                    let result = await checkClientResponseAndBody<GetPinnedSessionsResponse>(resp, 'refreshing pinned sessions', this.#showToast, CLIENT_RESOURCE_NAMES.SESSION);

                    // They are already sorted by pinnedAt in descending order
                    pinnedSessions.push(...result.results);
                    // Store nextToken for pagination
                    nextToken = result.nextToken;
                } catch (error) {
                    handleClientError(error, 'refreshing pinned sessions', this.#showToast, 'refreshing pinned sessions failed:');
                }
            } while (nextToken);

            pinnedSessions.sort((a, b) => new Date(b.pinnedSession.pinnedAt).getTime() - new Date(a.pinnedSession.pinnedAt).getTime());
            this.#pinnedSessions = pinnedSessions;
        } finally {
            this.#loadingPinnedSessions = false;
        }
    }

    async createSharedSession(sessionId: string): Promise<void> {
        try {
            const session = this.#chatSessions.find((s) => s.sessionId === sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            if (session.shareId) {
                throw new Error('Session is already shared');
            }

            const request: CreateSharedSessionRequest = {
                sessionId,
                sessionUserId: this.#user.userId,
                chatAppId: this.#chatApp.chatAppId
            };

            this.#sharingSession = true;
            const resp = await this.fetchz('/api/session/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request)
            });

            const result = await checkClientResponseAndBody<CreateSharedSessionResponse>(
                resp,
                'creating shared session',
                this.#showToast,
                CLIENT_RESOURCE_NAMES.SHARED_SESSION,
                'Failed to create share link. Please try again.'
            );

            if (session) {
                const now = new Date().toISOString();
                session.shareId = result.shareId;
                session.shareCreatedByUserId = this.#user.userId;
                session.shareDate = now;

                // If this is the current session, update it too to maintain reactivity
                if (this.#currentSession.sessionId === sessionId) {
                    this.#currentSession.shareId = result.shareId;
                    this.#currentSession.shareCreatedByUserId = this.#user.userId;
                    this.#currentSession.shareDate = now;
                }

                // Update any stale references in recentSharedSessions array
                const recentSharedSession = this.#recentSharedSessions.find((s) => s.sessionId === sessionId);
                if (recentSharedSession) {
                    recentSharedSession.shareId = result.shareId;
                    recentSharedSession.shareCreatedByUserId = this.#user.userId;
                    recentSharedSession.shareDate = now;
                }

                // Update any stale references in pinnedSessions array
                const pinnedSession = this.#pinnedSessions.find((p) => p.chatSession.sessionId === sessionId);
                if (pinnedSession) {
                    pinnedSession.chatSession.shareId = result.shareId;
                    pinnedSession.chatSession.shareCreatedByUserId = this.#user.userId;
                    pinnedSession.chatSession.shareDate = now;
                }
            }
            // return `/chat/${result.chatAppId}/share/${result.shareId}`;
        } catch (error) {
            handleClientError(error, 'creating shared session', this.#showToast, 'creating shared session failed:');
            throw error;
        } finally {
            this.#sharingSession = false;
        }
    }

    async revokeSharedSession(shareId: string) {
        try {
            const resp = await this.fetchz('/api/session/share', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shareId } as RevokeSharedSessionRequest)
            });

            await checkClientResponseAndBody<RevokeSharedSessionResponse>(resp, 'revoking shared session', this.#showToast, CLIENT_RESOURCE_NAMES.SHARED_SESSION);

            const session = this.#chatSessions.find((s) => s.shareId === shareId);
            if (session) {
                const now = new Date().toISOString();
                session.shareRevokedDate = now;

                // Update any stale references in other arrays
                if (this.#currentSession.shareId === shareId) {
                    this.#currentSession.shareRevokedDate = now;
                }

                const recentSharedSession = this.#recentSharedSessions.find((s) => s.shareId === shareId);
                if (recentSharedSession) {
                    recentSharedSession.shareRevokedDate = now;
                }

                const pinnedSession = this.#pinnedSessions.find((p) => p.chatSession.shareId === shareId);
                if (pinnedSession) {
                    pinnedSession.chatSession.shareRevokedDate = now;
                }
            }
        } catch (error) {
            handleClientError(error, 'revoking shared session', this.#showToast, 'revoking shared session failed:');
        }
    }

    async unrevokeSharedSession(shareId: string) {
        try {
            const resp = await this.fetchz('/api/session/share/unrevoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shareId } as UnrevokeSharedSessionRequest)
            });

            await checkClientResponseAndBody<UnrevokeSharedSessionResponse>(resp, 'unrevoking shared session', this.#showToast, CLIENT_RESOURCE_NAMES.SHARED_SESSION);

            const session = this.#chatSessions.find((s) => s.shareId === shareId);
            if (session) {
                delete session.shareRevokedDate;

                // Update any stale references in other arrays
                if (this.#currentSession.shareId === shareId) {
                    delete this.#currentSession.shareRevokedDate;
                }

                const recentSharedSession = this.#recentSharedSessions.find((s) => s.shareId === shareId);
                if (recentSharedSession) {
                    delete recentSharedSession.shareRevokedDate;
                }

                const pinnedSession = this.#pinnedSessions.find((p) => p.chatSession.shareId === shareId);
                if (pinnedSession) {
                    delete pinnedSession.chatSession.shareRevokedDate;
                }
            }
        } catch (error) {
            handleClientError(error, 'unrevoking shared session', this.#showToast, 'unrevoking shared session failed:');
        }
    }

    /**
     *
     * @param sessionId Either this or shareId must be provided but not both.  If present, I want to pin one of my own sessions.
     * @param shareId Either this or sessionId must be provided but not both.  If present, I want to pin a shared session.
     */
    async pinSession(sessionId: string) {
        let shareId: string | undefined;
        let sessionIdToUse: string | undefined;
        let recentSharedSession: ChatSession<RecordOrUndef> | undefined;
        let sessionToPin = this.#chatSessions.find((s) => s.sessionId === sessionId);
        if (!sessionToPin) {
            recentSharedSession = this.#recentSharedSessions.find((s) => s.sessionId === sessionId);
        }
        if (recentSharedSession) {
            shareId = recentSharedSession.shareId;
        } else if (sessionToPin) {
            if (sessionToPin.shareId && sessionToPin.userId !== this.#user.userId) {
                shareId = sessionToPin.shareId;
            } else {
                sessionIdToUse = sessionToPin.sessionId;
            }
        } else {
            throw new Error('Session not found');
        }

        try {
            this.#pinningSession = true;
            const request: PinSessionRequest = {
                pinnedSession: {
                    userId: this.#user.userId,
                    ...(sessionIdToUse ? { sessionId: sessionIdToUse } : { shareId }),
                    chatAppId: this.#chatApp.chatAppId,
                    pinnedAt: new Date().toISOString()
                }
            };

            const resp = await this.fetchz('/api/session/pinned', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request)
            });

            checkClientResponse(resp, 'pinning session', this.#showToast, CLIENT_RESOURCE_NAMES.SESSION);

            await this.refreshPinnedSessions();
        } catch (error) {
            handleClientError(error, 'pinning session', this.#showToast, 'pinning session failed:');
        } finally {
            this.#pinningSession = false;
        }
    }

    async unpinSession(sessionId: string) {
        const pinnedObj = this.#pinnedSessions.find((s) => s.chatSession.sessionId === sessionId);
        if (!pinnedObj) {
            throw new Error('Session not found');
        }
        const pinnedSession = pinnedObj.pinnedSession;

        try {
            this.#unpinningSession = true;
            const resp = await this.fetchz('/api/session/pinned', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: pinnedSession.shareId ? undefined : pinnedSession.sessionId,
                    shareId: pinnedSession.shareId,
                    chatAppId: this.#chatApp.chatAppId
                } as UnpinSessionRequest)
            });

            checkClientResponse(resp, 'unpinning session', this.#showToast, CLIENT_RESOURCE_NAMES.SESSION);

            await this.refreshPinnedSessions();
        } catch (error) {
            handleClientError(error, 'unpinning session', this.#showToast, 'unpinning session failed:');
        } finally {
            this.#unpinningSession = false;
        }
    }

    async loadSharedSession(shareId: string, showToast: boolean = false): Promise<void> {
        try {
            // Set current session to shared mode
            this.#currentShareId = shareId;

            const resp = await this.fetchz('/api/session/share/access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shareId,
                    chatAppId: this.#chatApp.chatAppId
                } as ValidateShareAccessRequest)
            });

            checkClientResponse(resp, 'loading shared session', this.#showToast, CLIENT_RESOURCE_NAMES.SHARED_SESSION);

            const result = (await resp.json()) as ValidateShareAccessResponse;

            if (!result.success) {
                this.#showToast(result.error || 'Failed to load shared session', { type: 'error' });
                return;
            } else if (!result.hasAccess || !result.sessionData) {
                this.#showToast('Access denied to shared session', { type: 'error' });
                return;
            }

            const session: ChatSession<RecordOrUndef> = result.sessionData;

            if (!session) {
                return;
            }

            // If this session is actually owned by me, then I don't want to show it in the shared sessions list
            // Instead, I need to make sure it's in my current session list

            if (session.userId !== this.#user.userId) {
                // Set this as current session
                this.#setSession(session);
                // Record the visit
                await this.recordShareVisit(shareId);

                if (!this.#recentSharedSessions.find((s) => s.sessionId === session.sessionId)) {
                    this.#recentSharedSessions.push(session);
                }

                if (showToast) {
                    this.#showToast('Shared session loaded', { type: 'success' });
                }
            } else {
                if (this.#refreshingChatSessions) {
                    this.#ensureThisSessionIsInList = session;
                } else {
                    if (!this.#chatSessions.find((s) => s.sessionId === session.sessionId)) {
                        this.#chatSessions.push(session);
                    }
                    this.setCurrentSessionById(session.sessionId);
                    if (showToast) {
                        this.#showToast('Session loaded', { type: 'success' });
                    }
                }
            }
        } catch (error) {
            handleClientError(error, 'loading shared session', this.#showToast, 'loading shared session failed:');
            throw error;
        }
    }

    async recordShareVisit(shareId: string) {
        try {
            const resp = await this.fetchz('/api/session/share/visit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shareId })
            });

            checkClientResponse(resp, 'recording share visit', this.#showToast, CLIENT_RESOURCE_NAMES.SHARED_SESSION);

            // Refresh recent shared to reflect the new visit
            await this.refreshRecentSharedSessions();
        } catch (error) {
            handleClientError(error, 'recording share visit', this.#showToast, 'recording share visit failed:');
        }
    }

    getSessionShareStatus(sessionId: string): boolean {
        return !!this.#chatSessions.find((s) => s.sessionId === sessionId)?.shareId;
    }

    isSessionSharedButRevoked(sessionId: string): boolean {
        const session = this.#chatSessions.find((s) => s.sessionId === sessionId);
        return !!(session?.shareId && session?.shareRevokedDate);
    }

    /**
     *
     * @param browserOriginAndPathName  Use window.location.origin + window.location.pathname
     * @param shareId  The share id to get the URL for
     * @returns
     */
    getShareUrl(browserOriginAndPathName: string, shareId: string): string {
        // Parse the URL so we can safely examine its path
        const url = new URL(browserOriginAndPathName);

        // Split the pathname into parts, ignoring empty ones (leading slash)
        const parts = url.pathname.split('/').filter(Boolean);

        // Validate: must be exactly [ "chat", "<something>" ]
        if (parts.length !== 2 || parts[0] !== 'chat') {
            throw new Error(`Invalid path: expected "/chat/{id}" but got "${url.pathname}"`);
        }

        return `${url.origin}${url.pathname}/share/${shareId}`;
    }

    getShareUrlMock(browserOriginAndPathName: string): string {
        return `${browserOriginAndPathName}/share/xyz`;
    }

    // === WIDGET RENDERING METHODS ===

    /**
     * Initialize spotlight widgets for the current chat app.
     * Called on page load after tag definitions are loaded.
     */
    async initializeSpotlight() {
        // 1. Filter tag definitions for spotlight-enabled widgets
        const spotlightTags = this.#tagDefs.filter((tag) => tag.renderingContexts?.spotlight?.enabled === true);

        // 2. Load user preferences for spotlight
        this.#spotlightUserPrefs = await this.loadSpotlightPreferences();

        // 3. Resolve which widgets to show and in what order
        this.#spotlightWidgets = this.resolveSpotlightWidgets(spotlightTags, this.#spotlightUserPrefs);
    }

    /**
     * Initialize static context widgets.
     * These are widgets that run initialization code but don't render visually.
     * Called once during chat app state construction.
     */
    #initializeStaticWidgets() {
        // Filter tag definitions for static-enabled widgets and cast to StaticWidgetTagDefinition
        this.#staticWidgets = this.#tagDefs.filter((tag) => tag.widget.type === 'web-component' && tag.renderingContexts?.static?.enabled === true) as StaticWidgetTagDefinition[];
    }

    /**
     * Resolve which spotlight widgets to show based on preferences.
     * Filters out unpinned widgets and sorts by display order.
     */
    private resolveSpotlightWidgets(spotlightTags: TagDefinition<TagDefinitionWidget>[], prefs: UserSpotlightPreferences | undefined): SpotlightWidget[] {
        const widgets: SpotlightWidget[] = [];
        const unpinnedSet = new Set(prefs?.unpinned || []);

        // Filter out unpinned widgets
        const pinnedTags = spotlightTags.filter((tag) => {
            const tagId = `${tag.scope}.${tag.tag}`;
            return !unpinnedSet.has(tagId);
        });

        // Sort by displayOrder
        pinnedTags
            .sort((a, b) => {
                const orderA = a.renderingContexts?.spotlight?.displayOrder ?? 999;
                const orderB = b.renderingContexts?.spotlight?.displayOrder ?? 999;
                return orderA - orderB;
            })
            .forEach((tag, index) => {
                widgets.push({
                    tagDefinition: tag as TagDefinition<TagDefinitionWidgetWebComponent>,
                    renderOrder: index,
                    isVisible: true,
                    contextConfig: tag.renderingContexts!.spotlight!
                });
            });

        return widgets;
    }

    /**
     * Add a widget to spotlight (or reopen if unpinned).
     * Removes the widget from the unpinned list.
     */
    async addToSpotlight(tagId: string) {
        // Initialize preferences if needed
        if (!this.#spotlightUserPrefs) {
            this.#spotlightUserPrefs = {
                unpinned: []
            };
        }

        // Remove from unpinned list (making it visible/pinned)
        const index = this.#spotlightUserPrefs.unpinned.indexOf(tagId);
        if (index > -1) {
            this.#spotlightUserPrefs.unpinned.splice(index, 1);
        }

        // Persist preferences
        await this.saveSpotlightPreferences(this.#spotlightUserPrefs);

        // Refresh spotlight widgets
        await this.initializeSpotlight();
    }

    /**
     * Remove a widget from spotlight (unpin/hide it).
     * Adds the widget to the unpinned list.
     */
    async removeFromSpotlight(tagId: string) {
        if (!this.#spotlightUserPrefs) {
            this.#spotlightUserPrefs = {
                unpinned: []
            };
        }

        // Add to unpinned list if not already there
        if (!this.#spotlightUserPrefs.unpinned.includes(tagId)) {
            this.#spotlightUserPrefs.unpinned.push(tagId);
        }

        await this.saveSpotlightPreferences(this.#spotlightUserPrefs);
        await this.initializeSpotlight();
    }

    get customDataForChatApp(): Record<string, unknown> | undefined {
        return this.#customDataForChatApp;
    }

    /**
     * Get all unpinned spotlight widgets.
     * Used to populate the settings dropdown menu.
     */
    getUnpinnedSpotlightWidgets(): TagDefinition<TagDefinitionWidget>[] {
        if (!this.#spotlightUserPrefs) return [];

        return this.#tagDefs.filter((tag) => {
            const tagId = `${tag.scope}.${tag.tag}`;
            return tag.renderingContexts?.spotlight?.enabled === true && this.#spotlightUserPrefs!.unpinned.includes(tagId);
        });
    }

    /**
     * Load spotlight preferences from user preferences API.
     */
    private async loadSpotlightPreferences(): Promise<UserSpotlightPreferences | undefined> {
        try {
            // Key format: ${chatAppId}/spotlight
            const key = `${this.#chatApp.chatAppId}/spotlight`;
            const prefs = await this.#userPrefs.getPref<UserSpotlightPreferences>(key);
            return prefs || undefined;
        } catch (e) {
            console.error('Error loading spotlight preferences:', e);
            return undefined;
        }
    }

    /**
     * Save spotlight preferences to user preferences API.
     */
    private async saveSpotlightPreferences(prefs: UserSpotlightPreferences): Promise<void> {
        // Key format: ${chatAppId}/spotlight
        const key = `${this.#chatApp.chatAppId}/spotlight`;
        await this.#userPrefs.modifyPref(key, prefs);
    }

    /**
     * Request to render a tag in a specific context.
     * This is the primary API that web components use to render other components.
     *
     * @param tagId Format: "scope.tag"
     * @param renderingContext Which rendering context to use
     * @param data Optional data/props to pass to the component
     */
    async renderTag(tagId: string, renderingContext: WidgetRenderingContextType, data?: Record<string, any>): Promise<void> {
        // 1. Validate tag exists and is enabled for this context
        const [scope, tag] = tagId.split('.');
        const tagDef = this.#tagDefs.find((t) => t.scope === scope && t.tag === tag);

        if (!tagDef) {
            throw new Error(`Tag ${tagId} not found`);
        }

        if (tagDef.status !== 'enabled') {
            throw new Error(`Tag ${tagId} is not enabled (status: ${tagDef.status})`);
        }

        if (!tagDef.renderingContexts?.[renderingContext]?.enabled) {
            throw new Error(`Tag ${tagId} does not support ${renderingContext} context`);
        }

        // 2. Render based on context
        switch (renderingContext) {
            case 'spotlight':
                // Add to spotlight if not already visible
                await this.addToSpotlight(tagId);
                break;

            case 'canvas':
                this.#canvasWidget = {
                    tagDefinition: tagDef as TagDefinition<TagDefinitionWidgetWebComponent>,
                    contextConfig: tagDef.renderingContexts.canvas!,
                    data
                };
                this.#canvasOpen = true;
                break;

            case 'dialog':
                this.#dialogWidget = {
                    tagDefinition: tagDef as TagDefinition<TagDefinitionWidgetWebComponent>,
                    contextConfig: tagDef.renderingContexts.dialog!,
                    data
                };
                this.#widgetDialogOpen = true;
                break;

            case 'inline':
                // We don't render inline tags like with this method.
                throw new Error('Inline rendering from web components not supported via the renderTag method');
        }
    }

    /**
     * Close the canvas view.
     */
    closeCanvas() {
        // Unregister widget instance if it exists
        if (this.#canvasWidget?.instanceId) {
            this.unregisterWidgetInstance(this.#canvasWidget.instanceId);
        }

        this.#canvasOpen = false;
        this.#canvasWidget = undefined;
    }

    /**
     * Close the dialog.
     */
    closeDialog() {
        // Unregister widget instance if it exists
        if (this.#dialogWidget?.instanceId) {
            this.unregisterWidgetInstance(this.#dialogWidget.instanceId);
        }

        this.#widgetDialogOpen = false;
        this.#dialogWidget = undefined;
    }
}

/**
 * Structure for persisting input state in localStorage
 */
interface PersistedInputState {
    text: string;
    uploads: UploadInstance[];
}

/**
 * Spotlight widget state
 */
export interface SpotlightWidget {
    tagDefinition: TagDefinition<TagDefinitionWidgetWebComponent>;
    renderOrder: number;
    isVisible: boolean;
    contextConfig: any;
    /** Instance ID of the injected widget (set after injection) */
    instanceId?: string;
    /** DOM element reference of the injected widget (set after injection) */
    element?: HTMLElement;
}

/**
 * User preferences for spotlight widgets
 */
export interface UserSpotlightPreferences {
    unpinned: string[];
}

/**
 * Canvas widget state
 */
export interface CanvasWidgetState {
    tagDefinition: TagDefinition<TagDefinitionWidgetWebComponent>;
    contextConfig: any;
    data?: Record<string, any>;
    /** Instance ID of the injected widget */
    instanceId?: string;
    /** DOM element reference of the injected widget */
    element?: HTMLElement;
}

/**
 * Dialog widget state
 */
export interface DialogWidgetState {
    tagDefinition: TagDefinition<TagDefinitionWidgetWebComponent>;
    contextConfig: any;
    data?: Record<string, any>;
    /** Instance ID of the injected widget */
    instanceId?: string;
    /** DOM element reference of the injected widget */
    element?: HTMLElement;
}
