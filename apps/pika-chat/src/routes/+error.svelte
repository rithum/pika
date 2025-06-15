<script lang="ts">
    import { page } from '$app/state';
    import { Button } from '$lib/components/ui/button';

    function goBack() {
        history.back();
    }
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">{page.status} {page.error?.message}</h1>
        <Button onclick={goBack}>Go Back</Button>
    </div>
</div>
