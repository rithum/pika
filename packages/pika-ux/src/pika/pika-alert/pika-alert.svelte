<script lang="ts">
    import Button from '../../shadcn/button/button.svelte';
    import * as Dialog from '../../shadcn/dialog';
    interface Props {
        title: string;
        description: string;
        open: boolean;
        ok?: {
            label?: string;
            onClick: () => void;
        };
        cancel?: {
            showCancel: boolean;
            label?: string;
            onClick: () => void;
        };
    }

    let { title, description, ok, cancel, open = $bindable() }: Props = $props();

    function handleCancel() {
        open = false;
        if (cancel?.onClick) {
            cancel.onClick();
        }
    }

    function handleOk() {
        open = false;
        if (ok?.onClick) {
            ok.onClick();
        }
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content>
        <Dialog.Header>
            <Dialog.Title>{title}</Dialog.Title>
        </Dialog.Header>
        <div class="pb-2 pt-2 max-w-3xl mx-auto w-full">
            <div class="flex flex-col gap-6">
                <p class="text-sm text-muted-foreground">{description}</p>
            </div>
        </div>
        <Dialog.Footer>
            {#if cancel?.showCancel}
                <Button variant="outline" onclick={handleCancel}>{cancel?.label ?? 'Cancel'}</Button>
            {/if}
            <Button variant="default" onclick={handleOk}>{ok?.label ?? 'OK'}</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
