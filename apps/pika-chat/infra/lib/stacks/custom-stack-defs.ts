import { PartialPikaChatConstructProps, PikaChatConstructProps } from './pika-chat-construct.js';
import { PikaChatStack } from './pika-chat-stack.js';

/**
 * You must make changes to this class to add your own customizations to the pika stack.
 * Specifically, you must implement the getPikaChatConstructProps method and provide the
 * vpc, certificateArn, baseDomain, and hostedZoneId in the PikaChatConstructProps.
 */
export class CustomStackDefs {
    private stack: PikaChatStack;

    constructor(stack: PikaChatStack) {
        this.stack = stack;
    }

    /**
     * Get the props for the PikaChatConstruct. You must implement this method and provide the vpc, certificateArn, baseDomain, and hostedZoneId in the PikaChatConstructProps.
     *
     * @param defaultProps The default props for the PikaChatConstruct.
     * @returns The modified props for the PikaChatConstruct.
     */
    getPikaChatConstructProps(defaultProps: PartialPikaChatConstructProps): PikaChatConstructProps {
        //TODO: implement
        // This will break as is because you MUST define the vpc, certificateArn, baseDomain, and hostedZoneId in the PikaChatConstructProps.
        return defaultProps as PikaChatConstructProps;
    }

    /**
     * Add resources to the stack before we create the PikaChatConstruct if you want to.
     */
    addStackResoucesBeforeWeCreateThePikaChatConstruct(): void {
        //TODO: implement if needed
    }

    /**
     * Add resources to the stack after we create the PikaChatConstruct if you want to.
     */
    addStackResoucesAfterWeCreateThePikaChatConstruct(): void {
        //TODO: implement if needed
    }
}
