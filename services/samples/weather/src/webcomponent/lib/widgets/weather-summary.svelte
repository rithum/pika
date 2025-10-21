<svelte:options customElement={{ tag: 'weather-summary', shadow: 'none' }} />

<script lang="ts">
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';

    interface WeatherSummaryInput {
        location: string;
        tempF: number;
        tempC: number;
        condition: string;
        humidity?: number;
        windSpeed?: number;
    }

    let weatherData = $state<WeatherSummaryInput | undefined>(undefined);
    let error = $state('');
    let initialized = $state(false);
    let context = $state<PikaWCContext>() as PikaWCContext;

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    async function init() {
        context = await getPikaContext($host());
        initialized = true;

        const data = context.dataForWidget;
        if (!data || typeof data !== 'object') {
            error = 'Invalid data for weather summary';
            return;
        } else if (
            !('location' in data) ||
            typeof data.location !== 'string' ||
            !('tempF' in data) ||
            typeof data.tempF !== 'number' ||
            !('tempC' in data) ||
            typeof data.tempC !== 'number' ||
            !('condition' in data) ||
            typeof data.condition !== 'string'
        ) {
            error = 'Invalid data for weather summary';
            return;
        } else if ('humidity' in data && typeof data.humidity !== 'number') {
            error = 'Invalid data for weather summary';
            return;
        } else if ('windSpeed' in data && typeof data.windSpeed !== 'number') {
            error = 'Invalid data for weather summary';
            return;
        } else {
            weatherData = data as WeatherSummaryInput;
        }
    }

    function getConditionEmoji(condition: string): string {
        const lower = condition.toLowerCase();
        if (lower.includes('sun') || lower.includes('clear')) return '☀️';
        if (lower.includes('cloud')) return '☁️';
        if (lower.includes('rain') || lower.includes('shower')) return '🌧️';
        if (lower.includes('snow')) return '❄️';
        if (lower.includes('storm') || lower.includes('thunder')) return '⛈️';
        return '🌤️';
    }
</script>

<div class="h-full w-full flex flex-col">
    <div class="flex-1 overflow-auto px-3 pt-3 pb-3">
        {#if error}
            <p class="text-center py-6 text-red-500 text-sm">{error}</p>
        {:else if weatherData}
            <div class="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4">
                <div class="flex items-start justify-between mb-3">
                    <div>
                        <h4 class="text-base font-bold text-gray-900 m-0">{weatherData.location}</h4>
                        <p class="text-xs text-gray-500 mt-0.5 m-0">{weatherData.condition}</p>
                    </div>
                    <span class="text-3xl">{getConditionEmoji(weatherData.condition)}</span>
                </div>

                <div class="flex items-baseline gap-2 mb-3">
                    <span class="text-2xl font-bold text-green-700">{Math.round(weatherData.tempF)}°</span>
                    <span class="text-lg text-gray-500">{Math.round(weatherData.tempC)}°C</span>
                </div>

                {#if weatherData.humidity || weatherData.windSpeed}
                    <div class="flex gap-4 text-sm text-gray-600 pt-2 border-t border-green-200">
                        {#if weatherData.humidity}
                            <div class="flex items-center gap-1">
                                <span>💧</span>
                                <span>{weatherData.humidity}%</span>
                            </div>
                        {/if}
                        {#if weatherData.windSpeed}
                            <div class="flex items-center gap-1">
                                <span>💨</span>
                                <span>{weatherData.windSpeed} mph</span>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
