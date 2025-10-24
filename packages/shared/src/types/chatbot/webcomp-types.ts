/**
 * Note!!! The interfaces in this file are meant to expose public functionality to the web component authors.
 * They are not meant to be exhaustive or complete.
 */

import { type UploadStatus } from '../upload-types';
import type {
    ChatApp,
    ChatAppMode,
    ChatAppOverridableFeatures,
    ChatMessageForRendering,
    ChatSession,
    ChatUser,
    CustomDataUiRepresentation,
    InvokeAgentAsComponentOptions,
    RecordOrUndef,
    ShareSessionState,
    ShowToastFn,
    TagDefinition,
    TagDefinitionWidget,
    UserAwsCredentials,
    UserWidgetData,
    UserDataOverrideSettings,
    UserPrefs,
    WidgetAction,
    WidgetMetadata,
    WidgetRenderingContextType,
    IUserWidgetDataStoreState,
    ChatAppActionMenu,
    ChatAppAction
} from './chatbot-types';

// Note: These are intentionally `any` to avoid coupling the shared package to Svelte
// The actual implementation will use the correct types from the appropriate packages
export type SidebarState = any;
export type Snippet = any;

/** Declare global event map for pika context request */
declare global {
    interface HTMLElementEventMap {
        'pika-wc-context-request': PikaWCContextRequestEvent;
    }
}

export interface IIdentityState {
    readonly fullName: string;
    readonly initials: string;
    readonly user: ChatUser<RecordOrUndef>;
    readonly isSiteAdmin: boolean;
    readonly isInternalUser: boolean;
    readonly isContentAdmin: boolean;
    getUserAwsCredentials(): Promise<UserAwsCredentials | undefined>;
}

export interface IAppState {
    readonly showToast: ShowToastFn;
    readonly identity: IIdentityState;
    readonly isMobile: boolean;
}

/**
 * Widget Metadata API - scoped to a specific widget instance.
 * Returned by getWidgetMetadataAPI() and bound to the widget's instanceId.
 *
 * This API allows widgets to register and update their display metadata (title and actions)
 * which the parent app uses to render context-appropriate chrome.
 *
 * @example
 * ```js
 * const ctx = await getPikaContext($host());
 * const metadata = ctx.chatAppState.getWidgetMetadataAPI('weather', 'favorite-cities', ctx.instanceId, ctx.renderingContext);
 *
 * metadata.setMetadata({
 *   title: 'Favorite Cities',
 *   actions: [
 *     { id: 'refresh', title: 'Refresh', iconSvg: '<svg>...</svg>', callback: () => refresh() }
 *   ]
 * });
 * ```
 */
export interface IWidgetMetadataAPI {
    /**
     * Register or update complete metadata (title and actions).
     * Replaces any previously registered metadata for this widget instance.
     *
     * @param metadata - The metadata to register
     *
     * @example
     * ```js
     * metadata.setMetadata({
     *   title: 'Weather Comparison',
     *   actions: [
     *     { id: 'refresh', title: 'Refresh', iconSvg: '<svg>...</svg>', callback: () => refresh() },
     *     { id: 'settings', title: 'Settings', iconSvg: '<svg>...</svg>', callback: () => showSettings() }
     *   ]
     * });
     * ```
     */
    setMetadata(metadata: WidgetMetadata): void;

    /**
     * Update just the widget title without affecting actions.
     *
     * @param title - The new title
     *
     * @example
     * ```js
     * metadata.updateTitle(`Temperature Trend - ${newCity}`);
     * ```
     */
    updateTitle(title: string): void;

    /**
     * Update a specific action's properties (e.g., disable/enable).
     * Only updates the properties provided in `updates`.
     *
     * @param actionId - The ID of the action to update
     * @param updates - Partial properties to update (cannot change id or callback)
     *
     * @example
     * ```js
     * // Disable the refresh button during loading
     * metadata.updateAction('refresh', { disabled: true });
     *
     * // Re-enable it after loading
     * metadata.updateAction('refresh', { disabled: false });
     * ```
     */
    updateAction(actionId: string, updates: Partial<Omit<WidgetAction, 'id' | 'callback'>>): void;

