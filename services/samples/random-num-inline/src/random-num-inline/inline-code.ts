import { ActionGroupInvocationInput } from '@aws-sdk/client-bedrock-agent-runtime';

/**
 * Random number generator tool.  This will be an inline tool run as plain javascript.
 * It will not be deployed as a lambda function.  Since it's so simple, we will just
 * inline the code directly onto the tool definition itself.  We will transpile
 * from typescript to javascript using esbuild in the CDK stack code.
 *
 * Since this is an inline tool, the code we inline on the tool must be just a single function
 * with no imports or other code.  This is because the code will be executed directly by the agent.
 *
 * @param event - The event object containing the invocation input.
 * @param params - The parameters object that was passed into the event, turned into a map of parameter names to values for your convenience.
 * @returns The random number to give back to the agent.
 */
function random(event: ActionGroupInvocationInput, params: Record<string, any>) {
    console.log('Random number generator tool called with params:', params);

    let min = params.min;
    let max = params.max;
    let range = max - min;
    let val = Math.random() * range + min;
    let factor = Math.pow(10, params.precision ?? 0);
    return Math.round(val * factor) / factor;
}
