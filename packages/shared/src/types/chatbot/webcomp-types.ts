/**
 * Note!!! The interfaces in this file are meant to expose public functionality to the web component authors.
 * They are not meant to be exhaustive or complete.
 */

import { type UploadStatus } from '../upload-types';
import type {
    ChatApp,
    ChatAppAction,
    ChatAppActionMenu,
    ChatAppMode,
    ChatAppOverridableFeatures,
    ChatMessageForRendering,
    ChatSession,
    ChatUser,
    CustomDataUiRepresentation,
    InvokeAgentAsComponentOptions,
    IUserWidgetDataStoreState,
    RecordOrUndef,
    ShareSessionState,
    ShowToastFn,
    TagDefinition,
    TagDefinitionWidget,
    UserAwsCredentials,
    UserDataOverrideSettings,
    UserPrefs,
    WidgetInstance,
    WidgetRenderingContextType,
    WidgetSizing
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
    readonly widgetInstances: Map<string, WidgetInstance>;
    /**
     * Current user information
     * @since 0.11.0
     */
    readonly user: ChatUser<RecordOrUndef>;

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
    /**
     * Render a tag in a specific context
     * @param metadata - Optional metadata for the widget (title, actions, icon)
     * @since 0.11.0 - Added metadata parameter
     */
    renderTag(tagId: string, context: 'spotlight' | 'inline' | 'dialog' | 'canvas' | 'static', data?: Record<string, any>, metadata?: WidgetMetadata): Promise<void>;
    closeCanvas(): void;
    closeDialog(): void;
    setOrUpdateCustomTitleBarAction(action: ChatAppActionMenu | ChatAppAction): void;
    removeCustomTitleBarAction(actionId: string): void;
    getWidgetInstance(instanceId: string): WidgetInstance | undefined;
    /**
     * Get the full context for a widget instance
     * @since 0.11.0
     */
    getWidgetContext(instanceId: string): PikaWCContext | undefined;

    /**
     * Update context for a widget. Call this when your widget's context has changed.
     *
     * This method will re-check your widget's `getContextForLlm()` method and update
     * the context accordingly. Use this when:
     * - Your widget initially had no context, but now has context to share
     * - Your widget's context data has changed (e.g., user selected different items)
     * - You want to change whether context should be auto-added
     *
     * @param instanceId - Your widget's instance ID (from getPikaContext())
     *
     * @example
     * ```typescript
     * // In a Svelte widget component:
     * let selectedCities = $state<string[]>([]);
     *
     * onMount(async () => {
     *     const context = await getPikaContext($host());
     *
     *     // Update context whenever selection changes
     *     $effect(() => {
     *         if (selectedCities.length > 0) {
     *             // This triggers re-evaluation of getContextForLlm()
     *             context.chatAppState.updateWidgetContext(context.instanceId);
     *         }
     *     });
     * });
     *
     * // Your getContextForLlm() method will be called again
     * getContextForLlm() {
     *     if (selectedCities.length === 0) return undefined;
     *
     *     return {
     *         origin: 'auto',
     *         title: 'Selected Cities',
     *         description: `User selected ${selectedCities.length} cities`,
     *         data: { cities: selectedCities },
     *         addAutomatically: true
     *     };
     * }
     * ```
     */
    updateWidgetContext(instanceId: string): void;

    /**
     * Manually register a web component as a spotlight widget. This allows components to
     * dynamically add themselves to the spotlight area at runtime.
     *
     * Note: Registration is ephemeral and does not persist across page refreshes.
     * Components must re-register themselves on each page load.
     *
     * @param definition - Simplified definition for the spotlight widget
     *
     * @example
     * ```typescript
     * chatAppState.manuallyRegisterSpotlightWidget({
     *     tag: 'my-widget',
     *     scope: 'my-app',
     *     tagTitle: 'My Widget',
     *     displayOrder: 0
     * });
     * ```
     */
    manuallyRegisterSpotlightWidget(definition: SpotlightWidgetDefinition): void;

    /**
     * Save a persistent spotlight instance using the Virtual Tags Pattern.
     * Creates a new instance with its own UserWidgetDataStore (400KB limit per instance),
     * saves the data, registers it as a spotlight widget, and renders it immediately.
     *
     * Use this when users save content (like charts, queries, etc.) to spotlight.
     *
     * @param scope - Widget scope (e.g., 'weather')
     * @param baseTag - Base tag name (e.g., 'chart-saved')
     * @param displayName - User-facing name for this instance
     * @param customElementName - The custom element name (same for all instances)
     * @param data - The data to pass to this instance
     * @param dataKey - The key to store data under (default: 'data')
     * @param metadata - Optional widget metadata (title, actions, icon, etc.)
     * @returns The instance ID (UUID)
     * @since 0.11.0 - Added metadata parameter
     *
     * @example
     * ```typescript
     * const instanceId = await chatAppState.saveSpotlightInstance(
     *     'weather',
     *     'chart-saved',
     *     'Q4 Revenue Chart',
     *     'weather-chart-saved',
     *     { chartType: 'bar', data: [...] },
     *     'chartData',
     *     {
     *         title: 'Q4 Revenue Chart',
     *         iconSvg: '<svg>...</svg>',
     *         actions: [...]
     *     }
     * );
     * ```
     */
    saveSpotlightInstance(
        scope: string,
        baseTag: string,
        displayName: string,
        customElementName: string,
        data: Record<string, any>,
        dataKey?: string,
        metadata?: WidgetMetadata
    ): Promise<string>;

    /**
     * Delete a saved spotlight instance.
     * Removes from spotlight, removes from registry, and unregisters from state.
     *
     * Note: Instance data is currently orphaned (not deleted) but could be recovered.
     * Future: Will add deleteAll() method to UserWidgetDataStore.
     *
     * @param scope - Widget scope
     * @param baseTag - Base tag name
     * @param instanceId - Instance UUID
     *
     * @example
     * ```typescript
     * await chatAppState.deleteSpotlightInstance('weather', 'chart-saved', instanceId);
     * ```
     */
    deleteSpotlightInstance(scope: string, baseTag: string, instanceId: string): Promise<void>;

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
    (params: WidgetCallbackContext): void;
}

