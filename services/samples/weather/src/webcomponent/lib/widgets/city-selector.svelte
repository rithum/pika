<svelte:options customElement="city-selector" />

<script lang="ts">
    import X from '$icons/lucide/x';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import Input from 'pika-ux/shadcn/input/input.svelte';

    let searchQuery = $state('');
    let selectedCities: string[] = $state([]);
    let initialized = $state(false);
    let context = $state<PikaWCContext>() as PikaWCContext;

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    async function init() {
        // $host() is svelte's way to get the host element of the web component
        context = await getPikaContext($host());
        initialized = true;

        // Register widget metadata
        const metadata = context.chatAppState.getWidgetMetadataAPI('weather', 'city-selector', context.instanceId, context.renderingContext);

        metadata.setMetadata({
            title: 'Select Favorite Cities',
            actions: [
                {
                    id: 'cancel',
                    title: 'Cancel',
                    // x icon svg
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
                    callback: () => {
                        context.chatAppState.closeDialog();
                    }
                },
                {
                    id: 'save',
                    title: 'Save Changes',
                    // check icon svg
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-icon lucide-check"><path d="M20 6 9 17l-5-5"/></svg>',
                    primary: true,
                    callback: async () => {
                        await saveCities();
                    }
                }
            ]
        });
    }

    const popularCities = ['San Francisco', 'New York', 'Los Angeles', 'Chicago', 'Miami', 'Seattle', 'Boston', 'Austin', 'London', 'Paris', 'Tokyo', 'Sydney'];

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
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'favorite-cities');
        await userWidgetData.setValue('cities', selectedCities);
        context.chatAppState.showToast('Cities saved!', { type: 'success' });
        context.chatAppState.closeDialog();
    }
</script>

<div class="city-selector">
    <header>
        <h2 class="text-lg font-semibold m-0">Select Cities</h2>
        <Button variant="ghost" size="icon" onclick={() => context.chatAppState.closeDialog()} class="h-8 w-8">
            <X class="h-4 w-4" />
        </Button>
    </header>

    <Input type="text" bind:value={searchQuery} placeholder="Search cities..." class="mb-4" />

    <div class="cities-grid">
        {#each filteredCities() as city}
            <Button variant={selectedCities.includes(city) ? 'default' : 'outline'} size="sm" onclick={() => toggleCity(city)} class="relative justify-start h-auto py-2">
                {city}
                {#if selectedCities.includes(city)}
                    <span class="check">✓</span>
                {/if}
            </Button>
        {/each}
    </div>

    <footer>
        <Button onclick={saveCities} disabled={selectedCities.length === 0} class="w-full">
            Save {selectedCities.length > 0 ? `(${selectedCities.length})` : ''}
        </Button>
    </footer>
</div>

<style>
    .city-selector {
        background: white;
        border-radius: 12px;
        padding: 1.5rem;
        max-width: 600px;
        margin: 0 auto;
    }

    header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .cities-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 0.5rem;
        margin-bottom: 1rem;
        max-height: 300px;
        overflow-y: auto;
    }

    .check {
        position: absolute;
        top: 0.25rem;
        right: 0.25rem;
        font-size: 0.875rem;
    }

    footer {
        display: flex;
        justify-content: flex-end;
    }
</style>
