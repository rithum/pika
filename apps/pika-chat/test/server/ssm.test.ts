import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { DeleteParameterCommand, GetParametersByPathCommand, ParameterNotFound, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

jest.mock('$lib/server/config', () => ({
    appConfig: { awsRegion: 'us-east-1' }
}));

import { deleteValueFromParameterStore, getParametersByPath, putValueToParameterStore } from '../../src/lib/server/ssm';

const PARAM_NAME = '/test-app/example';

describe('ssm helpers', () => {
    let sendSpy: jest.SpiedFunction<typeof SSMClient.prototype.send>;

    beforeEach(() => {
        sendSpy = jest.spyOn(SSMClient.prototype, 'send').mockResolvedValue({} as never);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function sentCommand<T>(): T {
        expect(sendSpy).toHaveBeenCalledTimes(1);
        return sendSpy.mock.calls[0][0] as T;
    }

    it('puts a String parameter with Overwrite', async () => {
        await putValueToParameterStore(PARAM_NAME, 'v');
        const command = sentCommand<PutParameterCommand>();
        expect(command).toBeInstanceOf(PutParameterCommand);
        expect(command.input).toEqual({ Name: PARAM_NAME, Value: 'v', Type: 'String', Overwrite: true });
    });

    it('puts a SecureString parameter when secure is set', async () => {
        await putValueToParameterStore(PARAM_NAME, 'v', { secure: true });
        expect(sentCommand<PutParameterCommand>().input.Type).toBe('SecureString');
    });

    it('deletes a parameter', async () => {
        await deleteValueFromParameterStore(PARAM_NAME);
        const command = sentCommand<DeleteParameterCommand>();
        expect(command).toBeInstanceOf(DeleteParameterCommand);
        expect(command.input).toEqual({ Name: PARAM_NAME });
    });

    it('swallows ParameterNotFound on delete', async () => {
        sendSpy.mockRejectedValue(new ParameterNotFound({ message: 'missing', $metadata: {} }) as never);
        await expect(deleteValueFromParameterStore(PARAM_NAME)).resolves.toBeUndefined();
    });

    it('rethrows other delete errors', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const failure = new Error('AccessDenied');
        sendSpy.mockRejectedValue(failure as never);
        await expect(deleteValueFromParameterStore(PARAM_NAME)).rejects.toBe(failure);
    });

    it('lists recursively by default', async () => {
        await getParametersByPath('/test-app/');
        const command = sentCommand<GetParametersByPathCommand>();
        expect(command).toBeInstanceOf(GetParametersByPathCommand);
        expect(command.input.Recursive).toBe(true);
    });

    it('lists non-recursively when asked', async () => {
        await getParametersByPath('/test-app/', false);
        expect(sentCommand<GetParametersByPathCommand>().input.Recursive).toBe(false);
    });
});
