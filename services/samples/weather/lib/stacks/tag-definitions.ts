import type { TagDefinitionForCreateOrUpdate, TagDefinitionWidgetWebComponentForCreateOrUpdate } from 'pika-shared/types/chatbot/chatbot-types';

// Weather Favorite Cities (Default)
const weatherSpotlight1: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'favorite-cities',
    scope: 'weather',
    shortTagEx: '<weather.favorite-cities></weather.favorite-cities>',
    tagTitle: 'My Favorite Cities',
    description: 'Displays saved favorite cities with quick access to their weather',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: false,
    renderingContexts: {
        spotlight: {
            enabled: true,
            isDefault: true
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'favorite-cities',
            s3: {
                s3Key: 'wc/weather/hello-world.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    },
    componentAgentInstructionsMd: {
        getCurrentWeather: `You are a weather data assistant. When invoked, you should:

1. Extract the location(s) from the user's request
2. Always use the appropriate tool(s) to fetch real-time data.  Do not make up weather information.
3. Return the weather information in a structured format

<output_schema>
interface WeatherDataResponse {
    locations: WeatherData[];
}

interface WeatherData {
    // The location name
    location: string;
    // Longitude
    lon: number;
    // Latitude
    lat: number;
    // Temperature in Fahrenheit
    tempF: number;
    // Temperature in Celsius
    tempC: number;
    // ISO 8601 timestamp
    timestamp: string;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`
    }
};

// Weather Alerts
const weatherSpotlight2: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'weather-alerts',
    scope: 'weather',
    shortTagEx: '<weather.weather-alerts></weather.weather-alerts>',
    tagTitle: 'Weather Alerts',
    description: 'Shows active weather alerts and warnings for watched locations',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: false,
    renderingContexts: {
        spotlight: {
            enabled: true,
            isDefault: false
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'weather-alerts',
            s3: {
                s3Key: 'wc/weather/hello-world.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    },
    componentAgentInstructionsMd: {
        checkAlerts: `You are a weather alert assistant. When invoked, you should:

1. Extract location(s) from the user's request
2. Check for current weather alerts, warnings, and watches for these locations
3. Return alert information in structured format

Note: If no real alert API is available, return mock data indicating you checked for alerts.

<output_schema>
interface WeatherAlertsResponse {
    locations: LocationAlerts[];
}

interface LocationAlerts {
    // The location name
    location: string;
    // Array of alerts for this location
    alerts: WeatherAlert[];
}

interface WeatherAlert {
    // Alert severity: 'severe', 'warning', 'watch', 'advisory'
    severity: string;
    // Alert type (e.g., 'Thunderstorm Warning', 'Flood Watch')
    type: string;
    // Brief description
    description: string;
    // ISO 8601 timestamp when alert was issued
    issuedAt: string;
    // ISO 8601 timestamp when alert expires
    expiresAt: string;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`
    }
};

// Temperature Trend
const weatherSpotlightFixed: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'temperature-trend',
    scope: 'weather',
    shortTagEx: '<weather.temperature-trend></weather.temperature-trend>',
    tagTitle: 'Temperature Trend (24h)',
    description: 'Mini chart showing temperature trend over the last 24 hours',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: false,
    renderingContexts: {
        spotlight: {
            enabled: true,
            isDefault: false
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'temperature-trend',
            s3: {
                s3Key: 'wc/weather/hello-world.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    },
    componentAgentInstructionsMd: {
        get24hTrend: `You are a weather trend assistant. When invoked, you should:

1. Extract the location from the user's request
2. Provide temperature data points for the last 24 hours (or simulate if unavailable)
3. Return data in structured format suitable for charting

<output_schema>
interface TemperatureTrendResponse {
    location: string;
    // Array of temperature readings over 24 hours
    dataPoints: TemperatureDataPoint[];
    // High temp in the period (Fahrenheit)
    highF: number;
    // Low temp in the period (Fahrenheit)
    lowF: number;
}

interface TemperatureDataPoint {
    // ISO 8601 timestamp
    timestamp: string;
    // Temperature in Fahrenheit
    tempF: number;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`
    }
};

// Full Forecast (Canvas)
const weatherCanvas: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'full-forecast',
    scope: 'weather',
    shortTagEx: '<weather.full-forecast></weather.full-forecast>',
    tagTitle: 'Full Weather Forecast',
    description: 'Full-screen 5-day weather forecast with detailed information',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: false,
    renderingContexts: {
        canvas: {
            enabled: true
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'full-forecast',
            s3: {
                s3Key: 'wc/weather/hello-world.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    },
    componentAgentInstructionsMd: {
        get5dayForecast: `You are a weather forecast assistant. When invoked, you should:

1. Extract the location from the user's request
2. Use available tools to get 5-day forecast data
3. Return comprehensive forecast information

<output_schema>
interface ForecastResponse {
    location: string;
    // Array of daily forecasts
    forecast: DailyForecast[];
}

interface DailyForecast {
    // ISO 8601 date (YYYY-MM-DD)
    date: string;
    // High temperature (Fahrenheit)
    highF: number;
    // Low temperature (Fahrenheit)
    lowF: number;
    // Weather condition (e.g., 'Sunny', 'Partly Cloudy', 'Rainy')
    condition: string;
    // Precipitation chance (0-100)
    precipChance: number;
    // Brief description
    description: string;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`
    }
};

// City Selector (Dialog)
const weatherDialog: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'city-selector',
    scope: 'weather',
    shortTagEx: '<weather.city-selector></weather.city-selector>',
    tagTitle: 'City Selector',
    description: 'Dialog for selecting and managing favorite cities',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: false,
    renderingContexts: {
        dialog: {
            enabled: true
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'city-selector',
            s3: {
                s3Key: 'wc/weather/hello-world.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    }
};

// Weather Inline Widget
const weatherInline: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'inline',
    scope: 'weather',
    shortTagEx: '<weather.inline></weather.inline>',
    tagTitle: 'Weather Inline Widget',
    description: 'A weather widget for testing inline message rendering',
    canBeGeneratedByLlm: true,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: false,
    renderingContexts: {
        inline: {
            enabled: true
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'hello-world-weather',
            s3: {
                s3Key: 'wc/weather/hello-world.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    },
    llmInstructionsMd: `  - To include a weather inline widget, use the \`<weather.inline></weather.inline>\` tags.
  - This is a test widget for weather-related development and testing purposes.
  - Example: \`<weather.inline>Weather data display</weather.inline>\``
};

// Weather Multi-Context Widget
const weatherMultiContext: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'multi-context',
    scope: 'weather',
    shortTagEx: '<weather.multi-context></weather.multi-context>',
    tagTitle: 'Weather Multi-Context Widget',
    description: 'A weather widget that works in multiple rendering contexts',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: false,
    renderingContexts: {
        spotlight: {
            enabled: true,
            isDefault: false
        },
        canvas: {
            enabled: true
        },
        dialog: {
            enabled: true
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'hello-world',
            s3: {
                s3Key: 'wc/weather/hello-world.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    }
};

// Weather Comparison (Spotlight)
const weatherComparison: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'weather-comparison',
    scope: 'weather',
    shortTagEx: '<weather.weather-comparison></weather.weather-comparison>',
    tagTitle: 'Weather Comparison',
    description: 'Compare weather across multiple cities side-by-side',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: false,
    renderingContexts: {
        spotlight: {
            enabled: true,
            isDefault: false
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'weather-comparison',
            s3: {
                s3Key: 'wc/weather/hello-world.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    },
    componentAgentInstructionsMd: {
        compareCities: `You are a weather comparison assistant. When invoked, you should:

1. Select 4 random major cities from different parts of the world
2. Get current weather data for each city
3. Return the data in a structured format for comparison

<output_schema>
interface ComparisonResponse {
    cities: CityWeather[];
}

interface CityWeather {
    // City name
    location: string;
    // Temperature in Fahrenheit
    tempF: number;
    // Temperature in Celsius
    tempC: number;
    // Optional weather condition
    condition?: string;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`
    }
};

// Weather Fun Fact (Spotlight)
const weatherFunFact: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'weather-fun-fact',
    scope: 'weather',
    shortTagEx: '<weather.weather-fun-fact></weather.weather-fun-fact>',
    tagTitle: 'Weather Fun Fact',
    description: 'Daily weather trivia and interesting facts',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: false,
    renderingContexts: {
        spotlight: {
            enabled: true,
            isDefault: false
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'weather-fun-fact',
            s3: {
                s3Key: 'wc/weather/hello-world.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    },
    componentAgentInstructionsMd: {
        getFunFact: `You are a weather trivia assistant. When invoked, you should:

1. Generate or retrieve an interesting weather-related fun fact or piece of trivia
2. Make it educational and engaging
3. Return it in a structured format

<output_schema>
interface FunFactResponse {
    // The fun fact text
    fact: string;
    // Optional category (e.g., "Historical", "Science", "Records")
    category?: string;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`
    }
};

// Quick Weather Search (Spotlight)
const quickWeatherSearch: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'quick-weather-search',
    scope: 'weather',
    shortTagEx: '<weather.quick-weather-search></weather.quick-weather-search>',
    tagTitle: 'Quick Weather Search',
    description: 'Quick weather lookup without full chat conversation',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: false,
    renderingContexts: {
        spotlight: {
            enabled: true,
            isDefault: false
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'quick-weather-search',
            s3: {
                s3Key: 'wc/weather/hello-world.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    },
    componentAgentInstructionsMd: {
        quickLookup: `You are a quick weather lookup assistant. When invoked, you should:

1. Extract the city name from the user's request
2. Get current weather conditions for that city
3. Return concise, relevant weather information

<output_schema>
interface QuickWeatherResponse {
    // City name
    location: string;
    // Temperature in Fahrenheit
    tempF: number;
    // Temperature in Celsius
    tempC: number;
    // Current weather condition
    condition: string;
    // Optional: humidity percentage
    humidity?: number;
    // Optional: wind speed in mph
    windSpeed?: number;
}
</output_schema>

{{typescript-backed-output-formatting-requirements}}`
    }
};

// Export all tag definitions
export const weatherTagDefinitions: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate>[] = [
    weatherSpotlight1,
    weatherSpotlight2,
    weatherSpotlightFixed,
    weatherCanvas,
    weatherDialog,
    weatherInline,
    weatherMultiContext,
    weatherComparison,
    weatherFunFact,
    quickWeatherSearch
];
