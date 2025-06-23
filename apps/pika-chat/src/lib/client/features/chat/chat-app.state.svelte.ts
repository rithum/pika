import type { AppState } from '$client/app/app.state.svelte';
import type { FetchZ } from '$client/app/shared-types';
import type { SidebarState } from '$lib/components/ui/sidebar/context.svelte';
import {
    DEFAULT_FEATURE_ENABLED_VALUE,
    FEATURE_NAMES,
    type ChatApp,
    type ChatMessage,
    type ChatMessageFile,
    type ChatMessageForRendering,
    type ChatMessagesResponse,
    type ChatSession,
    type ChatSessionsResponse,
    type ConverseRequest
} from '@pika/shared/types/chatbot/chatbot-types';
import { generateChatFileUploadS3KeyName, getFeature, sanitizeFileName } from '@pika/shared/util/chatbot-shared-utils';
import type { Page } from '@sveltejs/kit';
import type { Snippet } from 'svelte';
import { v7 as uuidv7 } from 'uuid';
import { UploadInstance } from '../upload/upload-instance.svelte';
import { UploadState } from '../upload/upload.state.svelte';
import { ChatFileValidationError } from './lib/ChatFileValidationError';
import type { ComponentRegistry } from './message-segments/component-registry';
import { MessageSegmentProcessor } from './message-segments/segment-processor';
import { ChatNavState } from './nav/chat-nav.state.svelte';

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
 * Structure for persisting input state in localStorage
 */
