import { PikaConstructProps } from '../constructs/pika-construct.js';
import { PikaStack } from './pika-stack.js';

/**
 * Feel free to modify this file to add your own customizations to the PikaConstructProps.
 *
 * @param defaultProps The default props for the PikaConstruct.
 * @returns The modified props for the PikaConstruct.
 */
export function getPikaConstructProps(defaultProps: PikaConstructProps, stack: PikaStack): PikaConstructProps {
    return defaultProps;
}

/**
 * Add resources to the stack before we create the PikaConstruct if you want to.
 *
 * @param stack The stack to add resources to.
 */
export function addStackResoucesBeforeWeCreateThePikaConstruct(stack: PikaStack): void {
    // Implement if you want to
}

/**
 * Add resources to the stack after we create the PikaConstruct if you want to.
 *
 * @param stack The stack to add resources to.
 */
export function addStackResoucesAfterWeCreateThePikaConstruct(stack: PikaStack): void {
    // Implement if you want to
}
