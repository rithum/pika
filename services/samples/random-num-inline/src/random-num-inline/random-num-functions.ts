/**
 * Random number generator tool functions.
 * This is the functions that will be used to generate the random number.
 * It will be used to generate the random number and return it to the agent.
 */

import { FunctionDefinition } from '@aws-sdk/client-bedrock-agent-runtime';

export const randomNumFunctions: FunctionDefinition[] = [
    {
        name: 'random-number',
        description: 'Creates an random number between min and max.',
        parameters: {
            max: {
                description: 'max value (exclusive)',
                required: true,
                type: 'number'
            },
            min: {
                description: 'min value (inclusive)',
                required: true,
                type: 'number'
            },
            precision: {
                description: 'number of decimal places to include (default 0)',
                required: false,
                type: 'number'
            }
        },
        requireConfirmation: 'DISABLED'
    }
];
