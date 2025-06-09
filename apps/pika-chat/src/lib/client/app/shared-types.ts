/**
 * State files need to be passed the actual fetch that is tricked out by svelte so it works client/server.
 * This is the type of the fetch function that is passed to state files.
 */
export type FetchZ = typeof globalThis.fetch;
