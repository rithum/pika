import { AWS } from '@serverless/typescript';

// Weather Service Example - TypeScript Configuration
// A comprehensive weather service demonstrating the Pika Serverless Plugin with TypeScript

const serverlessConfiguration: AWS = {
    service: 'weather-service-ts',
    frameworkVersion: '3',

    plugins: ['@pika/pika-serverless'],

    provider: {
        name: 'aws',
        runtime: 'nodejs22.x' as any,
        region: 'us-east-1',
        stage: '${opt:stage, "dev"}',
        timeout: 30,

        iam: {
            role: {
                statements: [
                    {
                        Effect: 'Allow',
                        Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                        Resource: 'arn:aws:logs:*:*:*'
                    },
                    {
                        Effect: 'Allow',
                        Action: ['ssm:GetParameter', 'ssm:GetParameters'],
                        Resource: 'arn:aws:ssm:${aws:region}:${aws:accountId}:parameter/*'
                    }
                ]
            }
        },

        environment: {
            STAGE: '${self:provider.stage}',
            REGION: '${aws:region}',
            NODE_OPTIONS: '--enable-source-maps'
        }
    },

    // Pika configuration
    custom: {
        pika: {
            // Custom resource ARNs (resolved at deploy time using CloudFormation)
            agentCustomResourceArn: '{"Fn::Sub": "{{resolve:ssm:/stack/pika/${self:provider.stage}/lambda/agent_custom_resource_arn}}"}',
            chatAppCustomResourceArn: '{"Fn::Sub": "{{resolve:ssm:/stack/pika/${self:provider.stage}/lambda/chat_app_custom_resource_arn}}"}',

            // Agent definitions
            agents: [
                {
                    userId: 'cloudformation/${self:service}',
                    agent: {
                        agentId: '${self:service}-agent-${self:provider.stage}',
                        basePrompt: `You are WeatherInsightAgent, a highly skilled assistant for analyzing weather data and providing actionable insights. 
Your goal is to answer weather-related questions clearly and comprehensively with a helpful and professional tone.

Core Directives:
1. **Accuracy and Detail**: Provide accurate weather information. Be as detailed as necessary to fully answer the user's query.
2. **User-Centricity**: Focus on making the information easily understandable and useful to the user.
3. **Proactive Assistance**: When appropriate, suggest relevant follow-up questions or related weather insights.
4. **Helpful Context**: Provide context about what weather conditions mean for daily activities.

Available Functions:
- getCurrentWeather: Get current weather conditions for specific coordinates
- getWeatherForecast: Get multi-day weather forecasts
- getHistoricalWeather: Get historical weather data
- getAirQuality: Get air quality information
- getGeocoding: Convert location names to coordinates

Always use the most appropriate function(s) to fully answer the user's question.`
                    },
                    tools: [
                        {
                            toolId: '${self:service}-weather-tool-${self:provider.stage}',
                            name: 'weather-tool',
                            displayName: 'Weather Information Tool',
                            description: 'Comprehensive weather tool providing current conditions, forecasts, historical data, and air quality information',
                            executionType: 'lambda',
                            lambdaFunctionLogicalId: 'weatherFunction',
                            functionSchema: [
                                {
                                    name: 'getCurrentWeather',
                                    description: 'Get current weather conditions for a specified location',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            latitude: {
                                                type: 'number',
                                                description: 'Latitude of the location in decimal degrees (e.g., 37.7749)'
                                            },
                                            longitude: {
                                                type: 'number',
                                                description: 'Longitude of the location in decimal degrees (e.g., -122.4194)'
                                            },
                                            timezone: {
                                                type: 'string',
                                                description: 'Timezone for the returned data (e.g., America/Los_Angeles)'
                                            },
                                            includeDownloadLink: {
                                                type: 'boolean',
                                                description: 'Whether to include a download link for the current weather data'
                                            }
                                        },
                                        required: ['latitude', 'longitude']
                                    }
                                },
                                {
                                    name: 'getWeatherForecast',
                                    description: 'Get weather forecast for a specified location and time range',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            latitude: {
                                                type: 'number',
                                                description: 'Latitude of the location in decimal degrees (e.g., 37.7749)'
                                            },
                                            longitude: {
                                                type: 'number',
                                                description: 'Longitude of the location in decimal degrees (e.g., -122.4194)'
                                            },
                                            startDate: {
                                                type: 'string',
                                                description: 'Start date for the forecast in ISO 8601 format (e.g., 2025-05-13). If not provided, defaults to current date.'
                                            },
                                            endDate: {
                                                type: 'string',
                                                description: 'End date for the forecast in ISO 8601 format (e.g., 2025-05-20). If not provided, defaults to 7 days from start date.'
                                            },
                                            jsonParams: {
                                                type: 'string',
                                                description: 'A JSON string of optional params for hourly/daily variables, models, timezone'
                                            }
                                        },
                                        required: ['latitude', 'longitude']
                                    }
                                },
                                {
                                    name: 'getHistoricalWeather',
                                    description: 'Get historical weather data for a specified location and date range',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            latitude: {
                                                type: 'number',
                                                description: 'Latitude of the location in decimal degrees (e.g., 37.7749)'
                                            },
                                            longitude: {
                                                type: 'number',
                                                description: 'Longitude of the location in decimal degrees (e.g., -122.4194)'
                                            },
                                            startDate: {
                                                type: 'string',
                                                description: 'Start date for the historical data in ISO 8601 format (e.g., 2025-05-01)'
                                            },
                                            endDate: {
                                                type: 'string',
                                                description: 'End date for the historical data in ISO 8601 format (e.g., 2025-05-10)'
                                            },
                                            jsonParams: {
                                                type: 'string',
                                                description: 'A JSON string of optional params for hourly/daily variables, timezone'
                                            }
                                        },
                                        required: ['latitude', 'longitude', 'startDate', 'endDate']
                                    }
                                },
                                {
                                    name: 'getAirQuality',
                                    description: 'Get air quality data for a specified location and date range',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            latitude: {
                                                type: 'number',
                                                description: 'Latitude of the location in decimal degrees (e.g., 37.7749)'
                                            },
                                            longitude: {
                                                type: 'number',
                                                description: 'Longitude of the location in decimal degrees (e.g., -122.4194)'
                                            },
                                            startDate: {
                                                type: 'string',
                                                description: 'Start date for the air quality data in ISO 8601 format (e.g., 2025-05-13)'
                                            },
                                            endDate: {
                                                type: 'string',
                                                description: 'End date for the air quality data in ISO 8601 format (e.g., 2025-05-20)'
                                            },
                                            jsonParams: {
                                                type: 'string',
                                                description: 'A JSON string of optional params for hourly air quality variables, timezone'
                                            }
                                        },
                                        required: ['latitude', 'longitude']
                                    }
                                },
                                {
                                    name: 'getGeocoding',
                                    description: 'Get geographical coordinates for a specified place name',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            name: {
                                                type: 'string',
                                                description: "Name of the location to geocode (e.g., 'San Francisco')"
                                            },
                                            count: {
                                                type: 'integer',
                                                description: 'Maximum number of results to return (e.g., 5)'
                                            }
                                        },
                                        required: ['name']
                                    }
                                }
                            ],
                            supportedAgentFrameworks: ['bedrock']
                        }
                    ]
                }
            ],

            // Chat app definitions
            chatApps: [
                {
                    userId: 'cloudformation/${self:service}',
                    chatApp: {
                        chatAppId: 'weather-chat',
                        modesSupported: ['standalone', 'embedded'],
                        dontCacheThis: true, // For development
                        title: 'Weather Assistant',
                        description:
                            'Get comprehensive weather information through natural conversation. Ask about current conditions, forecasts, historical data, air quality, and more.',
                        userTypes: ['internal-user'],
                        agentId: '${self:service}-agent-${self:provider.stage}',
                        features: {
                            fileUpload: {
                                featureId: 'fileUpload',
                                enabled: true,
                                mimeTypesAllowed: ['text/csv']
                            },
                            promptInputFieldLabel: {
                                featureId: 'promptInputFieldLabel',
                                enabled: true,
                                promptInputFieldLabel: 'Ask about weather conditions...'
                            },
                            suggestions: {
                                featureId: 'suggestions',
                                enabled: true,
                                suggestions: [
                                    "What's the weather in Tokyo?",
                                    'Compare the weather in Tokyo and San Francisco in the last 30 days',
                                    'What will the temperature be in Paris tomorrow?',
                                    'Will it rain in London this weekend?',
                                    "What's the current weather in New York City?",
                                    'Show me the forecast for Sydney for the next week',
                                    "What's the air quality index in Beijing today?",
                                    'How hot will it be in Dubai next Tuesday?',
                                    "What's the historical average temperature for Barcelona in July?",
                                    'Is there a storm coming to Miami?'
                                ],
                                randomize: true,
                                maxToShow: 4
                            },
                            agentInstructionAssistance: {
                                featureId: 'agentInstructionAssistance',
                                enabled: true
                            }
                        },
                        enabled: true
                    }
                }
            ]
        }
    },

    functions: {
        weatherFunction: {
            handler: 'src/lambda/weather/index.handler',
            timeout: 30,
            memorySize: 256,
            environment: {
                PIKA_S3_BUCKET: '${ssm:/stack/pika/${self:provider.stage}/s3/pika_bucket_name}'
            }
        }
    }
};

module.exports = serverlessConfiguration;