/**
 * Action button that appears in the widget's chrome (title bar, toolbar, etc.)
 *
 * @example
 * ```js
 * const action: WidgetAction = {
 *   id: 'refresh',
 *   title: 'Refresh data',
 *   iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">...</svg>',
 *   callback: async () => { await fetchData(); }
 * };
 * ```
 *
 * @since 0.11.0 - Moved from chatbot-types to webcomp-types
 */
export interface WidgetAction {
    /** Unique identifier for this action */
    id: string;

    /** Tooltip/label for the action (also button text in dialog context) */
    title: string;

    /** SVG markup string for the icon (e.g., from extractIconSvg() helper) */
    iconSvg: string;

    /** Whether action is currently disabled */
    disabled?: boolean;

    /** If true, renders as default/prominent button (used in dialog context) */
    primary?: boolean;

    /**
     * Handler when clicked
     * @since 0.11.0 - Callback now receives WidgetCallbackContext parameter
     */
    callback: (context: WidgetCallbackContext) => void | Promise<void>;
}

/**
 * The context object that is passed to the onReady callback and in action callbacks functions.
 *
 * @since 0.11.0
 */
export interface WidgetCallbackContext {
    /** The web component element that was created */
    element: HTMLElement;
    /** The unique instance ID assigned to this component */
    instanceId: string;
    /** The full Pika context with instanceId */
    context: PikaWCContext;
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

/**
 * Metadata that widgets register with the parent app
 *
 * @example
 * ```js
 * const metadata: WidgetMetadata = {
 *   title: 'My Widget',
 *   iconSvg: '<svg>...</svg>',
 *   iconColor: '#001F3F',
 *   actions: [
 *     { id: 'refresh', title: 'Refresh', iconSvg: '<svg>...</svg>', callback: () => refresh() }
 *   ]
 * };
 * ```
 *
 * @since 0.11.0 - Moved from chatbot-types to webcomp-types
 */
export interface WidgetMetadata {
    /** Widget title shown in chrome */
    title: string;

    /**
     * Optional Lucide icon name (will be fetched automatically and set as iconSvg).
     *
     * The name will be snake cased as in `arrow-big-down` and not `arrowBigDown`
     */
    lucideIconName?: string;

    /** Optional icon SVG markup for the widget title */
    iconSvg?: string;

    /** Optional color for the widget icon (hex, rgb, or CSS color name) */
    iconColor?: string;

    /** Optional action buttons */
    actions?: WidgetAction[];

    /** Optional loading status */
    loadingStatus?: {
        loading: boolean;
        loadingMsg?: string;
    };
}

/**
 * Internal state tracked for each widget instance
 *
 * @since 0.11.0 - Moved from chatbot-types to webcomp-types
 */
export interface WidgetMetadataState extends WidgetMetadata {
    /** Unique instance ID for this widget */
    instanceId: string;

    /** Widget scope (e.g., 'weather', 'pika') */
    scope: string;

    /** Widget tag (e.g., 'favorite-cities') */
    tag: string;

    /** Rendering context (spotlight, canvas, dialog, inline) */
    renderingContext: WidgetRenderingContextType;
}

/**
 * This is used when manually registering a custom element as a spotlight widget by a component in the client.
 *
 * @since 0.11.0 - Moved from chatbot-types to webcomp-types
 */
export interface SpotlightWidgetDefinition {
    /** @see TagDefinition.tag */
    tag: string;

    /** @see TagDefinition.scope */
    scope: string;

    /** @see TagDefinitionWidgetWebComponent.customElementName */
    customElementName?: string;

    /** @see TagDefinition.tagTitle */
    tagTitle: string;

    /** @see TagDefinitionWidgetWebComponent.sizing */
    sizing?: WidgetSizing;

    /** @see TagDefinition.componentAgentInstructionsMd */
    componentAgentInstructionsMd?: Record<string, string>;

    /**
     * If true and there isn't an instance of this widget already created as a spotlight widget, then a new instance will be created.
     */
    autoCreateInstance?: boolean;

    /** The display order of the widget in the spotlight. If not provided, is put first. */
    displayOrder?: number;

    /** Defaults to true.  If true, then only one instance of this widget can be created. */
    singleton?: boolean;

    /** If false, widget won't appear in unpinned menu. Default: true. Use false for base widgets that only create instances */
    showInUnpinnedMenu?: boolean;

    /**
     * Optional metadata (title, actions, icon) to apply to the widget when rendered
     * @since 0.11.0
     */
    metadata?: WidgetMetadata;
}
