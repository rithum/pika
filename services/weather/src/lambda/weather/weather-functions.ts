/**
 * Weather functions configuration for inline agent.
 * This is a hardcoded version moved from the CDK stack for initial inline agent implementation.
 * 
 * It is critically important to know that as of now, AWS only allows at most 5 parameters to be passed to a function.
 * When we need more than 5 parameters, we need to use a different approach. We will make the 5th parameter
 * name "jsonParams" and set it to a JSON string of the remaining optional parameters.
 */

import { FunctionDefinition } from "@aws-sdk/client-bedrock-agent-runtime";

export const weatherFunctions: FunctionDefinition[] = [
    {
        name: 'initSession',
        description: 'Initializes a new session for the user.',
        parameters: {
            sessionId: {
                type: 'string',
                description: 'Unique identifier for the session',
                required: true
            },
            companyId: {
                type: 'string',
                description: 'Unique identifier for the company',
                required: true
            },
            companyType: {
                type: 'string',
                description: 'Type of company participating in the session',
                required: true
            },
            date: {
                type: 'string',
                description: 'Current date in ISO 8601 format',
                required: true
            }
        },
        requireConfirmation: 'DISABLED'
    },
    {
        name: 'getWeatherForecast',
        description: 'Retrieves weather forecast data for a specified location and time range. Supports hourly and daily variables, multiple weather models, and various units. Returns forecast data in JSON format. At least one of hourly or daily variables should be specified in jsonParams for meaningful results.',
        parameters: {
            latitude: {
                type: 'number',
                description: 'Latitude of the location in decimal degrees (e.g., 37.7749).',
                required: true
            },
            longitude: {
                type: 'number',
                description: 'Longitude of the location in decimal degrees (e.g., -122.4194).',
                required: true
            },
            startDate: {
                type: 'string',
                description: 'Start date for the forecast in ISO 8601 format (e.g., 2025-05-13). If not provided, defaults to current date.',
                required: false
            },
            endDate: {
                type: 'string',
                description: 'End date for the forecast in ISO 8601 format (e.g., 2025-05-20). If not provided, defaults to 7 days from start date.',
                required: false
            },
            jsonParams: {
                type: 'string',
                description: 'A JSON string of optional params. Interface is `{\n// List hourly weather variables to retrieve (e.g., temperature_2m, precipitation)\nhourly?:array;\n// List daily weather variables to retrieve (e.g., temperature_2m_max, precipitation_sum)\ndaily?:array;\n// List weather models to use (e.g., ECMWF, GFS). Defaults to best available\nmodels?:array;\n// Timezone for returned data (e.g., America/Los_Angeles), defaults to UTC.\ntimezone?:string;\n}` Provide at least one of hourly or daily.',
                required: false
            }
        },
        requireConfirmation: 'DISABLED'
    },
    {
        name: 'getCurrentWeather',
        description: 'Retrieves current weather conditions for a specified location. Returns data such as temperature, humidity, and wind speed.',
        parameters: {
            latitude: {
                type: 'number',
                description: 'Latitude of the location in decimal degrees (e.g., 37.7749).',
                required: true
            },
            longitude: {
                type: 'number',
                description: 'Longitude of the location in decimal degrees (e.g., -122.4194).',
                required: true
            },
            timezone: {
                type: 'string',
                description: 'Timezone for the returned data (e.g., America/Los_Angeles).',
                required: false
            }
        },
        requireConfirmation: 'DISABLED'
    },
    {
        name: 'getCurrentWeatherFromS3CsvFile',
        description: 'Retrieves current weather conditions for a specified location from one or more CSV files in S3. Returns data such as temperature, humidity, and wind speed. Each CSV file should have the following format: latitude,longitude,timezone.',
        parameters: {
            s3Keys: {
                type: 'array',
                description: 'Array of S3 keys for the CSV files.',
                required: true
            }
        },
        requireConfirmation: 'DISABLED'
    },
    {
        name: 'getHistoricalWeather',
        description: 'Retrieves historical weather data for a specified location and date range. Supports hourly and daily variables. Returns data in JSON format.',
        parameters: {
            latitude: {
                type: 'number',
                description: 'Latitude of the location in decimal degrees (e.g., 37.7749).',
                required: true
            },
            longitude: {
                type: 'number',
                description: 'Longitude of the location in decimal degrees (e.g., -122.4194).',
                required: true
            },
            startDate: {
                type: 'string',
                description: 'Start date for the historical data in ISO 8601 format (e.g., 2025-05-01).',
                required: true
            },
            endDate: {
                type: 'string',
                description: 'End date for the historical data in ISO 8601 format (e.g., 2025-05-10).',
                required: true
            },
            jsonParams: {
                type: 'string',
                description: 'A JSON string of optional params. Interface is `{\n// List of hourly weather variables to retrieve (e.g., temperature_2m, precipitation).\nhourly?:array;\n\n// List of daily weather variables to retrieve (e.g., temperature_2m_max, precipitation_sum).\ndaily?:array;\n\n// Timezone for the returned data (e.g., America/Los_Angeles).\ntimezone?:string;\n}`',
                required: false
            }
        },
        requireConfirmation: 'DISABLED'
    },
    {
        name: 'getAirQuality',
        description: 'Retrieves air quality data for a specified location and date range. Supports variables like PM10, carbon monoxide, and AQI indices. Returns data in JSON format.',
        parameters: {
            latitude: {
                type: 'number',
                description: 'Latitude of the location in decimal degrees (e.g., 37.7749).',
                required: true
            },
            longitude: {
                type: 'number',
                description: 'Longitude of the location in decimal degrees (e.g., -122.4194).',
                required: true
            },
            startDate: {
                type: 'string',
                description: 'Start date for the air quality data in ISO 8601 format (e.g., 2025-05-13).',
                required: false
            },
            endDate: {
                type: 'string',
                description: 'End date for the air quality data in ISO 8601 format (e.g., 2025-05-20).',
                required: false
            },
            jsonParams: {
                type: 'string',
                description: 'A JSON string of optional params. Interface is `{\n// List of hourly air quality variables to retrieve (e.g., pm10, carbon_monoxide).\nhourly?:array;\n\n// Timezone for the returned data (e.g., America/Los_Angeles).\ntimezone?:string;\n}`',
                required: false
            }
        },
        requireConfirmation: 'DISABLED'
    },
    {
        name: 'getMarineForecast',
        description: 'Retrieves marine weather forecast data for a specified location and date range. Supports variables like wave height and swell direction. Returns data in JSON format.',
        parameters: {
            latitude: {
                type: 'number',
                description: 'Latitude of the location in decimal degrees (e.g., 37.7749).',
                required: true
            },
            longitude: {
                type: 'number',
                description: 'Longitude of the location in decimal degrees (e.g., -122.4194).',
                required: true
            },
            startDate: {
                type: 'string',
                description: 'Start date for the marine forecast in ISO 8601 format (e.g., 2025-05-13).',
                required: false
            },
            endDate: {
                type: 'string',
                description: 'End date for the marine forecast in ISO 8601 format (e.g., 2025-05-20).',
                required: false
            },
            jsonParams: {
                type: 'string',
                description: 'A JSON string of optional params. Interface is `{\n// List of hourly marine variables to retrieve (e.g., wave_height, swell_direction).\nhourly?:array;\n\n// List of daily marine variables to retrieve (e.g., wave_height_max, swell_direction_mean).\ndaily?:array;\n\n// Timezone for the returned data (e.g., America/Los_Angeles).\ntimezone?:string;\n}`',
                required: false
            }
        },
        requireConfirmation: 'DISABLED'
    },
    {
        name: 'getClimateForecast',
        description: 'Retrieves long-range climate forecast data for a specified location and date range. Supports variables like temperature and precipitation. Returns data in JSON format.',
        parameters: {
            latitude: {
                type: 'number',
                description: 'Latitude of the location in decimal degrees (e.g., 37.7749).',
                required: true
            },
            longitude: {
                type: 'number',
                description: 'Longitude of the location in decimal degrees (e.g., -122.4194).',
                required: true
            },
            startDate: {
                type: 'string',
                description: 'Start date for the climate forecast in ISO 8601 format (e.g., 2050-06-01).',
                required: true
            },
            endDate: {
                type: 'string',
                description: 'End date for the climate forecast in ISO 8601 format (e.g., 2050-07-01).',
                required: true
            },
            jsonParams: {
                type: 'string',
                description: 'A JSON string of optional params. Interface is `{\n// List of daily climate variables to retrieve (e.g., temperature_2m_max, precipitation_sum).\ndaily?:string;\n\n// Climate model to use for the forecast (e.g., MPI_ESM1_2_XR).\nmodel?:string;\n\n// Timezone for the returned data (e.g., America/Los_Angeles).\ntimezone?:string;\n}`',
                required: false
            }
        },
        requireConfirmation: 'DISABLED'
    },
    {
        name: 'getGeocoding',
        description: 'Retrieves geographical coordinates and related information for a specified place name. Useful for converting city names to latitude and longitude.',
        parameters: {
            name: {
                type: 'string',
                description: "Name of the location to geocode (e.g., 'San Francisco').",
                required: true
            },
            count: {
                type: 'integer',
                description: 'Maximum number of results to return (e.g., 5).',
                required: false
            }
        },
        requireConfirmation: 'DISABLED'
    }
]; 