<script lang="ts">
    import TriangleAlert from '$icons/lucide/triangle-alert';

    interface Props {
        visible: boolean;
    }

    let { visible }: Props = $props();
</script>

{#if visible}
    <div class="flex items-start gap-3 p-4 mb-6 border border-red-200 bg-red-50 rounded-lg">
        <TriangleAlert class="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
        <div>
            <h4 class="font-medium text-red-900">Configuration Errors</h4>
            <p class="text-sm text-red-700 mt-1">
                There are validation errors in your configuration. Please review the sections marked with error
                indicators and correct the issues before saving.
            </p>
        </div>
    </div>
{/if}
