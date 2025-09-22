/**
 * Mock for SvelteKit's $env/dynamic/private module
 *
 * This mock returns an empty env object so that all the fallbacks
 * to process.env in the config will work correctly in Jest tests.
 */

export const env: Record<string, string | undefined> = {};
