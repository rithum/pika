import { SessionData } from '@pika/shared/types/chatbot/chatbot-types';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseCSVFiles } from './csv-parser';
import {
    GeocodingResponse,
    GeocodingResult,
    GetAirQualityParams,
    GetClimateForecastParams,
    GetCurrentWeatherFromS3CsvFileParams,
    GetCurrentWeatherParams,
    GetGeocodingParams,
    GetHistoricalWeatherParams,
    GetMarineForecastParams,
    GetWeatherForecastParams
} from './types';

let s3Client: S3Client | undefined;

// Helper function to convert arrays to comma-separated strings
const formatParam = (param: string[] | string | undefined): string | undefined => {
    if (!param) return undefined;
    if (Array.isArray(param)) return param.join(',');
    return param;
};

// Helper function to determine if an error is retryable
const isRetryableError = (error: any): boolean => {
    if (!error) return false;

    // Check for specific AWS error codes that are retryable
    const retryableErrorCodes = [
        'NoSuchKey', // S3 eventual consistency
        'ServiceUnavailable', // Temporary service issues
        'SlowDown', // Throttling
        'InternalError', // AWS internal errors
        'RequestTimeout' // Network timeouts
    ];

    return (
        retryableErrorCodes.includes(error.name) ||
        retryableErrorCodes.includes(error.Code) ||
        error.message?.includes('timeout') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT'
    );
};

// Helper function to retry S3 operations with exponential backoff
async function retryS3Operation<T>(operation: () => Promise<T>, maxRetries: number = 5, baseDelayMs: number = 1000, operationName: string = 'S3 operation'): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;

            // If this is the last attempt or error is not retryable, throw
            if (attempt === maxRetries || !isRetryableError(error)) {
                console.error(`${operationName} failed after ${attempt} attempts:`, error);
                throw error;
            }

            // Calculate delay with exponential backoff and jitter
            const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
            const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
            const delayMs = Math.floor(exponentialDelay + jitter);

            console.warn(`${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms:`, error.message || error.name);

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    // This should never be reached, but just in case
    throw lastError;
}

// Helper function to fetch weather data
// Using direct fetch instead of SDK to get JSON response directly
async function fetchWeatherDataAsJson(url: string, params: any): Promise<any> {
    const queryParams = new URLSearchParams();

    // Convert params to URL search params
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            queryParams.append(key, String(value));
        }
    });

    const response = await fetch(`${url}?${queryParams}`);
    if (!response.ok) {
        throw new Error(`Weather API request failed: ${response.statusText}`);
    }

    return await response.json();
}

export async function getWeatherForecast(p: GetWeatherForecastParams): Promise<any> {
    return await fetchWeatherDataAsJson('https://api.open-meteo.com/v1/forecast', {
        latitude: p.latitude,
        longitude: p.longitude,
        start_date: p.startDate,
        end_date: p.endDate,
        hourly: formatParam(p.hourly),
        daily: formatParam(p.daily),
        models: formatParam(p.models),
        timezone: p.timezone
    });
}

export function assertGetWeatherForecastParams(params: unknown): asserts params is GetWeatherForecastParams {
    if (typeof params !== 'object' || params === null) {
        throw new Error('Weather forecast parameters must be an object');
    }

    if (!('latitude' in params)) throw new Error('Missing required parameter: latitude');
    if (!('longitude' in params)) throw new Error('Missing required parameter: longitude');
    // startDate, endDate, hourly, daily, models, and timezone are all optional
}

export async function getCurrentWeather(p: GetCurrentWeatherParams): Promise<any> {
    return await fetchWeatherDataAsJson('https://api.open-meteo.com/v1/forecast', {
        latitude: p.latitude,
        longitude: p.longitude,
        timezone: p.timezone,
        current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m'
    });
}

