// interfaces.ts

export type WeatherApiParams =
    | GetWeatherForecastParams
    | GetCurrentWeatherParams
    | GetHistoricalWeatherParams
    | GetAirQualityParams
    | GetMarineForecastParams
    | GetClimateForecastParams
    | GetGeocodingParams;

export interface GetWeatherForecastParams {
    latitude: number;
    longitude: number;
    startDate?: string;
    endDate?: string;
    hourly?: string[] | string;
    daily?: string[] | string;
    models?: string[] | string;
    timezone?: string;
}

export interface GetCurrentWeatherParams {
    latitude: number;
    longitude: number;
    timezone: string;
}

export interface GetCurrentWeatherFromS3CsvFileParams {
    s3Keys: string[];
}

export interface GetHistoricalWeatherParams {
    latitude: number;
    longitude: number;
    startDate: string;
    endDate: string;
    hourly?: string[] | string;
    daily?: string[] | string;
    timezone?: string;
}

export interface GetAirQualityParams {
    latitude: number;
    longitude: number;
    startDate?: string;
    endDate?: string;
    hourly?: string[] | string;
    timezone?: string;
}

export interface GetMarineForecastParams {
    latitude: number;
    longitude: number;
    startDate?: string;
    endDate?: string;
    hourly?: string[] | string;
    daily?: string[] | string;
    timezone?: string;
}

export interface GetClimateForecastParams {
    latitude: number;
    longitude: number;
    startDate: string;
    endDate: string;
    daily?: string[] | string;
    model?: string;
    timezone?: string;
}

export interface GetGeocodingParams {
    name: string;
    count?: number;
}

export interface GeocodingResponse {
    results?: GeocodingResult[];
}

export interface GeocodingResult {
    id: number; // Unique ID for the location
    name: string; // Location name
    latitude: number; // Geographical coordinates
    longitude: number; // Geographical coordinates
    elevation: number; // Elevation above sea level
    feature_code: string; // Type of location (follows GeoNames feature_code)
    country_code: string; // 2-character ISO country code
    admin1_id: number; // ID for first administrative level
    admin2_id: number; // ID for second administrative level
    admin3_id: number; // ID for third administrative level
    admin4_id: number; // ID for fourth administrative level
    timezone: string; // Time zone identifier
    population: number; // Number of inhabitants
    postcodes: string[]; // List of postcodes for this location
    country_id: number; // ID for the country
    country: string; // Country name
    admin1: string; // First administrative level name
    admin2: string; // Second administrative level name
    admin3: string; // Third administrative level name
    admin4: string; // Fourth administrative level name
}
