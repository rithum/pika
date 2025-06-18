import {
    getWeatherForecast,
    getCurrentWeather,
    getHistoricalWeather,
    getAirQuality,
    getMarineForecast,
    getClimateForecast,
    getGeocoding,
    callOpenMateoApi
} from '../src/lambda/weather/openmateo-apis';

import {
    GetWeatherForecastParams,
    GetCurrentWeatherParams,
    GetHistoricalWeatherParams,
    GetAirQualityParams,
    GetMarineForecastParams,
    GetClimateForecastParams,
    GetGeocodingParams
} from '../src/lambda/weather/types';

import { SessionData } from '@pika/shared/types/chatbot/chatbot-types';

// Test coordinates for New York City
const TEST_COORDINATES = {
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York'
};

// Mock session data for testing - using correct SessionData interface
const mockSessionData: SessionData = {
    sessionId: 'test-session-id',
    companyId: 'test-company-id',
    companyType: 'retailer',
    date: new Date().toISOString(),
    agentId: 'test-agent-id'
};

// Increase timeout for integration tests since they hit real APIs
jest.setTimeout(30000);

describe('Open-Meteo API Integration Tests', () => {
    describe('getWeatherForecast', () => {
        it('should fetch weather forecast with basic parameters', async () => {
            const params: GetWeatherForecastParams = {
                latitude: TEST_COORDINATES.latitude,
                longitude: TEST_COORDINATES.longitude,
                timezone: TEST_COORDINATES.timezone
            };

            const result = await getWeatherForecast(params);

            expect(result).toBeDefined();
            expect(result.latitude).toBeCloseTo(TEST_COORDINATES.latitude, 1);
            expect(result.longitude).toBeCloseTo(TEST_COORDINATES.longitude, 1);
            expect(result.timezone).toBe(TEST_COORDINATES.timezone);
        });

        it('should fetch weather forecast with hourly and daily parameters', async () => {
            const params: GetWeatherForecastParams = {
                latitude: TEST_COORDINATES.latitude,
                longitude: TEST_COORDINATES.longitude,
                timezone: TEST_COORDINATES.timezone,
                hourly: ['temperature_2m', 'precipitation', 'wind_speed_10m'],
                daily: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum']
            };

            const result = await getWeatherForecast(params);

            expect(result).toBeDefined();
            expect(result.hourly).toBeDefined();
            expect(result.daily).toBeDefined();
            expect(result.hourly.temperature_2m).toBeDefined();
            expect(result.daily.temperature_2m_max).toBeDefined();
        });

        it('should fetch weather forecast with date range', async () => {
            const startDate = '2024-01-01';
            const endDate = '2024-01-07';

            const params: GetWeatherForecastParams = {
                latitude: TEST_COORDINATES.latitude,
                longitude: TEST_COORDINATES.longitude,
                timezone: TEST_COORDINATES.timezone,
                startDate,
                endDate,
                daily: ['temperature_2m_max', 'temperature_2m_min']
            };

            const result = await getWeatherForecast(params);

            expect(result).toBeDefined();
            expect(result.daily).toBeDefined();
            expect(Array.isArray(result.daily.time)).toBe(true);
            expect(result.daily.time.length).toBeGreaterThan(0);
        });
    });

    describe('getCurrentWeather', () => {
        it('should fetch current weather conditions', async () => {
            const params: GetCurrentWeatherParams = {
                latitude: TEST_COORDINATES.latitude,
                longitude: TEST_COORDINATES.longitude,
                timezone: TEST_COORDINATES.timezone
            };

            const result = await getCurrentWeather(params, mockSessionData.agentId, 'test-bucket', 'us-east-1', mockSessionData.sessionId);

            expect(result).toBeDefined();
            expect(result.latitude).toBeCloseTo(TEST_COORDINATES.latitude, 1);
            expect(result.longitude).toBeCloseTo(TEST_COORDINATES.longitude, 1);
            expect(result.current).toBeDefined();
            expect(result.current.temperature_2m).toBeDefined();
            expect(result.current.weather_code).toBeDefined();
        });
    });

    describe('getHistoricalWeather', () => {
        it('should fetch historical weather data', async () => {
            const params: GetHistoricalWeatherParams = {
                latitude: TEST_COORDINATES.latitude,
                longitude: TEST_COORDINATES.longitude,
                startDate: '2023-01-01',
                endDate: '2023-01-07',
                timezone: TEST_COORDINATES.timezone,
                daily: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum']
            };

            const result = await getHistoricalWeather(params);

            expect(result).toBeDefined();
            expect(result.latitude).toBeCloseTo(TEST_COORDINATES.latitude, 1);
            expect(result.longitude).toBeCloseTo(TEST_COORDINATES.longitude, 1);
            expect(result.daily).toBeDefined();
            expect(result.daily.time).toBeDefined();
            expect(result.daily.temperature_2m_max).toBeDefined();
        });

        it('should fetch historical weather with hourly data', async () => {
            const params: GetHistoricalWeatherParams = {
                latitude: TEST_COORDINATES.latitude,
                longitude: TEST_COORDINATES.longitude,
                startDate: '2023-12-01',
                endDate: '2023-12-02',
                timezone: TEST_COORDINATES.timezone,
                hourly: ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m']
            };

            const result = await getHistoricalWeather(params);

            expect(result).toBeDefined();
            expect(result.hourly).toBeDefined();
            expect(result.hourly.temperature_2m).toBeDefined();
            expect(result.hourly.relative_humidity_2m).toBeDefined();
        });
    });

    describe('getAirQuality', () => {
        it('should fetch air quality data', async () => {
            const params: GetAirQualityParams = {
                latitude: TEST_COORDINATES.latitude,
                longitude: TEST_COORDINATES.longitude,
                timezone: TEST_COORDINATES.timezone,
                hourly: ['pm10', 'pm2_5', 'ozone']
            };

            const result = await getAirQuality(params);

            expect(result).toBeDefined();
            expect(result.latitude).toBeCloseTo(TEST_COORDINATES.latitude, 1);
            expect(result.longitude).toBeCloseTo(TEST_COORDINATES.longitude, 1);
            // Air quality might not have data for all locations, so we just check structure
            if (result.hourly) {
                expect(result.hourly.time).toBeDefined();
            }
        });
    });

    describe('getMarineForecast', () => {
        it('should fetch marine forecast data for coastal location', async () => {
            // Use coordinates closer to the ocean for marine data
            const coastalCoords = {
                latitude: 40.6892,
                longitude: -74.0445 // Near NYC harbor
            };

            const params: GetMarineForecastParams = {
                latitude: coastalCoords.latitude,
                longitude: coastalCoords.longitude,
                timezone: TEST_COORDINATES.timezone,
                hourly: ['wave_height', 'wave_direction', 'wave_period']
            };

            const result = await getMarineForecast(params);

            expect(result).toBeDefined();
            // Marine APIs may adjust coordinates to nearest water location
            expect(result.latitude).toBeCloseTo(coastalCoords.latitude, 0);
            expect(result.longitude).toBeCloseTo(coastalCoords.longitude, 0);
            // Marine data might not be available for all locations
            if (result.hourly) {
                expect(result.hourly.time).toBeDefined();
            }
        });
    });

    describe('getClimateForecast', () => {
        it('should fetch climate forecast data', async () => {
            const params: GetClimateForecastParams = {
                latitude: TEST_COORDINATES.latitude,
                longitude: TEST_COORDINATES.longitude,
                startDate: '2030-01-01',
                endDate: '2030-12-31',
                timezone: TEST_COORDINATES.timezone,
                daily: ['temperature_2m_mean', 'precipitation_sum']
            };

            const result = await getClimateForecast(params);

            expect(result).toBeDefined();
            expect(result.latitude).toBeCloseTo(TEST_COORDINATES.latitude, 1);
            expect(result.longitude).toBeCloseTo(TEST_COORDINATES.longitude, 1);
            if (result.daily) {
                expect(result.daily.time).toBeDefined();
            }
        });
    });

    describe('getGeocoding', () => {
        it('should fetch geocoding results for city name', async () => {
            const params: GetGeocodingParams = {
                name: 'New York',
                count: 5
            };

            const result = await getGeocoding(params);

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);

            const firstResult = result[0];
            expect(firstResult.name).toBeDefined();
            expect(firstResult.latitude).toBeDefined();
            expect(firstResult.longitude).toBeDefined();
            expect(firstResult.country).toBeDefined();
            expect(firstResult.timezone).toBeDefined();
        });

        it('should return empty array for invalid location', async () => {
            const params: GetGeocodingParams = {
                name: 'InvalidLocationThatDoesNotExist12345',
                count: 1
            };

            const result = await getGeocoding(params);

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });
    });

    describe('callOpenMateoApi', () => {
        it('should call getWeatherForecast through the main API function', async () => {
            const params = {
                latitude: TEST_COORDINATES.latitude,
                longitude: TEST_COORDINATES.longitude,
                timezone: TEST_COORDINATES.timezone,
                daily: ['temperature_2m_max', 'temperature_2m_min']
            };

            const result = await callOpenMateoApi('getWeatherForecast', params, mockSessionData, 'test-bucket', 'us-east-1');

            expect(result).toBeDefined();
            expect(result.latitude).toBeCloseTo(TEST_COORDINATES.latitude, 1);
            expect(result.longitude).toBeCloseTo(TEST_COORDINATES.longitude, 1);
            expect(result.daily).toBeDefined();
        });

        it('should call getCurrentWeather through the main API function', async () => {
            const params = {
                latitude: TEST_COORDINATES.latitude,
                longitude: TEST_COORDINATES.longitude,
                timezone: TEST_COORDINATES.timezone
            };

            const result = await callOpenMateoApi('getCurrentWeather', params, mockSessionData, 'test-bucket', 'us-east-1');

            expect(result).toBeDefined();
            expect(result.current).toBeDefined();
            expect(result.current.temperature_2m).toBeDefined();
        });

        it('should call getGeocoding through the main API function', async () => {
            const params = {
                name: 'London',
                count: 3
            };

            const result = await callOpenMateoApi('getGeocoding', params, mockSessionData, 'test-bucket', 'us-east-1');

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].name).toContain('London');
        });

        it('should throw error for unknown function name', async () => {
            const params = {
                latitude: TEST_COORDINATES.latitude,
                longitude: TEST_COORDINATES.longitude
            };

            await expect(callOpenMateoApi('unknownFunction', params, mockSessionData, 'test-bucket', 'us-east-1')).rejects.toThrow('Unknown function name: unknownFunction');
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid coordinates gracefully', async () => {
            const params: GetCurrentWeatherParams = {
                latitude: 999, // Invalid latitude
                longitude: 999, // Invalid longitude
                timezone: 'UTC'
            };

            await expect(getCurrentWeather(params, mockSessionData.agentId, 'test-bucket', 'us-east-1', mockSessionData.sessionId)).rejects.toThrow('Network error');
        });

        it('should handle network errors gracefully', async () => {
            // This test might be flaky depending on network conditions
            // We're testing that the function properly propagates network errors
            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

            const params: GetCurrentWeatherParams = {
                latitude: TEST_COORDINATES.latitude,
                longitude: TEST_COORDINATES.longitude,
                timezone: TEST_COORDINATES.timezone
            };

            await expect(getCurrentWeather(params, mockSessionData.agentId, 'test-bucket', 'us-east-1', mockSessionData.sessionId)).rejects.toThrow('Network error');

            global.fetch = originalFetch;
        });
    });
});