    /**
     * Add a new action button dynamically.
     *
     * @param action - The action to add
     *
     * @example
     * ```js
     * if (userHasPremium) {
     *   metadata.addAction({
     *     id: 'export',
     *     title: 'Export data',
     *     iconSvg: '<svg>...</svg>',
     *     callback: () => exportData()
     *   });
     * }
     * ```
     */
    addAction(action: WidgetAction): void;

    /**
     * Remove an action button.
     *
     * @param actionId - The ID of the action to remove
     *
     * @example
     * ```js
     * metadata.removeAction('export');
     * ```
     */
    removeAction(actionId: string): void;

    /**
     * Set the loading status for the widget.
     *
     * @param loading - Whether the widget is loading
     * @param loadingMsg - The message to display while loading
     *
     * @example
     * ```js
     * metadata.setLoadingStatus(true, 'Loading...');
     * ```
     */
    setLoadingStatus(loading: boolean, loadingMsg?: string): void;
}

export interface IChatAppState {
    readonly entityFeatureEnabled: boolean;
    readonly shareCurrentSessionState: ShareSessionState;
    readonly showToast: ShowToastFn;
    readonly userPrefs: IUserPrefsState;
    readonly mode: ChatAppMode;
    /**
     * Get component-specific storage scoped to this component (scope.tag) and current user.
     * Max 400KB per component.
     */
    getUserWidgetDataStoreState(scope: string, tag: string): IUserWidgetDataStoreState;
    readonly customDataUiRepresentation: CustomDataUiRepresentation | undefined;
    readonly features: ChatAppOverridableFeatures;
    readonly tagDefs: TagDefinition<TagDefinitionWidget>[];
    readonly userIsContentAdmin: boolean;
    readonly userNeedsToProvideDataOverrides: boolean;
    readonly isViewingContentForAnotherUser: boolean;
    readonly currentSessionIsSharedBySomeoneElse: boolean;
    readonly currentShareId: string | undefined;
    readonly currentSessionIsReadOnly: boolean;
    readonly sortedChatSessions: ChatSession<RecordOrUndef>[];
    readonly userDataOverrideSettings: UserDataOverrideSettings;
    readonly enableFileUpload: boolean;
    readonly chatSessions: ChatSession<RecordOrUndef>[];
    readonly waitingForFirstStreamedResponse: boolean;
    readonly isStreamingResponseNow: boolean;
    readonly isInterimSession: boolean;
    readonly currentSession: ChatSession<RecordOrUndef>;
    readonly currentSessionMessages: ChatMessageForRendering[];
    readonly inputFiles: IUploadInstance[];
    readonly newSession: boolean;
    readonly chatInput: string;
    readonly chatApp: ChatApp;
    readonly retrievingMessages: boolean;
    readonly pageTitle: string | undefined;
    readonly customDataForChatApp: Record<string, unknown> | undefined;
    readonly customTitleBarActions: (ChatAppActionMenu | ChatAppAction)[];

    setCurrentSessionById(sessionId: string): void;
    removeFile(s3Key: string): void;
    startNewChatSession(): void;
    refreshChatSessions(): Promise<void>;
    downloadFile(s3Key: string): Promise<void>;
    refreshMessagesForCurrentSession(): Promise<void>;
    sendMessage(): Promise<void>;
    getMessageByMessageId(messageId: string): ChatMessageForRendering | undefined;
    uploadFiles(files: File[]): Promise<void>;
    initializeData(): Promise<void>;
    renderTag(tagId: string, context: 'spotlight' | 'inline' | 'dialog' | 'canvas', data?: Record<string, any>): Promise<void>;
    closeCanvas(): void;
    closeDialog(): void;
    setOrUpdateCustomTitleBarAction(action: ChatAppActionMenu | ChatAppAction): void;
    removeCustomTitleBarAction(actionId: string): void;

