<script lang="ts">
    import Button from '../../../../shadcn/button/button.svelte';
    // TODO: Add complete Button documentation and examples
</script>

<div class="max-w-4xl mx-auto p-6">
    <h1 class="text-4xl font-bold text-foreground mb-6">Button</h1>

    <div class="prose prose-slate dark:prose-invert max-w-none">
        <p class="text-lg text-muted-foreground mb-8">A versatile button component with multiple variants and sizes.</p>

        <div class="grid gap-6">
            <!-- Quick Preview -->
            <div class="bg-card border border-border rounded-lg p-6">
                <h3 class="text-lg font-semibold mb-4">Preview</h3>
                <div class="flex gap-4 flex-wrap">
                    <Button>Default</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="destructive">Destructive</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                </div>
            </div>

            <div class="bg-card border border-border rounded-lg p-6">
                <h2 class="text-xl font-semibold mb-4">TODO: Complete Button Documentation</h2>
                <ul class="space-y-2 text-muted-foreground">
                    <li>• All variant examples (default, secondary, destructive, outline, ghost, link)</li>
                    <li>• Size variations (sm, default, lg, icon)</li>
                    <li>• Usage with icons</li>
                    <li>• Loading states</li>
                    <li>• Disabled states</li>
                    <li>• Props API reference</li>
                    <li>• Code examples</li>
                    <li>• Accessibility guidelines</li>
                </ul>
            </div>
        </div>
    </div>
</div>
