<script lang="ts">
    const { children, ...rest } = $props();
</script>
<span>{@render children?.()}</span>
