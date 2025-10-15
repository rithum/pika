/**
 * pika-ux package
 *
 * This package contains UI components for the Pika project, including both custom Pika components
 * and shadcn/ui components adapted for Svelte.
 *
 * You can import specific component collections:
 * import { Button, Card } from 'pika-ux/shadcn';
 * import { Chip, PikaAlert } from 'pika-ux/pika';
 *
 * Or import individual components:
 * import { Button } from 'pika-ux/shadcn/button';
 * import { Chip } from 'pika-ux/pika/chip';
 */

export const packageInfo = {
    name: 'pika-ux',
    description: 'UI Components library for the Pika project'
};

// Re-export all components for convenience
export * from './pika';
export * from './shadcn';
