<svelte:options customElement={{ tag: 'city-selector', shadow: 'none' }} />

<script lang="ts">
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import Input from 'pika-ux/shadcn/input/input.svelte';

    let searchQuery = $state('');
    let selectedCities: string[] = $state([]);
    let initialized = $state(false);
    let context = $state<PikaWCContext>() as PikaWCContext;
    let saving = $state(false);

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    async function init() {
        context = await getPikaContext($host());
        initialized = true;

        // Load currently saved cities
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'favorite-cities');
        const savedCities = await userWidgetData.getValue<string[]>('cities');
        if (savedCities) {
            selectedCities = [...savedCities];
        }

        // Register widget metadata
        const metadata = context.chatAppState.getWidgetMetadataAPI('weather', 'city-selector', context.instanceId, context.renderingContext);

        metadata.setMetadata({
            title: 'Select Favorite Cities',
            iconSvg: await getIconSvg('map-pin', 'lucide'),
            iconColor: '#8b5cf6', // Purple
            actions: [
                {
                    id: 'cancel',
                    title: 'Cancel',
                    iconSvg: await getIconSvg('x', 'lucide'),
                    callback: () => {
                        context.chatAppState.closeDialog();
                    }
                },
                {
                    id: 'save',
                    title: 'Save Changes',
                    iconSvg: await getIconSvg('check', 'lucide'),
                    primary: true,
                    callback: async () => {
                        await saveCities();
                    }
                }
            ]
        });
    }

    const popularCities = [
        'San Francisco',
        'New York',
        'Los Angeles',
        'Chicago',
        'Miami',
        'Seattle',
        'Boston',
        'Austin',
        'London',
        'Paris',
        'Tokyo',
        'Sydney',
        'Singapore',
        'Dubai',
        'Hong Kong',
        'Berlin'
    ];

    const filteredCities = $derived(() => {
        if (!searchQuery) return popularCities;
        return popularCities.filter((city) => city.toLowerCase().includes(searchQuery.toLowerCase()));
    });

    function toggleCity(city: string) {
        if (selectedCities.includes(city)) {
            selectedCities = selectedCities.filter((c) => c !== city);
        } else {
            selectedCities = [...selectedCities, city];
        }
    }

    async function saveCities() {
        if (saving) return;

        saving = true;
        const metadata = context.chatAppState.getWidgetMetadataAPI('weather', 'city-selector', context.instanceId, context.renderingContext);
        metadata.updateAction('save', { disabled: true });

        try {
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'favorite-cities');
            await userWidgetData.setValue('cities', selectedCities);
            context.appState.showToast(`Saved ${selectedCities.length} ${selectedCities.length === 1 ? 'city' : 'cities'}!`, { type: 'success' });
            context.chatAppState.closeDialog();
        } catch (error) {
            context.appState.showToast('Failed to save cities', { type: 'error' });
            metadata.updateAction('save', { disabled: false });
        } finally {
            saving = false;
        }
    }
</script>

<div class="h-full w-full flex flex-col p-6">
    <div class="mb-4">
        <p class="text-sm text-gray-600 mb-3">Choose cities to track in your Favorite Cities widget</p>
        <Input type="text" bind:value={searchQuery} placeholder="Search cities..." class="w-full" />
    </div>

    <div class="flex-1 overflow-auto mb-4">
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {#each filteredCities() as city}
                {@const isSelected = selectedCities.includes(city)}
                <button
                    onclick={() => toggleCity(city)}
                    class="relative py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all {isSelected
                        ? 'bg-purple-100 border-purple-500 text-purple-900'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-purple-300'}"
                >
                    {city}
                    {#if isSelected}
                        <span class="absolute top-1 right-1 text-purple-600 text-xs">✓</span>
                    {/if}
                </button>
            {/each}
        </div>
    </div>

    <div class="flex items-center justify-between pt-3 border-t border-gray-200">
        <div class="text-sm text-gray-600">
            {#if selectedCities.length > 0}
                <span class="font-semibold text-purple-600">{selectedCities.length}</span>
                {selectedCities.length === 1 ? 'city' : 'cities'} selected
            {:else}
                No cities selected
            {/if}
        </div>
    </div>
</div>
