import type { Handler, Context } from 'aws-lambda';

/**
 * Comprehensive Weather Lambda handler for Bedrock Agent integration
 * Based on the CDK weather service example with full functionality
 */

interface WeatherEvent {
    sessionId: string;
    inputText: string;
    actionGroup: string;
    function: string;
    parameters: {
        latitude?: number;
        longitude?: number;
        startDate?: string;
        endDate?: string;
        name?: string;
        count?: number;
        timezone?: string;
        includeDownloadLink?: boolean;
        jsonParams?: string;
    };
    sessionAttributes?: Record<string, any>;
    messageVersion?: string;
}

// Mock weather service - in production, you'd call real APIs like OpenMeteo
class WeatherService {
    static getCurrentWeather(latitude: number, longitude: number, timezone?: string, includeDownloadLink?: boolean) {
        const temperature = Math.round(15 + Math.random() * 20); // 15-35°C
        const conditions = ['sunny', 'partly cloudy', 'cloudy', 'light rain', 'rain'][Math.floor(Math.random() * 5)];
        const humidity = Math.round(40 + Math.random() * 40); // 40-80%
        const windSpeed = Math.round(Math.random() * 25); // 0-25 km/h
        const pressure = Math.round(990 + Math.random() * 40); // 990-1030 hPa

        let response = `Current weather at ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°:
- Temperature: ${temperature}°C
- Conditions: ${conditions}
- Humidity: ${humidity}%
- Wind Speed: ${windSpeed} km/h
- Atmospheric Pressure: ${pressure} hPa`;

        if (timezone) {
            response += `\n- Timezone: ${timezone}`;
        }

        if (includeDownloadLink) {
            response += `\n- Data Download: [CSV format available on request]`;
        }

        // Add weather advice
        if (conditions.includes('rain')) {
            response += '\n\nWeather Advice: Bring an umbrella and consider waterproof clothing.';
        } else if (temperature > 30) {
            response += '\n\nWeather Advice: Very warm day - stay hydrated and seek shade during midday.';
        } else if (temperature < 5) {
            response += '\n\nWeather Advice: Very cold - dress in layers and protect exposed skin.';
        } else {
            response += '\n\nWeather Advice: Pleasant conditions for outdoor activities.';
        }

        return response;
    }

    static getWeatherForecast(latitude: number, longitude: number, startDate?: string, endDate?: string, jsonParams?: string) {
        // Parse optional parameters
        let parsedParams: any = {};
        if (jsonParams) {
            try {
                parsedParams = JSON.parse(jsonParams);
            } catch (e) {
                console.warn('Failed to parse jsonParams:', e);
            }
        }

        // Calculate date range
        const start = startDate ? new Date(startDate) : new Date();
        const end = endDate ? new Date(endDate) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const limitedDays = Math.max(1, Math.min(14, days)); // 1-14 days

        const forecast = [];
        for (let i = 0; i < limitedDays; i++) {
            const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
            forecast.push({
                date: date.toISOString().split('T')[0],
                high: Math.round(18 + Math.random() * 15), // 18-33°C
                low: Math.round(5 + Math.random() * 10), // 5-15°C
                conditions: ['sunny', 'partly cloudy', 'cloudy', 'light rain', 'rain', 'thunderstorms'][Math.floor(Math.random() * 6)],
                precipitationChance: Math.round(Math.random() * 100), // 0-100%
                windSpeed: Math.round(Math.random() * 30) // 0-30 km/h
            });
        }

        let response = `${limitedDays}-day weather forecast for ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°:\n\n`;

        response += forecast
            .map(
                (day) =>
                    `${day.date}: ${day.conditions}
  High: ${day.high}°C, Low: ${day.low}°C
  Precipitation chance: ${day.precipitationChance}%
  Wind: ${day.windSpeed} km/h`
            )
            .join('\n\n');

        // Add summary
        const rainyDays = forecast.filter((d) => d.conditions.includes('rain') || d.precipitationChance > 60).length;
        const hotDays = forecast.filter((d) => d.high > 30).length;

        if (rainyDays > 0) {
            response += `\n\nForecast Summary: ${rainyDays} day(s) with rain expected - plan indoor alternatives.`;
        } else if (hotDays > 0) {
            response += `\n\nForecast Summary: ${hotDays} very warm day(s) expected - great for outdoor activities but stay hydrated.`;
        } else {
            response += '\n\nForecast Summary: Generally pleasant weather ahead!';
        }

        return response;
    }