export async function getCurrentWeatherFromS3CsvFile(p: GetCurrentWeatherFromS3CsvFileParams, uploadS3BucketName: string, region: string): Promise<any[]> {
    if (!s3Client) {
        s3Client = new S3Client({ region });
    }

    const rawFiles: Record<string, string> = {};

    // Process files in parallel with retry logic
    const filePromises = p.s3Keys.map(async (s3Key) => {
        /*
            TODO: IMPORTANT
            Sometimes, the LLM appears to set the key to the full S3 URI.  So we need to remove the s3:// and the bucket name
            from the key.  It's possible this is a bug further` up stream, but it only happens occasionally.
         */
        s3Key = s3Key.startsWith('s3://') ? s3Key.split('/').slice(3).join('/') : s3Key;

        const fileContent = await retryS3Operation(
            async () => {
                const getObjectCommand = new GetObjectCommand({
                    Bucket: uploadS3BucketName,
                    Key: s3Key
                });

                const response = await s3Client!.send(getObjectCommand);

                // Read the stream data
                if (response.Body) {
                    const streamReader = response.Body;
                    return await streamReader.transformToString();
                } else {
                    throw new Error(`No content received for file: ${s3Key}`);
                }
            },
            5, // maxRetries
            1000, // baseDelayMs
            `Retrieving file ${s3Key} from S3`
        );

        return { s3Key, fileContent };
    });

    // Wait for all files to be retrieved
    const fileResults = await Promise.all(filePromises);

    // Build the rawFiles object
    fileResults.forEach(({ s3Key, fileContent }) => {
        rawFiles[s3Key] = fileContent;
    });

    const weatherCoordinates = parseCSVFiles(rawFiles);

    let results: any[] = [];
    for (const [s3Key, data] of Object.entries(weatherCoordinates)) {
        for (const coordinate of data) {
            const currentWeather = await getCurrentWeather(coordinate);
            results.push(currentWeather);
            // Wait for 250ms to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }

    return results;
}

export function assertGetCurrentWeatherParams(params: unknown): asserts params is GetCurrentWeatherParams {
    if (typeof params !== 'object' || params === null) {
        throw new Error('Current weather parameters must be an object');
    }

    if (!('latitude' in params)) throw new Error('Missing required parameter: latitude');
    if (!('longitude' in params)) throw new Error('Missing required parameter: longitude');
    // timezone is optional
}

export function assertGetCurrentWeatherFromS3CsvFileParams(params: unknown): asserts params is GetCurrentWeatherFromS3CsvFileParams {
    if (typeof params !== 'object' || params === null) {
        throw new Error('Current weather parameters must be an object');
    }

    if (!('s3Keys' in params)) throw new Error('Missing required parameter: s3Keys');
    if (!Array.isArray(params.s3Keys)) throw new Error('s3Keys must be an array');
    if (params.s3Keys.length === 0) throw new Error('s3Keys must contain at least one key');
}

export async function getHistoricalWeather(p: GetHistoricalWeatherParams): Promise<any> {
    return await fetchWeatherDataAsJson('https://archive-api.open-meteo.com/v1/archive', {
        latitude: p.latitude,
        longitude: p.longitude,
        start_date: p.startDate,
        end_date: p.endDate,
        hourly: formatParam(p.hourly),
        daily: formatParam(p.daily),
        timezone: p.timezone
    });
}

export function assertGetHistoricalWeatherParams(params: unknown): asserts params is GetHistoricalWeatherParams {
    if (typeof params !== 'object' || params === null) {
        throw new Error('Historical weather parameters must be an object');
    }

    if (!('latitude' in params)) throw new Error('Missing required parameter: latitude');
    if (!('longitude' in params)) throw new Error('Missing required parameter: longitude');
    if (!('startDate' in params)) throw new Error('Missing required parameter: startDate');
    if (!('endDate' in params)) throw new Error('Missing required parameter: endDate');
    // hourly, daily, and timezone can be optional
}

export function assertGetAirQualityParams(params: unknown): asserts params is GetAirQualityParams {
    if (typeof params !== 'object' || params === null) {
        throw new Error('Air quality parameters must be an object');
    }

    if (!('latitude' in params)) throw new Error('Missing required parameter: latitude');
    if (!('longitude' in params)) throw new Error('Missing required parameter: longitude');
    // startDate, endDate, hourly and timezone are all optional
}

export function assertGetMarineForecastParams(params: unknown): asserts params is GetMarineForecastParams {
    if (typeof params !== 'object' || params === null) {
        throw new Error('Marine forecast parameters must be an object');
    }

    if (!('latitude' in params)) throw new Error('Missing required parameter: latitude');
    if (!('longitude' in params)) throw new Error('Missing required parameter: longitude');
    // startDate, endDate, hourly, daily, and timezone are all optional
}

export function assertGetClimateForecastParams(params: unknown): asserts params is GetClimateForecastParams {
    if (typeof params !== 'object' || params === null) {
        throw new Error('Climate forecast parameters must be an object');
    }

    if (!('latitude' in params)) throw new Error('Missing required parameter: latitude');
    if (!('longitude' in params)) throw new Error('Missing required parameter: longitude');
    if (!('startDate' in params)) throw new Error('Missing required parameter: startDate');
    if (!('endDate' in params)) throw new Error('Missing required parameter: endDate');
    // daily, model, and timezone can be optional
}

export function assertGetGeocodingParams(params: unknown): asserts params is GetGeocodingParams {
    if (typeof params !== 'object' || params === null) {
        throw new Error('Geocoding parameters must be an object');
    }

    if (!('name' in params)) throw new Error('Missing required parameter: name');
    // count is optional
}

export async function getAirQuality(p: GetAirQualityParams): Promise<any> {
    return await fetchWeatherDataAsJson('https://air-quality-api.open-meteo.com/v1/air-quality', {
        latitude: p.latitude,
        longitude: p.longitude,
        start_date: p.startDate,
        end_date: p.endDate,
        hourly: formatParam(p.hourly),
        timezone: p.timezone
    });
}

export async function getMarineForecast(p: GetMarineForecastParams): Promise<any> {
    return await fetchWeatherDataAsJson('https://marine-api.open-meteo.com/v1/marine', {
        latitude: p.latitude,
        longitude: p.longitude,
        start_date: p.startDate,
        end_date: p.endDate,
        hourly: formatParam(p.hourly),
        daily: formatParam(p.daily),
        timezone: p.timezone
    });
}

export async function getClimateForecast(p: GetClimateForecastParams): Promise<any> {
    return await fetchWeatherDataAsJson('https://climate-api.open-meteo.com/v1/climate', {
        latitude: p.latitude,
        longitude: p.longitude,
        start_date: p.startDate,
        end_date: p.endDate,
        daily: formatParam(p.daily),
        model: p.model,
        timezone: p.timezone
    });
}

export async function getGeocoding(p: GetGeocodingParams): Promise<GeocodingResult[]> {
    const url = 'https://geocoding-api.open-meteo.com/v1/search';
    const response = await fetch(
        `${url}?${new URLSearchParams({
            name: p.name,
            count: p.count?.toString() || '10'
        })}`
    );
    const json = (await response?.json()) as GeocodingResponse;
    return json?.results || [];
}

/**
 * Call the OpenMateo API with the given function name and parameters
 * @param fnName - The name of the function to call
 * @param params - The parameters for the function
 * @param sessionData - The session data for the user
 * @returns The response from the OpenMateo API as JSON
 */
export async function callOpenMateoApi(fnName: string, params: Record<string, any>, sessionData: SessionData, uploadS3BucketName: string, region: string): Promise<any> {
    console.log(`Calling OpenMateo API with function: ${fnName} and params: ${JSON.stringify(params)} for session: ${sessionData.sessionId}`);

    let result: any;

    switch (fnName) {
        case 'getWeatherForecast':
            assertGetWeatherForecastParams(params);
            result = await getWeatherForecast(params);
            break;

        case 'getCurrentWeather':
            assertGetCurrentWeatherParams(params);
            result = await getCurrentWeather(params);
            break;

        case 'getCurrentWeatherFromS3CsvFile':
            assertGetCurrentWeatherFromS3CsvFileParams(params);
            result = await getCurrentWeatherFromS3CsvFile(params, uploadS3BucketName, region);
            break;

        case 'getHistoricalWeather':
            assertGetHistoricalWeatherParams(params);
            result = await getHistoricalWeather(params);
            break;

        case 'getAirQuality':
            assertGetAirQualityParams(params);
            result = await getAirQuality(params);
            break;

        case 'getMarineForecast':
            assertGetMarineForecastParams(params);
            result = await getMarineForecast(params);
            break;

        case 'getClimateForecast':
            assertGetClimateForecastParams(params);
            result = await getClimateForecast(params);
            break;

        case 'getGeocoding':
            assertGetGeocodingParams(params);
            result = await getGeocoding(params);
            break;

        default:
            throw new Error(`Unknown function name: ${fnName}`);
    }

    // All functions now return JSON directly, no conversion needed
    return result;
}
