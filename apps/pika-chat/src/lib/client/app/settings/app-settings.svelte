<script lang="ts">
    import Checkbox from 'pika-ux/shadcn/checkbox/checkbox.svelte';
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import { getContext } from 'svelte';
    import type { AppState } from '../app.state.svelte';

    const appState = getContext<AppState>('appState');
</script>

<Dialog.Root bind:open={appState.settings.dialogOpen}>
    <Dialog.Content>
        <Dialog.Header>
            <Dialog.Title>Chatbot Settings</Dialog.Title>
        </Dialog.Header>
        <div class="p-6 max-w-3xl mx-auto w-full">
            <div class="flex flex-col gap-6">
                <div class="grid grid-cols-[1fr_auto] gap-8 border-border">
                    <div class="flex flex-col gap-1">
                        <label for="tooltips" class="font-medium">Hide Tooltips</label>
                        <p class="text-sm text-muted-foreground">Disable tooltips app-wide</p>
                    </div>
                    <div class="flex items-center justify-end">
                        <Checkbox
                            id="tooltips"
                            checked={appState.settings.data.hideTooltips}
                            onCheckedChange={() => appState.settings.toggleTooltips()}
                        />
                    </div>
                </div>
            </div>
        </div>
    </Dialog.Content>
</Dialog.Root>
