<script lang="ts">
    import type { Component } from 'svelte';
    import { Badge } from '$ui/shadcn/badge';

    interface Props {
        title: string;
        score: number;
        description: string;
        icon?: Component;
        compact?: boolean;
    }

    let { title, score, description, icon, compact = false }: Props = $props();

    // Score color logic
    const scoreColor = $derived(score >= 8 ? 'bg-green-500' : score >= 6 ? 'bg-yellow-500' : 'bg-red-500');

    const scoreBgColor = $derived(
        score >= 8
            ? 'bg-green-50 border-green-200'
            : score >= 6
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-red-50 border-red-200'
    );

    const scoreTextColor = $derived(score >= 8 ? 'text-green-700' : score >= 6 ? 'text-yellow-700' : 'text-red-700');
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