    static getHistoricalWeather(latitude: number, longitude: number, startDate: string, endDate: string, jsonParams?: string) {
        // Parse optional parameters
        let parsedParams: any = {};
        if (jsonParams) {
            try {
                parsedParams = JSON.parse(jsonParams);
            } catch (e) {
                console.warn('Failed to parse jsonParams:', e);
            }
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 1000));

        // Generate mock historical data
        const avgTemp = 20 + Math.round(Math.random() * 10); // 20-30°C average
        const totalPrecipitation = Math.round(Math.random() * 100); // 0-100mm
        const sunnyDays = Math.round(days * (0.4 + Math.random() * 0.4)); // 40-80% sunny days

        return `Historical weather data for ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°
Period: ${startDate} to ${endDate} (${days} days)

Summary:
- Average Temperature: ${avgTemp}°C
- Total Precipitation: ${totalPrecipitation}mm
- Sunny Days: ${sunnyDays} out of ${days} days (${Math.round((sunnyDays / days) * 100)}%)
- Weather Pattern: ${totalPrecipitation > 50 ? 'Wet period' : totalPrecipitation > 20 ? 'Moderate precipitation' : 'Dry period'}

Historical Context: This data shows ${avgTemp > 25 ? 'warmer than average' : avgTemp < 15 ? 'cooler than average' : 'typical'} temperatures for this location and time period.`;
    }

    static getAirQuality(latitude: number, longitude: number, startDate?: string, endDate?: string, jsonParams?: string) {
        // Generate mock air quality data
        const aqi = Math.round(50 + Math.random() * 100); // 50-150 AQI
        const pm25 = Math.round(10 + Math.random() * 40); // 10-50 μg/m³
        const pm10 = Math.round(pm25 + Math.random() * 30); // Usually higher than PM2.5
        const no2 = Math.round(20 + Math.random() * 60); // 20-80 μg/m³
        const o3 = Math.round(60 + Math.random() * 120); // 60-180 μg/m³

        let aqiCategory = '';
        let advice = '';

        if (aqi <= 50) {
            aqiCategory = 'Good';
            advice = 'Air quality is satisfactory for most people.';
        } else if (aqi <= 100) {
            aqiCategory = 'Moderate';
            advice = 'Sensitive individuals should consider limiting prolonged outdoor activities.';
        } else if (aqi <= 150) {
            aqiCategory = 'Unhealthy for Sensitive Groups';
            advice = 'Children, elderly, and people with respiratory conditions should limit outdoor activities.';
        } else {
            aqiCategory = 'Unhealthy';
            advice = 'Everyone should limit outdoor activities, especially prolonged exertion.';
        }

        return `Air Quality for ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°:

Overall Air Quality Index (AQI): ${aqi} (${aqiCategory})

Pollutant Levels:
- PM2.5: ${pm25} μg/m³
- PM10: ${pm10} μg/m³
- NO2: ${no2} μg/m³
- Ozone: ${o3} μg/m³

Health Advisory: ${advice}

${startDate ? `Period: ${startDate} to ${endDate || 'current'}` : 'Current conditions'}`;
    }

    static getGeocoding(name: string, count: number = 5) {
        // Mock geocoding results - in production, use a real geocoding service
        const mockCities = [
            { name: 'San Francisco, CA, USA', latitude: 37.7749, longitude: -122.4194, country: 'United States' },
            { name: 'New York, NY, USA', latitude: 40.7128, longitude: -74.006, country: 'United States' },
            { name: 'London, England, UK', latitude: 51.5074, longitude: -0.1278, country: 'United Kingdom' },
            { name: 'Tokyo, Japan', latitude: 35.6762, longitude: 139.6503, country: 'Japan' },
            { name: 'Sydney, NSW, Australia', latitude: -33.8688, longitude: 151.2093, country: 'Australia' },
            { name: 'Paris, France', latitude: 48.8566, longitude: 2.3522, country: 'France' },
            { name: 'Berlin, Germany', latitude: 52.52, longitude: 13.405, country: 'Germany' },
            { name: 'Dubai, UAE', latitude: 25.2048, longitude: 55.2708, country: 'United Arab Emirates' },
            { name: 'Mumbai, India', latitude: 19.076, longitude: 72.8777, country: 'India' },
            { name: 'São Paulo, Brazil', latitude: -23.5505, longitude: -46.6333, country: 'Brazil' }
        ];

        const results = mockCities
            .filter((city) => city.name.toLowerCase().includes(name.toLowerCase()) || city.country.toLowerCase().includes(name.toLowerCase()))
            .slice(0, count);

        return results;
    }
}

