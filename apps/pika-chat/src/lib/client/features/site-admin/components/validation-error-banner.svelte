<script lang="ts">
    import TriangleAlert from '$icons/lucide/triangle-alert';

    interface Props {
        visible: boolean;
    }

    let { visible }: Props = $props();
</script>

{#if visible}
    <div class="flex items-start gap-3 p-4 mb-6 border border-destructive/20 bg-danger-bg rounded-lg">
        <TriangleAlert class="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
        <div>
            <h4 class="font-medium text-destructive">Configuration Errors</h4>
            <p class="text-sm text-destructive/80 mt-1">
                There are validation errors in your configuration. Please review the sections marked with error
                indicators and correct the issues before saving.
            </p>
        </div>
    </div>
{/if}
