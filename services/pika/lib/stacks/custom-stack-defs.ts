import { PikaConstructProps } from '../constructs/pika-construct.js';
import { PikaStack } from './pika-stack.js';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

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

    /**
     * Helper method to apply component tags to custom infrastructure you add.
     * Uses the component tag names from pika-config.ts to tag your resources consistently.
     *
     * **Important**: This method is only available AFTER the PikaConstruct has been created.
     * Use it in `addStackResoucesAfterWeCreateThePikaConstruct()`, not in `addStackResoucesBeforeWeCreateThePikaConstruct()`.
     *
     * @param construct The CDK construct (Lambda, DynamoDB table, S3 bucket, etc.) to tag
     * @param componentValue The component name/value (e.g., 'MyCustomLambda', 'MyS3Bucket')
     *
     * @example
     * ```typescript
     * addStackResoucesAfterWeCreateThePikaConstruct(): void {
     *     const myLambda = new lambda.Function(this.stack, 'MyCustomFunction', {
     *         // ... lambda config
     *     });
     *     this.applyComponentTags(myLambda, 'MyCustomLambda');
     * }
     * ```
     */
    protected applyComponentTags(construct: Construct, componentValue: string): void {
        // Delegate to the PikaConstruct's component tagging method
        (this.stack.pikaConstruct as any).applyComponentTags(construct, componentValue);
    }
}
