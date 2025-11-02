<script lang="ts">
    import CopyButton from 'pika-ux/pika/copy-button/copy-button.svelte';

    interface Props {
        entityId: string;
        entityName?: string;
    }

    let { entityId, entityName }: Props = $props();

    // Determine if we have a display name
    const hasName = $derived(!!entityName && entityName !== entityId);

    // Manage hover state
    let isHovered = $state(false);
</script>

{#if hasName}
    <div
        class="flex flex-col gap-0.5"
        role="group"
        onmouseenter={() => (isHovered = true)}
        onmouseleave={() => (isHovered = false)}
    >
        <div class="text-sm">
            {entityName}
        </div>
        <div class="flex items-center gap-1">
            {#if isHovered}
                <CopyButton truncateAfter={12} embedded={true} value={entityId} size="small" />
            {/if}
        </div>
    </div>
{:else}
    <div
        class="flex items-center gap-1"
        role="group"
        onmouseenter={() => (isHovered = true)}
        onmouseleave={() => (isHovered = false)}
    >
        <span class="font-medium text-sm">{entityId}</span>
        {#if isHovered}
            <CopyButton truncateAfter={12} embedded={true} value={entityId} size="small" />
        {/if}
    </div>
{/if}
