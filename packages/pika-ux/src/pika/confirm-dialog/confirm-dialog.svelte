<script lang="ts">
    import { Button } from '../../shadcn/button';
    import * as Dialog from '../../shadcn/dialog';
    let {
        open = $bindable(false),
        message: confirmQuestion,
        onyes,
        title,
        yesBtnTitle,
        noBtnTitle,
        onno,
        onclose
    }: {
        open: boolean;
        message: string;
        title?: string;
        yesBtnTitle?: string;
        noBtnTitle?: string;

        onyes: () => void;
        onno?: () => void;
        onclose?: () => void;
    } = $props();

    let noCallback =
        onno ??
        (() => {
            open = false;
        });
</script>

<Dialog.Root
    bind:open
    onOpenChange={() => {
        if (!open && onclose) {
            onclose();
        }
    }}
>
    <Dialog.Content class="max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
        <Dialog.Title>{title ?? 'Confirm'}</Dialog.Title>
        {confirmQuestion}
        <Dialog.Footer>
            <Button variant="default" onclick={onyes}>{yesBtnTitle ?? 'Confirm'}</Button>
            <Button variant="outline" onclick={noCallback}>{noBtnTitle ?? 'Cancel'}</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
