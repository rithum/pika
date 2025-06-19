import { PikaChatConstructProps } from './pika-chat-construct.js';
import { PikaChatStack } from './pika-chat-stack.js';

/**
 * Feel free to modify this file to add your own customizations to the PikaChatConstructProps.
 *
 * @param defaultProps The default props for the PikaChatConstruct.
 * @returns The modified props for the PikaChatConstruct.
 */
export function getPikaChatConstructProps(defaultProps: PikaChatConstructProps, stack: PikaChatStack): PikaChatConstructProps {
    return defaultProps;
}

/**
 * Add resources to the stack before we create the PikaChatConstruct if you want to.
 *
 * @param stack The stack to add resources to.
 */
export function addStackResoucesBeforeWeCreateThePikaChatConstruct(stack: PikaChatStack): void {
    // Implement if you want to
}

/**
 * Add resources to the stack after we create the PikaChatConstruct if you want to.
 *
 * @param stack The stack to add resources to.
 */
export function addStackResoucesAfterWeCreateThePikaChatConstruct(stack: PikaChatStack): void {
    // Implement if you want to
}