interface PersistedInputState {
    text: string;
    uploads: UploadInstance[];
}

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
export class ChatAppState {
    #chatApp = $state<ChatApp>() as ChatApp;
    #appState = $state<AppState>() as AppState;
    #chatSessions = $state<ChatSession[]>([]);
    #currentSession = $state<ChatSession>() as ChatSession; // Initialized in constructor
    #curSessionMessages = $state<ChatMessageForRendering[]>([]);
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
    #appSidebarState: SidebarState | undefined;
    #appSidebarOpen = $derived.by(() => {
        if (!this.#appSidebarState) {
            return false;
        }
        return this.#appState.isMobile ? this.#appSidebarState.openMobile : this.#appSidebarState.open;
    });
    #enableFileUpload = $derived.by(() => {
        const fileUploadFeature = getFeature(this.chatApp, 'fileUpload');
        let result = DEFAULT_FEATURE_ENABLED_VALUE.fileUpload;

        if (fileUploadFeature) {
            result = fileUploadFeature.enabled;

            // If they don't have mimeTypesAllowed, then we act like it is disabled and log it
            if (result && (!fileUploadFeature.mimeTypesAllowed || fileUploadFeature.mimeTypesAllowed.length === 0)) {
                console.warn(`${FEATURE_NAMES.fileUpload} is enabled but has no mimeTypesAllowed`);
                result = false;
            }
        }

        return result;
    });
    #hidePromptInputFieldLabel = $derived.by(() => {
        let result = !DEFAULT_FEATURE_ENABLED_VALUE.promptInputFieldLabel;
        const promptInputFieldLabelFeature = getFeature(this.chatApp, 'promptInputFieldLabel');

        if (promptInputFieldLabelFeature) {
            result = this.chatApp.mode !== 'fullpage' || promptInputFieldLabelFeature.enabled === false;
        }

        return result;
    });
    #promptInputFieldLabel = $derived.by(() => {
        let result = 'Ready to chat';
        const promptInputFieldLabelFeature = getFeature(this.chatApp, 'promptInputFieldLabel');

        if (promptInputFieldLabelFeature && promptInputFieldLabelFeature.promptInputFieldLabel) {
            result = promptInputFieldLabelFeature.promptInputFieldLabel;
        }

        return result;
    });

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
        const suggestionsFeature = getFeature(this.chatApp, 'suggestions');
        if (!suggestionsFeature?.enabled || !suggestionsFeature.suggestions?.length) {
            return [];
        }

        const { suggestions, randomize, randomizeAfter = 0, maxToShow = 5 } = suggestionsFeature;

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

    get componentRegistry() {
        return this.#componentRegistry;
    }

    get suggestions() {
        return this.#suggestions;
    }

    get hidePromptInputFieldLabel() {
        return this.#hidePromptInputFieldLabel;
    }

    get promptInputFieldLabel() {
        return this.#promptInputFieldLabel;
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
        return this.#chatInput;
    }

    set chatInput(msg: string) {
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
        componentRegistry: ComponentRegistry
    ) {
        this.#chatApp = chatApp;
        this.#appState = appState;
        this.#loadInprogressInputs();
        this.#uploadState = new UploadState(this.fetchz);
        this.#setSession(undefined);
        this.#page = page;
        this.#componentRegistry = componentRegistry;
        this.#messageProcessor = new MessageSegmentProcessor(componentRegistry);

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
        //             : null
        //     });
        // });
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
    #setSession(session: ChatSession | undefined) {
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
                userId: this.#appState.identity.user.userId,
                agentAliasId: 'interim-agent-alias-id',
                chatAppId: this.#chatApp.chatAppId,
                agentId: 'interim-agent-id',
                identityId: this.#appState.identity.user.userId,
                sessionAttributes: {
                    companyId: this.#appState.identity.user.companyId,
                    token: 'interim-token',
                    companyType: this.#appState.identity.user.companyType,
                    firstName: this.#appState.identity.user.firstName,
                    lastName: this.#appState.identity.user.lastName,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
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
            const resp = await this.fetchz(`/api/session/${this.#chatApp.chatAppId}`);
            if (resp.ok) {
                const sessionsResult = (await resp.json()) as ChatSessionsResponse;
                if (sessionsResult.success) {
                    this.#chatSessions = sessionsResult.sessions;
                } else {
                    console.error('Error refreshing chat sessions from server', sessionsResult.error);
                }
            }
        } catch (e) {
            console.error('Error refreshing chat sessions from server', e);
            throw e;
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

    async refreshMessagesForCurrentSession() {
        if (this.#isInterimSession) return; // Not a real session yet

        try {
            this.#retrievingMessages = true;
            const resp = await this.fetchz(`/api/message/${this.#currentSession.sessionId}`);
            if (resp.ok) {
                const msgResult = (await resp.json()) as ChatMessagesResponse;
                if (msgResult.success) {
                    this.#curSessionMessages = msgResult.messages.map((msg) => this.#processMessageIntoSegments({ ...msg, segments: [] }, false));
                } else {
                    console.error('Error refreshing messages for current session', msgResult.error);
                }
            }
        } catch (e) {
            console.error('Error refreshing messages for current session', e);
        } finally {
            this.#retrievingMessages = false;
        }
    }

    async sendMessage() {
        if (!this.#chatInput.trim()) return;

        this.#streamingResponseNow = true;
        this.#messageChunkCount = 0;
        const messageToSendToServer = this.#chatInput;

        let sessionId = this.#currentSession.sessionId;

        // Add user message to the conversation immediately (a ChatMessage is what is sent to the server and saved to the database)
        const userMessage: ChatMessage = {
            userId: this.#appState.identity.user.userId,
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
            userId: this.#appState.identity.user.userId,
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
                userId: this.#appState.identity.user.userId,
                sessionId: wasInterimSession ? undefined : sessionId,
                companyId: this.#appState.identity.user.companyId,
                companyType: this.#appState.identity.user.companyType,
                agentId: this.#chatApp.agentId,
                chatAppId: this.#chatApp.chatAppId,
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

            // Extract session ID from headers if this was a new session
            if (wasInterimSession) {
                const newSessionId = response.headers.get('x-chatbot-session-id');
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
                this.#currentSession.sessionId = newSessionId;

                // Update the messages with the new session ID
                const oldMessages = this.#curSessionMessages;
                this.#curSessionMessages = this.#curSessionMessages.map((msg) => ({
                    ...msg,
                    sessionId: newSessionId
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
                    // console.log('[CHAT-APP-STATE] Calling doneStreaming:', {
                    //     interimMessageId: this.#interimMessageId,
                    //     segmentsBeforeDone: interimMsg.segments.length,
                    //     segmentStatusesBeforeDone: interimMsg.segments.map((seg, idx) => ({
                    //         index: idx,
                    //         segmentType: seg.segmentType,
                    //         streamingStatus: seg.streamingStatus,
                    //         rawContentLength: seg.rawContent?.length || 0
                    //     }))
                    // });

                    this.#messageProcessor.doneStreaming(interimMsg.segments);
                    interimMsg.isStreaming = false;

                    // console.log('[CHAT-APP-STATE] After doneStreaming:', {
                    //     segmentsAfterDone: interimMsg.segments.length,
                    //     segmentStatusesAfterDone: interimMsg.segments.map((seg, idx) => ({
                    //         index: idx,
                    //         segmentType: seg.segmentType,
                    //         streamingStatus: seg.streamingStatus,
                    //         rawContentLength: seg.rawContent?.length || 0
                    //     }))
                    // });
                }
            }

            // Refresh sessions and its messages
            this.refreshChatSessions();
            this.refreshMessagesForCurrentSession();

            // Files already cleared above for interim sessions, but clear for non-interim sessions too
            if (!wasInterimSession) {
                this.#inputFiles = [];
                this.#persistInputState();
            }
        } catch (error) {
            //TODO: need to trigger a toast
            console.error('Error sending message:', error);
            //TODO: what should we do here?
            // // Remove the interim message on error
            // if (this.#curSessionMessages && this.#interimMessageId) {
            //     this.#curSessionMessages = this.#curSessionMessages.filter(
            //         (msg) => msg.messageId !== this.#interimMessageId!.messageId
            //     );
            // }
            // You might want to show an error message to the user here
        } finally {
            //TODO: if we get an error what do we do with the interim messages and session?  I think we keep them there.
            this.#streamingResponseNow = false;
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
        //             : null,
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
            const s3Key = generateChatFileUploadS3KeyName(this.#appState.identity.user.userId, fileName, uuidv7());
            const instance = new UploadInstance({ s3Key, file, fileName });
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
            userId: this.#appState.identity.user.userId,
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
                userId: this.#appState.identity.user.userId,
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
}
