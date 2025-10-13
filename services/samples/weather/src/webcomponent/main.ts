// Import global styles
import './app.css';

// Import web components
import './lib/hello-world.svelte';
import './lib/widgets/favorite-cities.svelte';
import './lib/widgets/weather-alerts.svelte';
import './lib/widgets/temperature-trend.svelte';
import './lib/widgets/full-forecast.svelte';
import './lib/widgets/city-selector.svelte';
import './lib/widgets/weather-comparison.svelte';
import './lib/widgets/weather-fun-fact.svelte';
import './lib/widgets/quick-weather-search.svelte';

// Export for use in other applications
export { default as HelloWorld } from './lib/hello-world.svelte';
export { default as FavoriteCities } from './lib/widgets/favorite-cities.svelte';
export { default as WeatherAlerts } from './lib/widgets/weather-alerts.svelte';
export { default as TemperatureTrend } from './lib/widgets/temperature-trend.svelte';
export { default as FullForecast } from './lib/widgets/full-forecast.svelte';
export { default as CitySelector } from './lib/widgets/city-selector.svelte';
export { default as WeatherComparison } from './lib/widgets/weather-comparison.svelte';
export { default as WeatherFunFact } from './lib/widgets/weather-fun-fact.svelte';
export { default as QuickWeatherSearch } from './lib/widgets/quick-weather-search.svelte';
