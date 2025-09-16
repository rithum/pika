<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import ChatFileDisplay from '$lib/client/features/chat/chat-input/chat-file-display.svelte';
    import MessageRenderer from '$lib/client/features/chat/message-segments/message-renderer.svelte';
    import { formatDateTime } from '$lib/utils';
    import {
        DEFAULT_MAX_K_MATCHES_PER_STRATEGY,
        DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT,
        type ChatAppOverridableFeatures,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';

    const appState = getContext<AppState>('appState');
    const sessionInsights = appState.siteAdmin.sessionInsights;

    const features: ChatAppOverridableFeatures = {
        tags: {
            tagsEnabled: [],
        },
        agentInstructionAssistance: {
            enabled: false,
            includeInstructionsForTags: false,
            completeExampleInstructionLine: undefined,
            jsonOnlyImperativeInstructionLine: undefined,
            includeOutputFormattingRequirements: false,
            completeExampleInstructionEnabled: false,
            jsonOnlyImperativeInstructionEnabled: false,
        },
        traces: {
            enabled: true,
            detailedTraces: true,
        },
        verifyResponse: {
            enabled: true,
        },
        chatDisclaimerNotice:
            'This is a chatbot that can help you with your questions. It is not a human and does not have access to your personal information.',
        logout: {
            enabled: true,
            menuItemTitle: 'Logout',
            dialogTitle: 'Logout',
            dialogDescription: 'Are you sure you want to logout?',
        },
        siteAdmin: {
            websiteEnabled: true,
        },
        fileUpload: {
            mimeTypesAllowed: ['image/png', 'image/jpeg', 'image/gif'],
        },
        suggestions: {
            suggestions: ['Hello', 'How are you?', 'What is the weather in Tokyo?'],
            randomize: true,
            randomizeAfter: 10,
            maxToShow: 3,
        },
        promptInputFieldLabel: {
            label: 'Ask me anything...',
        },
        uiCustomization: {
            showUserRegionInLeftNav: true,
            showChatHistoryInStandaloneMode: true,
        },
        instructionAugmentation: {
            enabled: true,
        },
        userMemory: {
            enabled: true,
            maxMemoryRecordsPerPrompt: DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT,
            maxKMatchesPerStrategy: DEFAULT_MAX_K_MATCHES_PER_STRATEGY,
        },
    };
</script>

{#if sessionInsights.retrievingMessages || (sessionInsights.currentSessionMessages && sessionInsights.currentSessionMessages.length > 0)}
    <!-- Scrollable area that spans full width with right-aligned scrollbar -->
    <div class="w-full inset-0 pb-[150px] scroll-pb-[150px] overflow-y-auto">
        <!-- Centered content container -->
        <div class="w-full max-w-[768px] mx-auto">
            <div class="pb-4 pt-10">
                {#each sessionInsights.currentSessionMessages as message}
                    <div class="flex flex-col gap-8 mb-10">
                        {#if message.source === 'user'}
                            <div class="flex flex-col items-end gap-2">
                                <div class="p-4 rounded-lg bg-gray-50 max-w-[66%]">{message.message}</div>
                                {#if message.files && message.files.length > 0}
                                    <div class="flex flex-wrap gap-2 max-w-[66%] justify-end">
                                        {#each message.files as file}
                                            <ChatFileDisplay {file} />
                                        {/each}
                                    </div>
                                {/if}
                                <div class="user timestamp">
                                    {formatDateTime(message.timestamp)}
                                </div>
                            </div>
                        {:else}
                            <div class="flex flex-col gap-2">
                                <MessageRenderer
                                    {message}
                                    files={message.files ?? []}
                                    isStreaming={false}
                                    componentRegistry={sessionInsights.componentRegistry}
                                    traceEnabled={true}
                                    {features}
                                />
                                {#if message.files && message.files.length > 0}
                                    <div class="flex flex-wrap gap-2 max-w-[66%]">
                                        {#each message.files as file}
                                            <ChatFileDisplay {file} />
                                        {/each}
                                    </div>
                                {/if}

                                <div class="assistant timestamp">
                                    {formatDateTime(message.timestamp)}
                                </div>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
        {@render loader(sessionInsights.retrievingMessages)}
    </div>
{/if}

{#snippet loader(showing: boolean)}
    {#if showing}
        <div class="flex items-center justify-center">
            <svg class="w-6 h-6 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
            </svg>
        </div>
    {/if}
{/snippet}
