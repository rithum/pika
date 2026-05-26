/**
 * Mock for the 'svelte' module.
 * Only the type exports are needed by pika's custom hooks — runtime behavior is irrelevant.
 */
export type Component<Props = Record<string, any>> = {
    new (options: { target: Element; props?: Props }): any;
};
