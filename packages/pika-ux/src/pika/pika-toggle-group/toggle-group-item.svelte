<script lang="ts">
	import { getToggleGroupCtx } from "./toggle-group.svelte";
	import { cn } from '../../shadcn/utils.js';
	import type { Snippet } from 'svelte';

	type Props = {
		value: string;
		class?: string;
		disabled?: boolean;
		children?: Snippet;
	};

	let {
		value,
		class: className,
		disabled = false,
		children
	}: Props = $props();

	const ctx = getToggleGroupCtx();
	
	const isSelected = $derived(() => {
		const currentValue = ctx.getValue();
		if (ctx.type === 'single') {
			return currentValue === value;
		} else {
			const arr = Array.isArray(currentValue) ? currentValue : [];
			return arr.includes(value);
		}
	});

	function handleClick() {
		if (!disabled) {
			ctx.toggle(value);
		}
	}

	// Determine if buttonWidth is a Tailwind class or CSS value
	const widthClass = ctx.buttonWidth?.match(/^(w-|min-w-|max-w-)/) ? ctx.buttonWidth : undefined;
	const widthStyle = ctx.buttonWidth && !widthClass ? `width: ${ctx.buttonWidth};` : '';
</script>

<button
	type="button"
	onclick={handleClick}
	disabled={disabled}
	class={cn(
		// Base styles
		'inline-flex items-center justify-center',
		'text-sm font-medium',
		'transition-colors',
		'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
		'disabled:pointer-events-none disabled:opacity-50',
		
		// Size
		'h-9 px-3',
		
		// White background by default
		'bg-white',
		
		// Border for outline variant
		'border border-input',
		
		// Selected state - gray background
		isSelected() && 'bg-gray-100 text-gray-700',

		// Hover state - use primary color from your theme
		'hover:text-primary',
		
		// No rounded corners, borders between buttons
		'border-l-0 first:border-l',
		
		// Focus
		'focus:z-10 focus-visible:z-10',
		
		// Width
		widthClass,
		
		// Flex
		'min-w-0 flex-1 shrink-0',

		
		className
	)}
	style={widthStyle}
>
	{@render children?.()}
</button>