    /**
     * Invoke the agent directly from a web component using the 'chat-app-component' invocation mode.
     * This allows components to make out-of-band requests to the LLM without creating user sessions.
     *
     * The component must have a tag definition with `componentAgentInstructionsMd` that
     * includes instructions for the specified `instructionName`.
     *
     * @param scope - The scope of the tag definition (e.g., 'weather')
     * @param tag - The tag name (e.g., 'favorite-cities')
     * @param instructionName - The key in the tag definition's componentAgentInstructionsMd
     * @param userMessage - The message/query to send to the agent
     * @param options - Optional streaming callbacks and configuration
     * @returns Promise that resolves to the parsed JSON response from the agent
     * @throws Error if the request fails or response cannot be parsed
     *
     * @example
     * Simple usage:
     * ```typescript
     * const weatherData = await chatAppState.invokeAgentAsComponent<{ temperature: number, condition: string }>(
     *   'weather',
     *   'favorite-cities',
     *   'get-weather',
     *   'Get current weather for San Francisco'
     * );
     * ```
     *
     * With streaming callbacks:
     * ```typescript
     * const data = await chatAppState.invokeAgentAsComponent<WeatherData>(
     *   'weather',
     *   'favorite-cities',
     *   'get-weather',
     *   'Get weather for NYC',
     *   {
     *     onThinking: (text) => console.log('Thinking:', text),
     *     onToolCall: (call) => console.log('Calling tool:', call.name)
     *   }
     * );
     * ```
     */
    invokeAgentAsComponent<T = any>(scope: string, tag: string, instructionName: string, userMessage: string, options?: InvokeAgentAsComponentOptions): Promise<T>;

    /**
     * Get a scoped metadata API for registering widget title and actions.
     * Call this once during widget initialization to get an API bound to this widget instance.
     *
     * The metadata you register will be used by the parent app to render context-appropriate chrome:
     * - **Spotlight**: Small title bar overlay with icon + title + action menu
     * - **Canvas**: Full title bar with all action buttons + close
     * - **Dialog**: Title in header, actions as buttons in footer
     * - **Inline**: No chrome rendered (widget manages own UI)
     *
     * **IMPORTANT**: You MUST pass instanceId and renderingContext from the PikaWCContext.
     * These values are automatically set during component injection.
     *
     * @param scope - Widget scope (e.g., 'weather', 'pika')
     * @param tag - Widget tag (e.g., 'favorite-cities')
     * @param instanceId - Unique instance ID from context.instanceId (set during injection)
     * @param renderingContext - Rendering context from context.renderingContext (set during injection)
     * @returns Scoped API for this widget instance
     *
     * @example
     * Correct usage (always pass context values):
     * ```js
     * const ctx = await getPikaContext($host());
     * const metadata = ctx.chatAppState.getWidgetMetadataAPI(
     *   'weather',
     *   'favorite-cities',
     *   ctx.instanceId,  // REQUIRED - set during injection
     *   ctx.renderingContext       // REQUIRED - set during injection
     * );
     *
     * metadata.setMetadata({
     *   title: 'Favorite Cities',
     *   actions: [
     *     {
     *       id: 'refresh',
     *       title: 'Refresh weather data',
     *       lucideIconName: 'refresh-cw',  // MUST be lowercase kebab-case
     *       callback: async () => {
     *         loading = true;
     *         await fetchWeatherData();
     *         loading = false;
     *       }
     *     }
     *   ]
     * });
     * ```
     */
    getWidgetMetadataAPI(scope: string, tag: string, instanceId: string, renderingContext: WidgetRenderingContextType): IWidgetMetadataAPI;

