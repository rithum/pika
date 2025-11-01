import { PartialPikaChatConstructProps, PikaChatConstructProps } from './pika-chat-construct.js';
import { PikaChatStack } from './pika-chat-stack.js';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

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
        isProd: cdk.CfnCondition;
        isProductionEnv: cdk.CfnCondition;
    }

    /**
     * Add resources to the stack after we create the PikaChatConstruct if you want to.
     */
    addStackResoucesAfterWeCreateThePikaChatConstruct(): void {
        //TODO: implement if needed
    }

    /**
     * Helper method to apply component tags to custom infrastructure you add.
     * Uses the component tag names from pika-config.ts to tag your resources consistently.
     * 
     * **Important**: This method is only available AFTER the PikaChatConstruct has been created.
     * Use it in `addStackResoucesAfterWeCreateThePikaChatConstruct()`, not in `addStackResoucesBeforeWeCreateThePikaChatConstruct()`.
     *
     * @param construct The CDK construct (Lambda, DynamoDB table, S3 bucket, EC2 instance, etc.) to tag
     * @param componentValue The component name/value (e.g., 'MyCustomLambda', 'MyS3Bucket', 'MyEC2Instance')
     *
     * @example
     * ```typescript
     * addStackResoucesAfterWeCreateThePikaChatConstruct(): void {
     *     const myLambda = new lambda.Function(this.stack, 'MyCustomFunction', {
     *         // ... lambda config
     *     });
     *     this.applyComponentTags(myLambda, 'MyCustomLambda');
     *
     *     const myBucket = new s3.Bucket(this.stack, 'MyCustomBucket', {
     *         // ... bucket config
     *     });
     *     this.applyComponentTags(myBucket, 'MyCustomS3Bucket');
     * }
     * ```
     */
    protected applyComponentTags(construct: Construct, componentValue: string): void {
        // Delegate to the PikaChatConstruct's component tagging method
        this.stack.webapp.applyComponentTags(construct, componentValue);
    }
}
