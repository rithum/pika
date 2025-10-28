<svelte:options customElement={{ tag: 'weather-preferences', shadow: 'none' }} />

<script lang="ts">
    import type { IWidgetMetadataAPI, PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import Label from 'pika-ux/shadcn/label/label.svelte';

    let context = $state<PikaWCContext>() as PikaWCContext;
    let initialized = $state(false);
    let widgetMetadataApi = $state<IWidgetMetadataAPI | undefined>();

    let tempUnit = $state<'fahrenheit' | 'celsius'>('fahrenheit');
    let autoRefresh = $state<boolean>(true);
    let showAlerts = $state<boolean>(true);

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    async function init() {
        context = await getPikaContext($host());
        initialized = true;

        // Register widget metadata
        widgetMetadataApi = context.chatAppState.getWidgetMetadataAPI('weather', 'preferences', context.instanceId, context.renderingContext);

        widgetMetadataApi.setMetadata({
            title: 'Weather Preferences',
            iconSvg: await getIconSvg('settings', 'lucide'),
            iconColor: '#6366f1' // Indigo
        });

        // Load saved preferences
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'preferences');
        const savedTempUnit = await userWidgetData.getValue<'fahrenheit' | 'celsius'>('tempUnit');
        const savedAutoRefresh = await userWidgetData.getValue<boolean>('autoRefresh');
        const savedShowAlerts = await userWidgetData.getValue<boolean>('showAlerts');

        if (savedTempUnit) tempUnit = savedTempUnit;
        if (savedAutoRefresh !== undefined) autoRefresh = savedAutoRefresh;
        if (savedShowAlerts !== undefined) showAlerts = savedShowAlerts;
    }

    async function savePreferences() {
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'preferences');
        await userWidgetData.setValue('tempUnit', tempUnit);
        await userWidgetData.setValue('autoRefresh', autoRefresh);
        await userWidgetData.setValue('showAlerts', showAlerts);

        context.appState.showToast('Preferences saved', { type: 'success' });
    }
</script>

<div class="h-full w-full flex flex-col p-4">
    <div class="space-y-6">
        <!-- Temperature Unit -->
        <div class="space-y-3">
            <Label class="text-sm font-medium">Temperature Unit</Label>
            <div class="flex gap-4">
                <Button variant={tempUnit === 'fahrenheit' ? 'default' : 'outline'} size="sm" onclick={() => (tempUnit = 'fahrenheit')}>Fahrenheit (°F)</Button>
                <Button variant={tempUnit === 'celsius' ? 'default' : 'outline'} size="sm" onclick={() => (tempUnit = 'celsius')}>Celsius (°C)</Button>
            </div>
        </div>

        <!-- Auto Refresh -->
        <div class="flex items-center justify-between">
            <div class="space-y-0.5">
                <Label class="text-sm font-medium">Auto Refresh</Label>
                <div class="text-xs text-gray-500">Automatically refresh weather data</div>
            </div>
            <Button variant={autoRefresh ? 'default' : 'outline'} size="sm" onclick={() => (autoRefresh = !autoRefresh)}>
                {autoRefresh ? 'On' : 'Off'}
            </Button>
        </div>

        <!-- Show Alerts -->
        <div class="flex items-center justify-between">
            <div class="space-y-0.5">
                <Label class="text-sm font-medium">Weather Alerts</Label>
                <div class="text-xs text-gray-500">Display severe weather alerts</div>
            </div>
            <Button variant={showAlerts ? 'default' : 'outline'} size="sm" onclick={() => (showAlerts = !showAlerts)}>
                {showAlerts ? 'On' : 'Off'}
            </Button>
        </div>
    </div>

    <!-- Save Button -->
    <div class="mt-6 pt-4 border-t">
        <Button class="w-full" onclick={savePreferences}>Save Preferences</Button>
    </div>

    <!-- Info -->
    <div class="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
        <div class="flex items-start gap-2">
            <span class="text-indigo-600 text-lg">ℹ️</span>
            <div class="text-xs text-indigo-800">
                <div class="font-semibold mb-1">Dynamically Registered Widget</div>
                <div>
                    This widget was registered programmatically at runtime using
                    <code class="bg-indigo-100 px-1 rounded">manuallyRegisterSpotlightWidget()</code>
                    and does not exist in the tag definitions database.
                </div>
            </div>
        </div>
    </div>
</div>