    /**
     * Retrieve text content from an S3 file stored in the Pika S3 bucket.
     * This is a secure helper that allows web components to access files without
     * needing to manage AWS credentials or know the bucket name.
     *
     * @param s3Key - The S3 key (path) to the file in the Pika S3 bucket
     * @returns Promise that resolves to the file content as a string
     * @throws Error if the file doesn't exist or cannot be accessed
     *
     * @example
     * ```js
     * const context = await getPikaContext($host());
     * try {
     *   const content = await context.chatAppState.getS3TextFileContent('data/config.json');
     *   const config = JSON.parse(content);
     *   console.log('Config loaded:', config);
     * } catch (error) {
     *   console.error('Failed to load config:', error);
     * }
     * ```
     */
    getS3TextFileContent(s3Key: string): Promise<string>;
}

// Supporting interfaces
export interface IUserPrefsState {
    readonly initialized: boolean;
    readonly prefs: UserPrefs | undefined;
    refreshPrefsFromServer(): Promise<void>;
    getPref<T>(key: string): Promise<T | undefined>;
    modifyPref(key: string, value: unknown): Promise<void>;
}

export interface IUploadInstance {
    readonly s3Key: string;
    readonly file: File | undefined;
    readonly fileName: string;
    readonly size: number;
    readonly lastModified: number;
    readonly type: string;
    readonly xhr: XMLHttpRequest;
    readonly status: {
        status: UploadStatus['status'];
        progress?: number;
        error?: string;
    };
}

/**
 * Callback invoked when the web component has been created and is ready.
 * Called after the element is created but before it's added to the DOM.
 */
export interface OnReadyCallback {
    (params: {
        /** The web component element that was created */
        element: HTMLElement;
        /** The unique instance ID assigned to this component */
        instanceId: string;
        /** The full Pika context with instanceId */
        context: PikaWCContext;
    }): void;
}

/**
 * Structure for data passed to web components.
 *
 * Special fields that affect element initialization:
 * - `attributes`: Set as HTML attributes (stringified) and also as properties if they exist
 * - `properties`: Set as JavaScript properties only (not attributes)
 * - `onReady`: Callback invoked when the component is created and ready
 *
 * All other fields are available through `context.dataForWidget` but not set on the element.
 */
export interface DataForWidget {
    /**
     * HTML attributes to set on the element.
     * Values are stringified and set via `setAttributeNS()`.
     * If a corresponding property exists on the element, it's also set with the original value.
     */
    attributes?: Record<string, any>;

    /**
     * JavaScript properties to set on the element (not as HTML attributes).
     * Only properties that exist on the element will be set.
     * Use this for complex objects, arrays, functions, etc.
     */
    properties?: Record<string, any>;

    /**
     * Callback invoked when the web component is created and ready.
     * Called after element creation, property/attribute setting, and context setup,
     * but before the element is added to the DOM.
     *
     * Use this to get notified when the component is ready and to access the element directly.
     */
    onReady?: OnReadyCallback;

    /** Any other data available through context (not set on the element) */
    [key: string]: any;
}

/**
 * This is the context object that is passed to the web component when it is rendered.
 */
export interface PikaWCContext {
    appState: IAppState;
    renderingContext: WidgetRenderingContextType; // e.g. 'spotlight', 'inline', 'dialog', 'canvas'
    chatAppState: IChatAppState;
    chatAppId: string;

    /**
     * Unique instance ID for this component instance.
     * Set by injectChatAppWebComponent() and used by getWidgetMetadataAPI().
     */
    instanceId: string;

    /** Data passed to the widget, available through `context.dataForWidget`. */
    dataForWidget: DataForWidget;
}

export type PikaWCContextWithoutInstanceId = Omit<PikaWCContext, 'instanceId'>;

export type PikaWCContextRequestCallbackFn = (contextRequest: PikaWCContext) => void;

// Fix: The detail should be an object containing the callback
export interface PikaWCContextRequestDetail {
    callback: PikaWCContextRequestCallbackFn;
}

export interface PikaWCContextRequestEvent extends CustomEvent<PikaWCContextRequestDetail> {
    detail: PikaWCContextRequestDetail;
}
