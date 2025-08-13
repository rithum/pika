<script lang="ts">
    import CopyButton from '$ui/pika/copy-button/copy-button.svelte';

    interface Props {
        userId: string;
    }

    let { userId }: Props = $props();
</script>

<CopyButton truncateAfter={12} embedded={true}>
    {userId}
</CopyButton>
