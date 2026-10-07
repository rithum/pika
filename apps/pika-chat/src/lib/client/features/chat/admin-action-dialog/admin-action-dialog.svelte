<script lang="ts">
    /** Shared scaffolding for the admin action dialogs (content-admin, user-data-overrides). */
    import { Button } from 'pika-ux/shadcn/button';
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import { untrack, type Snippet } from 'svelte';
    import { toast } from 'svelte-sonner';

    interface Props {
        open: boolean;
        title: string;
        /** Header description content (may contain markup). */
        description: Snippet;
        /** The custom UI body rendered between the header and the button row. */
        children: Snippet;
        /** Primary (Save) action. */
        saveLabel?: string;
        saveDisabled?: boolean;
        saving?: boolean;
        onSave: () => Promise<void>;
        saveErrorMessage: string;
        /** Secondary (left-aligned) action, e.g. "Stop Viewing as User" / "Clear Override Data". */
        secondaryLabel: string;
        secondaryDisabled?: boolean;
        /** True while the secondary action's own request is in flight (drives its spinner + disabled). */
        secondaryInProgress?: boolean;
        onSecondary: () => Promise<void>;
        secondaryErrorMessage: string;
        /** Reset the custom UI back to its last-saved state. */
        onReset: () => void;
        resetDisabled?: boolean;
        /** Wrapper class for the body slot (lets each dialog keep its original width/padding). */
        bodyClass?: string;
    }

    let {
        open = $bindable(),
        title,
        description,
        children,
        saveLabel = 'Save',
        saveDisabled = false,
        saving = false,
        onSave,
        saveErrorMessage,
        secondaryLabel,
        secondaryDisabled = false,
        secondaryInProgress = false,
        onSecondary,
        secondaryErrorMessage,
        onReset,
        resetDisabled = false,
        bodyClass = 'p-6 pt-3 max-w-3xl mx-auto w-full',
    }: Props = $props();

    let showSuccessMessage = $state(false);
    // Guards against a second action dispatching while one is already in flight — the
    // per-operation `saving`/`secondaryInProgress` flags only flip inside the command
    // (after any pre-command await such as getDataToPostToServer), leaving a small
    // double-click window that this closes at the single choke point.
    let running = $state(false);

    // The component instance persists while its parent {#if} holds, so reset back to
    // the form each time the dialog (re)opens — otherwise a prior success would keep
    // showing the Success screen on the next open.
    $effect(() => {
        if (open) showSuccessMessage = false;
    });

    //TODO: this is a hack to work around a bug where the body element is not having
    // pointer-events: none removed when the dialog is closed.
    $effect(() => {
        return () => {
            untrack(() => {
                document.body.style.pointerEvents = '';
            });
        };
    });

    /** The one place dialog actions are executed. */
    async function runAction(action: () => Promise<void>, errorMessage: string) {
        if (running) return;
        running = true;
        try {
            await action();
            // Shown for every action (Save AND the secondary Stop/Clear): all of them
            // mutate context the page was already rendered under (viewed-user session /
            // override data), so a reload is needed for the change to take effect.
            showSuccessMessage = true;
        } catch (error) {
            console.error(errorMessage, error);
            toast.error(errorMessage);
        } finally {
            running = false;
        }
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
        {#if showSuccessMessage}
            <Dialog.Header>
                <Dialog.Title>Success</Dialog.Title>
                <div class="pt-4 pb-4 text-sm text-muted-foreground">
                    Please refresh the page for this to take effect.
                </div>
                <Button onclick={() => window.location.reload()}>Refresh</Button>
            </Dialog.Header>
        {:else}
            <Dialog.Header>
                <Dialog.Title>{title}</Dialog.Title>
                <Dialog.Description>
                    {@render description()}
                </Dialog.Description>
            </Dialog.Header>
            <div class={bodyClass}>
                {@render children()}
            </div>
            <div class="flex gap-2">
                <div class="flex gap-2 items-center">
                    <Button disabled={secondaryDisabled || secondaryInProgress || running} variant="outline" onclick={() => runAction(onSecondary, secondaryErrorMessage)}>
                        {secondaryLabel}
                    </Button>
                    {#if secondaryInProgress}
                        <span
                            class="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
                        ></span>
                    {/if}
                </div>
                <div class="flex justify-end gap-2 flex-1 items-center">
                    {#if saving}
                        <span
                            class="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
                        ></span>
                    {/if}
                    <Button disabled={saveDisabled || running} onclick={() => runAction(onSave, saveErrorMessage)}>{saveLabel}</Button>
                    <Button disabled={resetDisabled || running} variant="outline" onclick={onReset}>Reset</Button>
                    <Button disabled={saving || secondaryInProgress || running} variant="outline" onclick={() => (open = false)}>Cancel</Button>
                </div>
            </div>
        {/if}
    </Dialog.Content>
</Dialog.Root>
