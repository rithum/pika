<script lang="ts">
    /**
     * This is designed for you to customize the client side process if you need to.
     * It will not by synchronized with the framework.  Delete this file if you don't need it.
     */
    import type { PageData } from './$types';
    const { data }: { data: PageData } = $props();

    const customData = data.customData;
</script>

Authenticating...
