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
