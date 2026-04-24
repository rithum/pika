import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { jest } from '@jest/globals';
import { getTitleFromBedrockIfNeeded } from '../../src/lib/bedrock-agent';
import { MODELS } from '../../src/lib/model-types-utils';

function encodedBedrockResponse(text: string) {
    return { body: new TextEncoder().encode(JSON.stringify({ content: [{ text }] })) };
}

// Spy on the prototype send method so all BedrockRuntimeClient instances use our mock
const sendSpy = jest.spyOn(BedrockRuntimeClient.prototype, 'send');

describe('getTitleFromBedrockIfNeeded', () => {
    beforeEach(() => {
        sendSpy.mockReset();
    });

    it('returns the generated title from Bedrock response', async () => {
        sendSpy.mockResolvedValue(encodedBedrockResponse('Order Status Inquiry') as never);

        const title = await getTitleFromBedrockIfNeeded('What is my order status?', 'Your order shipped yesterday.');

        expect(title).toBe('Order Status Inquiry');
        expect(sendSpy).toHaveBeenCalledTimes(1);
    });

    it('includes user question and answer in the prompt sent to Bedrock', async () => {
        sendSpy.mockResolvedValue(encodedBedrockResponse('Test Title') as never);

        await getTitleFromBedrockIfNeeded('my specific question', 'the detailed answer');

        const invokeCommand = sendSpy.mock.calls[0][0] as any;
        const body = JSON.parse(invokeCommand.input.body);
        expect(body.messages[0].content[0].text).toContain('my specific question');
        expect(body.messages[0].content[0].text).toContain('the detailed answer');
    });

    it('uses Haiku model via resolveModelId (not the default Sonnet model)', async () => {
        sendSpy.mockResolvedValue(encodedBedrockResponse('Test Title') as never);

        await getTitleFromBedrockIfNeeded('question', 'answer');

        const invokeCommand = sendSpy.mock.calls[0][0] as any;
        // Should use the Haiku model ID (possibly resolved to inference profile ARN)
        expect(invokeCommand.input.modelId).toContain('haiku');
    });

    it('does not pass top_p or top_k (incompatible with Claude 4.5 models)', async () => {
        sendSpy.mockResolvedValue(encodedBedrockResponse('Test Title') as never);

        await getTitleFromBedrockIfNeeded('question', 'answer');

        const invokeCommand = sendSpy.mock.calls[0][0] as any;
        const body = JSON.parse(invokeCommand.input.body);
        expect(body.top_p).toBeUndefined();
        expect(body.top_k).toBeUndefined();
    });

    it('throws when Bedrock API call fails', async () => {
        sendSpy.mockRejectedValue(new Error('ValidationException: The provided model identifier is invalid.') as never);

        await expect(getTitleFromBedrockIfNeeded('question', 'answer')).rejects.toThrow('model identifier is invalid');
    });

    it('throws with descriptive message when Bedrock returns empty content array', async () => {
        sendSpy.mockResolvedValue({ body: new TextEncoder().encode(JSON.stringify({ content: [] })) } as never);

        await expect(getTitleFromBedrockIfNeeded('question', 'answer')).rejects.toThrow('unexpected response structure');
    });

    it('throws when Bedrock returns null content', async () => {
        sendSpy.mockResolvedValue({ body: new TextEncoder().encode(JSON.stringify({ content: null })) } as never);

        await expect(getTitleFromBedrockIfNeeded('question', 'answer')).rejects.toThrow('unexpected response structure');
    });

    it('throws when Bedrock returns malformed JSON', async () => {
        sendSpy.mockResolvedValue({ body: new TextEncoder().encode('not valid json') } as never);

        await expect(getTitleFromBedrockIfNeeded('question', 'answer')).rejects.toThrow();
    });
});
