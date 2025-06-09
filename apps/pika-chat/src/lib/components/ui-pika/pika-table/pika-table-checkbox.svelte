<script lang="ts">
    import type { Checkbox as CheckboxPrimitive, WithoutChildrenOrChild } from 'bits-ui';
    import { Checkbox } from '$lib/components/ui/checkbox';

    let {
        checked = false,
        onCheckedChange = (v) => (checked = v),
        ...restProps
    }: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<Checkbox bind:checked={() => checked, onCheckedChange} {...restProps} />
