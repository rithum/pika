<script lang="ts">
    import './app.css';
    import Navigation from './lib/docsite/Navigation.svelte';
    import Colors from './lib/docsite/pages/Colors.svelte';
    import Components from './lib/docsite/pages/Components.svelte';
    import Button from './lib/docsite/pages/components/Button.svelte';
    import GettingStarted from './lib/docsite/pages/GettingStarted.svelte';
    import Icons from './lib/docsite/pages/Icons.svelte';

    // Simple routing state
    let currentPage = $state('getting-started');

    function handleNavigate(page: string) {
        currentPage = page;
    }

    // Component mapping
    const pageComponents = {
        'getting-started': GettingStarted,
        icons: Icons,
        colors: Colors,
        components: Components,
        'components/button': Button
    } as const;

    // Derived component based on current page
    const CurrentComponent = $derived(pageComponents[currentPage as keyof typeof pageComponents] || GettingStarted);
</script>

<div class="flex h-screen bg-background">
    <!-- Navigation Sidebar -->
    <div class="w-64 flex-shrink-0">
        <!-- @ts-expect-error SimpleNavigation props working correctly -->
        <Navigation {currentPage} onNavigate={handleNavigate} />
    </div>

    <!-- Main Content Area -->
    <main class="flex-1 overflow-auto">
        <CurrentComponent />
    </main>
</div>

<style>
    :global(html, body) {
        height: 100%;
        margin: 0;
        padding: 0;
    }
</style>