export const handler: Handler = async (event: WeatherEvent, context: Context) => {
    console.log('Weather handler received:', JSON.stringify(event, null, 2));

    try {
        const { function: functionName, parameters, actionGroup, messageVersion } = event;

        if (!functionName) {
            throw new Error('Missing function name in Bedrock Agent action lambda');
        }

        let responseText: string;

        switch (functionName) {
            case 'getCurrentWeather': {
                const { latitude, longitude, timezone, includeDownloadLink } = parameters;

                if (latitude === undefined || longitude === undefined) {
                    responseText = 'Please provide both latitude and longitude coordinates to get current weather.';
                } else {
                    responseText = WeatherService.getCurrentWeather(latitude, longitude, timezone, includeDownloadLink);
                }
                break;
            }

            case 'getWeatherForecast': {
                const { latitude, longitude, startDate, endDate, jsonParams } = parameters;

                if (latitude === undefined || longitude === undefined) {
                    responseText = 'Please provide both latitude and longitude coordinates for the weather forecast.';
                } else {
                    responseText = WeatherService.getWeatherForecast(latitude, longitude, startDate, endDate, jsonParams);
                }
                break;
            }

            case 'getHistoricalWeather': {
                const { latitude, longitude, startDate, endDate, jsonParams } = parameters;

                if (latitude === undefined || longitude === undefined || !startDate || !endDate) {
                    responseText = 'Please provide latitude, longitude, startDate, and endDate for historical weather data.';
                } else {
                    responseText = WeatherService.getHistoricalWeather(latitude, longitude, startDate, endDate, jsonParams);
                }
                break;
            }

            case 'getAirQuality': {
                const { latitude, longitude, startDate, endDate, jsonParams } = parameters;

                if (latitude === undefined || longitude === undefined) {
                    responseText = 'Please provide both latitude and longitude coordinates for air quality data.';
                } else {
                    responseText = WeatherService.getAirQuality(latitude, longitude, startDate, endDate, jsonParams);
                }
                break;
            }

            case 'getGeocoding': {
                const { name, count } = parameters;

                if (!name) {
                    responseText = 'Please provide a location name to search for coordinates.';
                } else {
                    const results = WeatherService.getGeocoding(name, count);

                    if (results.length === 0) {
                        responseText = `No coordinates found for "${name}". Try searching for major cities or countries.`;
                    } else {
                        responseText = `Coordinates found for "${name}":\n\n` + results.map((result) => `${result.name}: ${result.latitude}°, ${result.longitude}°`).join('\n');
                    }
                }
                break;
            }

            default:
                responseText = `Unknown function: ${functionName}. Available functions: getCurrentWeather, getWeatherForecast, getHistoricalWeather, getAirQuality, getGeocoding`;
        }

        return {
            response: {
                actionGroup,
                function: functionName,
                functionResponse: {
                    responseBody: {
                        TEXT: {
                            body: responseText
                        }
                    }
                }
            }
        };
    } catch (error) {
        console.error('Error in weather handler:', error);

        return {
            response: {
                actionGroup: event.actionGroup,
                function: event.function,
                functionResponse: {
                    responseBody: {
                        TEXT: {
                            body: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
                        }
                    }
                }
            }
        };
    }
};
