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
    usageMode: 'chat-app',
    status: 'enabled',
    isMock: false,
    dontCacheThis: true,
    renderingContexts: {
        spotlight: {
            enabled: true,
            isDefault: true
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
            customElementName: 'favorite-cities',
            s3: {
                s3Key: 'wc/weather/weather.js.gz'
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
    usageMode: 'chat-app',
    status: 'enabled',
    isMock: false,
    dontCacheThis: true,
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
                s3Key: 'wc/weather/weather.js.gz'
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
    usageMode: 'chat-app',
    status: 'enabled',
    isMock: false,
    dontCacheThis: true,
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
                s3Key: 'wc/weather/weather.js.gz'
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
    usageMode: 'chat-app',
    status: 'enabled',
    isMock: false,
    dontCacheThis: true,
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
                s3Key: 'wc/weather/weather.js.gz'
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
    usageMode: 'chat-app',
    status: 'enabled',
    isMock: false,
    dontCacheThis: true,
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
                s3Key: 'wc/weather/weather.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    }
};

// Weather Inline Widget
const weatherSummary: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'summary',
    scope: 'weather',
    shortTagEx: '<weather.summary></weather.summary>',
    tagTitle: 'Weather Summary',
    description: 'An inline widget that displays the current weather conditions for a given location.',
    canBeGeneratedByLlm: true,
    canBeGeneratedByTool: true,
    usageMode: 'chat-app',
    status: 'enabled',
    isMock: false,
    dontCacheThis: true,
    renderingContexts: {
        inline: {
            enabled: true
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'weather-summary',
            s3: {
                s3Key: 'wc/weather/weather.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: '',
            sizing: {
                inline: {
                    height: 'auto'
                }
            }
        }
    },
    llmInstructionsMd: `  - To include a weather summary, use the \`<weather.summary></weather.summary>\` tags.
  - The content within the tags MUST be exclusively JSON conforming to this type: \`\`\`interface WeatherSummaryInput {location: string;tempF: number;tempC: number;condition: string;humidity?: number;windSpeed?: number}\`\`\`
  - **Example:** \`<weather.summary>{"location": "New York", "tempF": 68, "tempC": 20, "condition": "Sunny", "humidity": 50, "windSpeed": 10}\</weather.summary>\`
  - **Usage:** Include a weather summary whenever you can provide a concise overview of the current weather conditions for a given location.`
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
    usageMode: 'chat-app',
    status: 'enabled',
    isMock: false,
    dontCacheThis: true,
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
                s3Key: 'wc/weather/weather.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    },
    componentAgentInstructionsMd: {
        compareCities: `You are a weather comparison assistant. When invoked, you should:

1. Select 3 random cities from different parts of the world
2. It's important to not return the same cities all the time, there are many many cities in the world so be creative and don't just return the same cities all the time
3. Get current weather data for each city
4. Return the data in a structured format for comparison

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
    usageMode: 'chat-app',
    status: 'enabled',
    isMock: false,
    dontCacheThis: true,
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
                s3Key: 'wc/weather/weather.js.gz'
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
    usageMode: 'chat-app',
    status: 'enabled',
    isMock: false,
    dontCacheThis: true,
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
                s3Key: 'wc/weather/weather.js.gz'
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

// Weather Static Init (Static Context - runs on app load)
const weatherStaticInit: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'static-init',
    scope: 'weather',
    shortTagEx: '<weather.static-init></weather.static-init>',
    tagTitle: 'Weather App Initialization',
    description: 'Static context component that initializes weather app features on load',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    usageMode: 'chat-app',
    status: 'enabled',
    isMock: false,
    dontCacheThis: true,
    renderingContexts: {
        static: {
            enabled: true
            // No shutDownAfterMs - stays active to handle Intent Router commands
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'weather-static-init',
            s3: {
                s3Key: 'wc/weather/weather.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    }
};

// Weather Hero (Hero - welcome banner)
const weatherHero: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'hero',
    scope: 'weather',
    shortTagEx: '<weather.hero></weather.hero>',
    tagTitle: 'Weather Dashboard',
    description: 'Hero welcome banner with quick access to weather features',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    usageMode: 'chat-app',
    status: 'enabled',
    isMock: false,
    dontCacheThis: true,
    renderingContexts: {
        hero: {
            enabled: true,
            // Hero is shown via Intent Router or static widget, not auto-loaded
            sizing: {
                // Content-driven width with constraints
                minWidth: '400px',
                maxWidth: '900px',
                // Height constraints
                minHeight: 100,
                maxHeight: 400
            }
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'weather-hero',
            s3: {
                s3Key: 'wc/weather/weather.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    }
};

// Weather Orchestrator (Static - handles Intent Router commands)
const weatherOrchestrator: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'orchestrator',
    scope: 'weather',
    shortTagEx: '<weather.orchestrator></weather.orchestrator>',
    tagTitle: 'Weather Orchestrator',
    description: 'Handles Intent Router command dispatch for fast weather-related actions',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    usageMode: 'chat-app',
    status: 'enabled',
    isMock: false,
    dontCacheThis: true,
    renderingContexts: {
        static: {
            enabled: true
            // No shutDownAfterMs - stays active indefinitely to handle commands
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'weather-orchestrator',
            s3: {
                s3Key: 'wc/weather/weather.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    },
    // Intent Router Commands - fast routing without Bedrock agent
    intentRouterCommands: [
        {
            commandId: 'show_forecast',
            name: 'Show Weather Forecast',
            description: 'User wants to see the weather forecast',
            examples: ['show me the forecast', 'what is the forecast', "what's the weather going to be like", 'show forecast', '5 day forecast', 'weekly weather'],
            antiExamples: ['what is a forecast?', 'how accurate are forecasts?'],
            priority: 100,
            execution: {
                mode: 'dispatch',
                handlerTagId: 'weather.orchestrator',
                payload: { action: 'show_forecast' },
                responseTemplate: 'Opening the forecast...'
            }
        },
        {
            commandId: 'manage_cities',
            name: 'Manage Cities',
            description: 'User wants to add, remove, or manage their saved cities',
            examples: ['add a city', 'manage my cities', 'add new city', 'edit my locations', 'change my cities'],
            priority: 90,
            execution: {
                mode: 'dispatch',
                handlerTagId: 'weather.orchestrator',
                payload: { action: 'manage_cities' },
                responseTemplate: 'Opening city manager...'
            }
        },
        {
            commandId: 'compare_weather',
            name: 'Compare Weather',
            description: 'User wants to compare weather across different cities',
            examples: ['compare weather', 'compare cities', 'weather around the world', 'show me weather in different cities', 'compare temperatures'],
            priority: 85,
            execution: {
                mode: 'dispatch',
                handlerTagId: 'weather.orchestrator',
                payload: { action: 'compare_weather' },
                responseTemplate: 'Opening weather comparison...'
            }
        },
        {
            commandId: 'check_alerts',
            name: 'Check Weather Alerts',
            description: 'User wants to check for weather alerts or warnings',
            examples: ['check alerts', 'any weather alerts', 'weather warnings', 'are there any alerts', 'storm warnings'],
            priority: 95,
            execution: {
                mode: 'dispatch',
                handlerTagId: 'weather.orchestrator',
                payload: { action: 'check_alerts' },
                responseTemplate: 'Checking weather alerts...'
            }
        },
        {
            commandId: 'show_hero',
            name: 'Show Weather Dashboard',
            description: 'User wants to see the main weather dashboard or home screen',
            examples: ['show dashboard', 'go home', 'main screen', 'weather home', 'show welcome screen'],
            priority: 80,
            execution: {
                mode: 'dispatch',
                handlerTagId: 'weather.orchestrator',
                payload: { action: 'show_hero' },
                responseTemplate: 'Opening weather dashboard...'
            }
        },
        {
            commandId: 'show_favorite_cities',
            name: 'Show Favorite Cities',
            description: 'User wants to see weather for their favorite/saved cities',
            examples: [
                'show my favorite cities',
                'show favorite cities',
                'my cities',
                'show my saved cities',
                'favorite city weather',
                'weather in my cities',
                'show me my favorite cities'
            ],
            antiExamples: ['add a favorite city', 'remove a city from favorites', 'what cities have I saved'],
            priority: 92,
            execution: {
                mode: 'dispatch',
                handlerTagId: 'weather.static-init',
                payload: { action: 'show_favorite_cities' },
                responseTemplate: 'Opening your favorite cities...'
            }
        }
    ]
};

// Export all tag definitions
export const weatherTagDefinitions: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate>[] = [
    weatherSpotlight1,
    weatherSpotlight2,
    weatherSpotlightFixed,
    weatherCanvas,
    weatherDialog,
    weatherSummary,
    weatherComparison,
    weatherFunFact,
    quickWeatherSearch,
    weatherStaticInit,
    weatherHero,
    weatherOrchestrator
];
