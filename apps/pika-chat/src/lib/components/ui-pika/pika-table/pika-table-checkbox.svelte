<script lang="ts">
    import { Checkbox } from '$lib/components/ui/checkbox';
    import type { Checkbox as CheckboxPrimitive, WithoutChildrenOrChild } from 'bits-ui';

    let {
        checked = false,
        onCheckedChange = (v) => (checked = v),
        ...restProps
    }: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<Checkbox bind:checked={() => checked, onCheckedChange} {...restProps} />
