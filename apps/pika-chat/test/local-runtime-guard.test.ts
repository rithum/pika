import { describe, it, expect } from '@jest/globals';
import { isDeployedRuntime } from '../src/lib/server/local-runtime-guard';

describe('isDeployedRuntime', () => {
    it('is false with an empty env', () => {
        expect(isDeployedRuntime({})).toBe(false);
    });

    it.each(['ECS_CONTAINER_METADATA_URI', 'ECS_CONTAINER_METADATA_URI_V4', 'AWS_EXECUTION_ENV', 'AWS_LAMBDA_FUNCTION_NAME'])('is true when %s is set', (key) => {
        expect(isDeployedRuntime({ [key]: 'x' })).toBe(true);
    });
});
