import Papa from 'papaparse';
import { GetCurrentWeatherParams } from './types';

/**
 * Parses a collection of CSV files containing weather location data
 *
 * @param files - Object where keys are filenames and values are CSV file contents as strings
 * @returns Object where keys are filenames and values are arrays of parsed GetCurrentWeatherParams objects
 * @throws Error if any file cannot be parsed or is missing required data
 *
 * @description
 * This function processes multiple CSV files containing geographic coordinates for weather data.
 * It handles two CSV formats:
 * 1. Files with a header row containing "longitude", "latitude", and "timezone" columns
 * 2. Files without headers (assuming column order: longitude, latitude, timezone)
 *
 * For each file, it:
 * - Parses the CSV content using PapaParse
 * - Detects if a header row is present
 * - Identifies the column indices for longitude, latitude, and timezone
 * - Extracts and validates all data rows
 * - Converts longitude and latitude to numbers
 * - Creates GetCurrentWeatherParams objects for every row in the file
 *
 * If any errors occur during parsing (empty files, missing columns, invalid values),
 * they are collected and thrown as a combined error message.
 */
export function parseCSVFiles(files: Record<string, string>): Record<string, GetCurrentWeatherParams[]> {
    const result: Record<string, GetCurrentWeatherParams[]> = {};
    const errors: string[] = [];

    for (const [fileName, fileContent] of Object.entries(files)) {
        try {
            // Parse the CSV content
            const parseResult = Papa.parse(fileContent, {
                skipEmptyLines: true
            });

            if (parseResult.errors.length > 0) {
                errors.push(`Error parsing ${fileName}: ${parseResult.errors.map((e) => e.message).join(', ')}`);
                continue;
            }

            const rows = parseResult.data as string[][];
            if (rows.length === 0) {
                errors.push(`Error parsing ${fileName}: File is empty`);
                continue;
            }

            // Check if the first row looks like a header
            const firstRow = rows[0];
            const hasHeader = firstRow.some((cell) => ['longitude', 'latitude', 'timezone'].includes(cell.toLowerCase().trim()));

            let longitudeIndex: number;
            let latitudeIndex: number;
            let timezoneIndex: number;

            if (hasHeader) {
                // Validate header and get column indices
                const headerRow = firstRow.map((h) => h.toLowerCase().trim());

                longitudeIndex = headerRow.indexOf('longitude');
                latitudeIndex = headerRow.indexOf('latitude');
                timezoneIndex = headerRow.indexOf('timezone');

                // Validate all required columns are present
                if (longitudeIndex === -1 || latitudeIndex === -1 || timezoneIndex === -1) {
                    const missing = [];
                    if (longitudeIndex === -1) missing.push('longitude');
                    if (latitudeIndex === -1) missing.push('latitude');
                    if (timezoneIndex === -1) missing.push('timezone');

                    errors.push(`Error parsing ${fileName}: Missing required columns: ${missing.join(', ')}`);
                    continue;
                }
            } else {
                // No header - validate that there are exactly 3 columns
                if (firstRow.length !== 3) {
                    errors.push(`Error parsing ${fileName}: Expected exactly 3 columns (longitude, latitude, timezone) but found ${firstRow.length}`);
                    continue;
                }

                // Assume order: longitude, latitude, timezone
                longitudeIndex = 0;
                latitudeIndex = 1;
                timezoneIndex = 2;
            }

            // Process data rows
            const dataRows = hasHeader ? rows.slice(1) : rows;

            if (dataRows.length === 0) {
                errors.push(`Error parsing ${fileName}: No data rows found`);
                continue;
            }

            // Create an array to store all parsed params for this file
            const fileParams: GetCurrentWeatherParams[] = [];

            // Process all data rows
            for (const dataRow of dataRows) {
                // Ensure the row has enough columns
                if (Math.max(longitudeIndex, latitudeIndex, timezoneIndex) >= dataRow.length) {
                    errors.push(`Error parsing row in ${fileName}: Data row doesn't have enough columns`);
                    continue;
                }

                // Parse longitude and latitude as numbers
                const longitude = parseFloat(dataRow[longitudeIndex]);
                const latitude = parseFloat(dataRow[latitudeIndex]);
                const timezone = dataRow[timezoneIndex];

                // Validate parsed values
                if (isNaN(longitude)) {
                    errors.push(`Error parsing row in ${fileName}: Invalid longitude value "${dataRow[longitudeIndex]}"`);
                    continue;
                }
                if (isNaN(latitude)) {
                    errors.push(`Error parsing row in ${fileName}: Invalid latitude value "${dataRow[latitudeIndex]}"`);
                    continue;
                }

                // Add to the array of params for this file
                fileParams.push({
                    latitude,
                    longitude,
                    timezone
                });
            }

            // Add the array of params to the result
            result[fileName] = fileParams;
        } catch (error) {
            errors.push(`Error processing ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // If there were any errors, throw a combined error message
    if (errors.length > 0) {
        throw new Error(`Errors occurred while parsing CSV files:\n${errors.join('\n')}`);
    }

    return result;
}
