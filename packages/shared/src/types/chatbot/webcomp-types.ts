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
    RecordOrUndef,
    ShareSessionState,
    ShowToastFn,
    TagDefinition,
    TagDefinitionWidget,
    UserAwsCredentials,
    UserDataOverrideSettings,
    UserPrefs,
    WidgetRenderingContextType
} from './chatbot-types';

// Note: These are intentionally `any` to avoid coupling the shared package to Svelte
// The actual implementation will use the correct types from the appropriate packages
export type SidebarState = any;
export type Snippet = any;

/** Declare global event map for pika context request */
declare global {
    interface HTMLElementEventMap {
        'pika-context-request': PikaWCContextRequestEvent;
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

export interface IChatAppState {
    readonly entityFeatureEnabled: boolean;
    readonly shareCurrentSessionState: ShareSessionState;
    readonly showToast: ShowToastFn;
    readonly userPrefs: IUserPrefsState;
    readonly mode: ChatAppMode;
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
 * This is the context object that is passed to the web component when it is rendered.
 */
export interface PikaWCContext {
    appState: IAppState;
    renderingContext: WidgetRenderingContextType; // e.g. 'spotlight', 'inline', 'dialog', 'canvas'
    chatAppState: IChatAppState;
    chatAppId: string;
}

export type PikaWCContextRequestCallbackFn = (contextRequest: PikaWCContext) => void;

// Fix: The detail should be an object containing the callback
export interface PikaWCContextRequestDetail {
    callback: PikaWCContextRequestCallbackFn;
}

export interface PikaWCContextRequestEvent extends CustomEvent<PikaWCContextRequestDetail> {
    detail: PikaWCContextRequestDetail;
}
