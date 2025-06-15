/**
 * This error is used to allow us to distinguish between errors that are
 * expected to be returned to the user and errors that are unexpected.
 *
 * These errors are caught in the Bedrock Lambda and converted into a
 * BedrockLambdaResponse object using the message as the body.
 */
export class BedrockLambdaError extends Error {
    constructor(message: string) {
        super(message);
    }
}
