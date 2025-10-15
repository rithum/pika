<script lang="ts">
    import * as ScrollableTabs from './index.js';

    let activeTab = $state('dashboard');

    function handleAddTab() {
        console.log('Add new tab clicked');
        // Add logic to create a new tab
    }

    const tabs = [
        { value: 'trends', label: '📈 Trends', content: 'Trends analytics and data visualization' },
        { value: 'notifications', label: '🔔 Notifications', content: 'Recent notifications and alerts' },
        { value: 'settings', label: '🛠️ Settings', content: 'Application settings and preferences' },
        { value: 'experiments', label: '🧪 Experiments', content: 'Beta features and experiments' },
        { value: 'integrations', label: '📦 Integrations', content: 'Third-party integrations' },
        { value: 'analytics', label: '📊 Analytics', content: 'Detailed analytics and reports' },
        { value: 'users', label: '👥 Users', content: 'User management' },
        { value: 'logs', label: '📝 Logs', content: 'System logs and audit trail' }
    ];
</script>

<div class="w-full max-w-5xl mx-auto p-8">
    <h1 class="text-2xl font-bold mb-6">ScrollableTabs Example</h1>

    <ScrollableTabs.Root bind:value={activeTab}>
        <ScrollableTabs.List>
            <!-- Pinned tabs on the left -->
            <ScrollableTabs.PinnedSection>
                <ScrollableTabs.PinnedTrigger value="dashboard">📊 Dashboard</ScrollableTabs.PinnedTrigger>
                <ScrollableTabs.PinnedTrigger value="quick-actions">⚡ Quick Actions</ScrollableTabs.PinnedTrigger>
            </ScrollableTabs.PinnedSection>

            <!-- Scrollable tabs in the middle -->
            <ScrollableTabs.ScrollableSection>
                {#each tabs as tab}
                    <ScrollableTabs.Trigger value={tab.value}>
                        {tab.label}
                    </ScrollableTabs.Trigger>
                {/each}
            </ScrollableTabs.ScrollableSection>

            <!-- Add button on the right -->
            <ScrollableTabs.AddButton onclick={handleAddTab} />
        </ScrollableTabs.List>

        <!-- Tab content -->
        <ScrollableTabs.Content value="dashboard">
            <div class="p-6 bg-white border rounded-md min-h-[300px]">
                <h2 class="text-xl font-semibold mb-2">📊 Dashboard Widget</h2>
                <p class="text-muted-foreground">This is the main dashboard. It contains key metrics and quick access to important features.</p>
            </div>
        </ScrollableTabs.Content>

        <ScrollableTabs.Content value="quick-actions">
            <div class="p-6 bg-white border rounded-md min-h-[300px]">
                <h2 class="text-xl font-semibold mb-2">⚡ Quick Actions</h2>
                <p class="text-muted-foreground">Access frequently used actions and shortcuts here.</p>
            </div>
        </ScrollableTabs.Content>

        {#each tabs as tab}
            <ScrollableTabs.Content value={tab.value}>
                <div class="p-6 bg-white border rounded-md min-h-[300px]">
                    <h2 class="text-xl font-semibold mb-2">{tab.label}</h2>
                    <p class="text-muted-foreground">
                        {tab.content}
                    </p>
                </div>
            </ScrollableTabs.Content>
        {/each}
    </ScrollableTabs.Root>

    <!-- Display current active tab -->
    <div class="mt-6 p-4 bg-muted rounded-md">
        <p class="text-sm">
            <strong>Active Tab:</strong>
            {activeTab}
        </p>
    </div>
</div>
