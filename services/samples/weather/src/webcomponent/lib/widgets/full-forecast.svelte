<svelte:options customElement="full-forecast" />

<script lang="ts">
    import MapPin from '$icons/lucide/map-pin';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';

    interface DayForecast {
        day: string;
        date: string;
        high: number;
        low: number;
        conditions: string;
        icon: string;
    }

    let forecast: DayForecast[] = $state([]);
    let loading = $state(true);
    let selectedCity = $state('San Francisco');
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
        const metadata = context.chatAppState.getWidgetMetadataAPI('weather', 'full-forecast', context.instanceId, context.renderingContext);

        metadata.setMetadata({
            title: `5-Day Forecast - ${selectedCity}`,
            actions: [
                {
                    id: 'change-city',
                    title: 'Change City',
                    // map-pin icon svg
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-icon lucide-map-pin"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
                    callback: () => {
                        const newCity = prompt('Enter city name:', selectedCity);
                        if (newCity) {
                            selectedCity = newCity;
                            metadata.updateTitle(`5-Day Forecast - ${selectedCity}`);
                            loadForecast();
                        }
                    }
                }
            ]
        });

        loadForecast();
    }

    async function loadForecast() {
        loading = true;
        // Simulate API call
        setTimeout(() => {
            forecast = [
                { day: 'Monday', date: 'Oct 14', high: 75, low: 58, conditions: 'Sunny', icon: '☀️' },
                { day: 'Tuesday', date: 'Oct 15', high: 73, low: 56, conditions: 'Partly Cloudy', icon: '⛅' },
                { day: 'Wednesday', date: 'Oct 16', high: 70, low: 55, conditions: 'Cloudy', icon: '☁️' },
                { day: 'Thursday', date: 'Oct 17', high: 68, low: 54, conditions: 'Rain', icon: '🌧️' },
                { day: 'Friday', date: 'Oct 18', high: 72, low: 57, conditions: 'Sunny', icon: '☀️' }
            ];
            loading = false;
        }, 500);
    }
</script>

<div class="full-forecast">
    <header class="forecast-header">
        <h2>5-Day Forecast</h2>
        <p class="location">{selectedCity}</p>
    </header>

    {#if loading}
        <p class="loading">Loading forecast...</p>
    {:else}
        <div class="forecast-grid">
            {#each forecast as day}
                <div class="forecast-card">
                    <h3>{day.day}</h3>
                    <p class="date">{day.date}</p>
                    <div class="icon">{day.icon}</div>
                    <div class="temps">
                        <span class="high">{day.high}°</span>
                        <span class="low">{day.low}°</span>
                    </div>
                    <p class="conditions">{day.conditions}</p>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .full-forecast {
        padding: 2rem;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        color: white;
    }

    .forecast-header {
        margin-bottom: 2rem;
    }

    .forecast-header h2 {
        margin: 0;
        font-size: 2rem;
    }

    .location {
        margin: 0.5rem 0 0 0;
        font-size: 1.25rem;
        opacity: 0.9;
    }

    .forecast-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
    }

    .forecast-card {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        padding: 1.5rem;
        text-align: center;
        border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .forecast-card h3 {
        margin: 0 0 0.25rem 0;
        font-size: 1.25rem;
    }

    .date {
        margin: 0 0 1rem 0;
        opacity: 0.8;
        font-size: 0.875rem;
    }

    .icon {
        font-size: 3rem;
        margin: 1rem 0;
    }

    .temps {
        display: flex;
        justify-content: center;
        gap: 1rem;
        margin: 1rem 0;
        font-size: 1.5rem;
        font-weight: bold;
    }

    .high {
        color: #fbbf24;
    }

    .low {
        color: #93c5fd;
    }

    .conditions {
        margin: 0.5rem 0 0 0;
        font-size: 0.875rem;
        opacity: 0.9;
    }

    .loading {
        text-align: center;
        padding: 4rem;
        font-size: 1.25rem;
    }
</style>
