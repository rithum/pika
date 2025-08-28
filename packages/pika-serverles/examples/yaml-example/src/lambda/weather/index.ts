import type { Handler, Context } from 'aws-lambda';

/**
 * Weather Lambda handler for Bedrock Agent integration
 * This demonstrates a simplified weather service based on the CDK weather example
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
    };
    sessionAttributes?: any;
    messageVersion?: string;
}

// Mock weather data - in production, you'd call a real weather API like OpenMeteo
const mockWeatherData = {
    getCurrentWeather: (latitude: number, longitude: number) => ({
        temperature: Math.round(15 + Math.random() * 20), // 15-35°C
        conditions: ['sunny', 'partly cloudy', 'cloudy', 'light rain'][Math.floor(Math.random() * 4)],
        humidity: Math.round(40 + Math.random() * 40), // 40-80%
        windSpeed: Math.round(Math.random() * 20), // 0-20 km/h
        location: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`
    }),

    getWeatherForecast: (latitude: number, longitude: number, days: number = 5) => {
        const forecast: Array<{
            date: string;
            high: number;
            low: number;
            conditions: string;
        }> = [];
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            forecast.push({
                date: date.toISOString().split('T')[0],
                high: Math.round(18 + Math.random() * 15), // 18-33°C
                low: Math.round(8 + Math.random() * 10), // 8-18°C
                conditions: ['sunny', 'partly cloudy', 'cloudy', 'light rain', 'rain'][Math.floor(Math.random() * 5)]
            });
        }
        return forecast;
    },

    getGeocoding: (name: string, count: number = 5) => {
        // Mock geocoding results - in production, use a real geocoding service
        const mockCities = [
            { name: 'San Francisco', latitude: 37.7749, longitude: -122.4194 },
            { name: 'New York', latitude: 40.7128, longitude: -74.006 },
            { name: 'London', latitude: 51.5074, longitude: -0.1278 },
            { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
            { name: 'Sydney', latitude: -33.8688, longitude: 151.2093 }
        ];

        return mockCities.filter((city) => city.name.toLowerCase().includes(name.toLowerCase())).slice(0, count);
    }
};

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
                const { latitude, longitude, timezone } = parameters;

                if (latitude === undefined || longitude === undefined) {
                    responseText = 'Please provide both latitude and longitude coordinates.';
                } else {
                    const weather = mockWeatherData.getCurrentWeather(latitude, longitude);
                    responseText = `Current weather at ${weather.location}:
- Temperature: ${weather.temperature}°C
- Conditions: ${weather.conditions}
- Humidity: ${weather.humidity}%
- Wind Speed: ${weather.windSpeed} km/h
${timezone ? `- Timezone: ${timezone}` : ''}

${
    weather.conditions.includes('rain')
        ? 'You might want to bring an umbrella!'
        : weather.temperature < 10
          ? "It's quite cold, dress warmly!"
          : weather.temperature > 25
            ? "It's warm today, perfect for outdoor activities!"
            : 'Pleasant weather today!'
}`;
                }
                break;
            }

            case 'getWeatherForecast': {
                const { latitude, longitude, startDate, endDate } = parameters;

                if (latitude === undefined || longitude === undefined) {
                    responseText = 'Please provide both latitude and longitude coordinates for the forecast.';
                } else {
                    // Calculate days between startDate and endDate, default to 5 days
                    let days = 5;
                    if (startDate && endDate) {
                        const start = new Date(startDate);
                        const end = new Date(endDate);
                        days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                        days = Math.max(1, Math.min(7, days)); // Limit to 1-7 days
                    }

                    const forecast = mockWeatherData.getWeatherForecast(latitude, longitude, days);
                    responseText = `${days}-day weather forecast for ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°:

${forecast.map((day) => `${day.date}: ${day.conditions}, High ${day.high}°C, Low ${day.low}°C`).join('\n')}

${forecast.some((d) => d.conditions.includes('rain')) ? 'Rain expected in the coming days, plan accordingly.' : 'Generally pleasant weather ahead!'}`;
                }
                break;
            }

            case 'getGeocoding': {
                const { name, count } = parameters;

                if (!name) {
                    responseText = 'Please provide a location name to search for coordinates.';
                } else {
                    const results = mockWeatherData.getGeocoding(name, count);

                    if (results.length === 0) {
                        responseText = `No coordinates found for "${name}". Try searching for major cities like San Francisco, New York, London, Tokyo, or Sydney.`;
                    } else {
                        responseText = `Coordinates for "${name}":\n\n` + results.map((result) => `${result.name}: ${result.latitude}°, ${result.longitude}°`).join('\n');
                    }
                }
                break;
            }

            default:
                responseText = `Unknown function: ${functionName}. Available functions: getCurrentWeather, getWeatherForecast, getGeocoding`;
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
                            body: `Error: ${error.message || 'Unknown error occurred'}`
                        }
                    }
                }
            }
        };
    }
};
