<script lang="ts">
    import CreateCopyLinkButton from 'pika-ux/pika/create-copy-link-button/create-copy-link-button.svelte';
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import { getContext } from 'svelte';
    import { ChatAppState } from '../chat-app.state.svelte';

    const chat = getContext<ChatAppState>('chatAppState');

    let title = $derived.by(() => {
        let result = '';
        if (chat.shareCurrentSessionState === 'disable-share-feature') {
            // THey should never see this since we disable the share feature if it is not enabled.
            result = 'Share feature is disabled';
        } else if (
            chat.shareCurrentSessionState === 'shared-by-me' ||
            chat.shareCurrentSessionState === 'shared-by-someone-else'
        ) {
            result = 'Chat Share Link';
        } else if (chat.shareCurrentSessionState === 'not-shared') {
            result = 'Share Chat';
        } else {
            throw new Error(`Invalid share state: ${chat.shareCurrentSessionState}`);
        }
        return result;
    });

    let description = $derived.by(() => {
        let result = '';
        if (chat.shareCurrentSessionState === 'disable-share-feature') {
            // THey should never see this since we disable the share feature if it is not enabled.
            result = 'Share feature is disabled';
        } else if (
            chat.shareCurrentSessionState === 'shared-by-me' ||
            chat.shareCurrentSessionState === 'shared-by-someone-else'
        ) {
            result = 'Already shared, get the link below';
        } else if (chat.shareCurrentSessionState === 'not-shared') {
            result = 'All current and future messages in this chat will be shared';
        } else {
            throw new Error(`Invalid share state: ${chat.shareCurrentSessionState}`);
        }
        return result;
    });

    function reset() {
        //TODO: Implement
    }

    function getShareUrl() {
        if (typeof window === 'undefined' || !window.location) {
            throw new Error('Window element not found');
        }

        if (!chat.currentSession?.shareId) {
            throw new Error('Share id not found');
        }

        return chat.getShareUrl(window.location.origin + window.location.pathname, chat.currentSession.shareId);
    }
</script>

<Dialog.Root
    bind:open={
        () => chat.showCurrentSessionDialog,
        (val) => {
            chat.showCurrentSessionDialog = val === true;
        }
    }
    onOpenChange={(open) => {
        console.log('open', open);
        if (!open) {
            reset();
        }
    }}
>
    <Dialog.Content class="w-[800px] max-w-[590px] sm:max-w-[590px] max-h-[90vh] overflow-y-auto">
        <Dialog.Header>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description>{description}</Dialog.Description>
        </Dialog.Header>
        <div class="pt-3 max-w-[650px]">
            <div class="text-sm text-muted-foreground mb-2">
                {#if chat.entityFeatureEnabled}
                    <p>Link only works for authenticated users in your org or internal admins.</p>
                {:else}
                    <p>Link works for authenticated users with access to this chat app or internal admins.</p>
                {/if}
            </div>
            <CreateCopyLinkButton
                width={650}
                truncateAfter={34}
                linkUrl={chat.shareCurrentSessionState === 'shared-by-me' ||
                chat.shareCurrentSessionState === 'shared-by-someone-else'
                    ? getShareUrl()
                    : undefined}
                createLinkFn={() => {
                    chat.createSharedSession(chat.currentSession.sessionId);
                }}
                creatingLink={chat.sharingSession}
            />
        </div>
    </Dialog.Content>
</Dialog.Root>
