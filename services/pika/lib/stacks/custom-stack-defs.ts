import { PikaConstructProps } from '../constructs/pika-construct.js';
import { PikaStack } from './pika-stack.js';

/**
 * Feel free to modify this file to add your own customizations to the pika stack.
 */
export class CustomStackDefs {
    private stack: PikaStack;

    constructor(stack: PikaStack) {
        this.stack = stack;
    }

    /**
     * Feel free to modify this file to add your own customizations to the PikaConstructProps.
     *
     * @param defaultProps The default props for the PikaConstruct.
     * @returns The modified props for the PikaConstruct.
     */
    getPikaConstructProps(defaultProps: PikaConstructProps): PikaConstructProps {
        return defaultProps;
    }

    /**
     * Modify or augment stack tags before they are applied to the Pika service stack.
     * This is called after interpolation of dynamic placeholders but before tags are applied.
     *
     * @param tags The tags from pika-config.ts after placeholder interpolation
     * @param stage The deployment stage
     * @returns Modified tags object
     *
     * @example
     * ```typescript
     * modifyStackTags(tags: Record<string, string>, stage: string): Record<string, string> {
     *     return {
     *         ...tags,
     *         'CustomTag': 'CustomValue',
     *         'Stage': stage.toUpperCase()
     *     };
     * }
     * ```
     */
    modifyStackTags(tags: Record<string, string>, stage: string): Record<string, string> {
        // Default implementation returns tags unchanged
        // Override this method to customize tags for the Pika service stack
        return tags;
    }

    /**
     * Add resources to the stack before we create the PikaConstruct if you want to.
     */
    addStackResoucesBeforeWeCreateThePikaConstruct(): void {
        //TODO: implement if needed
    }

    /**
     * Add resources to the stack after we create the PikaConstruct if you want to.
     */
    addStackResoucesAfterWeCreateThePikaConstruct(): void {
        //TODO: implement if needed
    }
}
