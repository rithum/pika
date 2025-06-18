<script lang="ts">
	import '../app.css';

	import type { Snippet } from 'svelte';

    interface Props {
        children?: Snippet<[]>;
    }

    const { children }: Props = $props();

	// Dashboard component for enterprise site
	let isPanelOpen = $state(false);
	let panelWidthState: 'normal' | 'fullscreen' = $state('normal');
	let panelWidth = $derived(panelWidthState === 'normal' ? 'w-[500px]' : 'w-[100%]');

	function togglePanel() {
		isPanelOpen = !isPanelOpen;
	}

	$effect(() => {
		const handleMessage = (event: MessageEvent) => {
			// Verify the message is from our chat app
			// if (event.origin !== "http://localhost:3000") return;

			if (event.data.type === 'PIKA_CHAT_CLOSE') {
				togglePanel();
			}

			if (event.data.type === 'PIKA_CHAT_PANEL_WIDTH_STATE') {
				panelWidthState = event.data.state === 'normal' ? 'normal' : 'fullscreen';
			}
		};

		window.addEventListener('message', handleMessage);

		return () => {
			window.removeEventListener('message', handleMessage);
		};
	});
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Top Navigation -->
	<nav class="bg-white shadow-sm">
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="flex h-16 justify-between">
				<div class="flex">
					<div class="flex flex-shrink-0 items-center">
						<span class="text-xl font-bold text-acme-blue">Acme Sample Site</span>
					</div>
				</div>
				<div class="flex items-center">
					<div class="flex-shrink-0">
						<span class="text-sm text-gray-500">Welcome, Test User</span>
					</div>
					<button
						class="p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-acme-blue"
						onclick={() => (isPanelOpen = !isPanelOpen)}
						title="AI Assistant"
					>
						<!-- Provided AI SVG icon -->
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 512 512"
							fill="none"
						>
							<path
								fill="currentColor"
								d="m320 192l-85.333-32L320 127.968l32-85.301l32.03 85.301L469.333 160l-85.303 32L352 277.333zM149.333 362.667L42.667 320l106.666-42.667L192 170.667l42.667 106.666L341.333 320l-106.666 42.667L192 469.333z"
							/>
						</svg>
					</button>
				</div>
			</div>
		</div>
	</nav>

	<!-- Sliding Panel -->
	<div
		class="fixed top-0 right-0 h-full {panelWidth} bg-white shadow-lg transform transition-transform duration-300 ease-in-out z-50"
		style="transform: translateX({isPanelOpen ? '0' : '100%'})"
	>
		<div class="h-full flex flex-col">
			<div class="flex-1">
				<iframe
					src="http://localhost:3000/chat/order-analyzer?mode=embedded"
					class="w-full h-full border-0"
					title="AI Chat Interface"
				></iframe>
			</div>
		</div>
	</div>

	<!-- Overlay when panel is open -->
	{#if isPanelOpen}
		<button
			type="button"
			aria-label="Close AI Assistant panel"
			class="fixed inset-0 w-full h-full bg-black bg-opacity-25 z-40 cursor-default"
			onclick={togglePanel}
		></button>
	{/if}

	<div class="flex">
		<!-- Sidebar -->
		<div class="w-64 min-h-screen bg-white shadow-sm">
			<nav class="mt-5 px-2">
				<a href="/" class="nav-link active">
					<svg class="mr-3 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
						/>
					</svg>
					Dashboard
				</a>
				<a href="/analytics" class="nav-link">
					<svg class="mr-3 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
						/>
					</svg>
					Analytics
				</a>
				<a href="/settings" class="nav-link">
					<svg class="mr-3 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
					Settings
				</a>
			</nav>
		</div>

		<!-- Main Content -->
		<main class="flex-1 p-8">
			{@render children?.()}
		</main>
	</div>
</div>
