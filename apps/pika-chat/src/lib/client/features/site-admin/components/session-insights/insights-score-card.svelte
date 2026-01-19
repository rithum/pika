<script lang="ts">
    import { Badge } from 'pika-ux/shadcn/badge';
    import type { Component } from 'svelte';

    interface Props {
        title: string;
        score: number;
        description: string;
        icon?: Component;
        compact?: boolean;
    }

    let { title, score, description, icon, compact = false }: Props = $props();

    // Score color logic
    const scoreColor = $derived(score >= 8 ? 'bg-success' : score >= 6 ? 'bg-warning' : 'bg-destructive');

    const scoreBgColor = $derived(
        score >= 8
            ? 'bg-success-bg border-success/20'
            : score >= 6
              ? 'bg-warning-bg border-warning/20'
              : 'bg-danger-bg border-destructive/20'
    );

    const scoreTextColor = $derived(score >= 8 ? 'text-success' : score >= 6 ? 'text-warning' : 'text-destructive');
</script>

<div class="border rounded-lg p-3 {scoreBgColor}">
    <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
            {#if icon}
                <icon class="w-4 h-4 {scoreTextColor}"></icon>
            {/if}
            <span class="font-medium text-sm {scoreTextColor}">{title}</span>
        </div>
        <Badge variant="outline" class="font-mono text-xs {scoreTextColor}">
            {score}/10
        </Badge>
    </div>

    <!-- Progress Bar -->
    <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div
            class="h-2 rounded-full {scoreColor} transition-all duration-300"
            style="width: {(score / 10) * 100}%"
        ></div>
    </div>

    {#if !compact}
        <p class="text-xs text-muted-foreground leading-relaxed">
            {description}
        </p>
    {/if}
</div>
