<script lang="ts">
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import ThumbsUp from '$icons/lucide/thumbs-up';
    let count: number = $state(0);
    const increment = () => {
        count += 1;
    };
</script>

<Button variant="outline" onclick={increment}>
    <ThumbsUp /> count is {count}
</Button>
