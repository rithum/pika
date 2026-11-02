import fixtures from './fixtures/post-processor-5x.json';
import { handler } from '../../src/lambda/agent-post-processor';

describe('agent-post-processor', () => {
    it.each(fixtures)('extracts responseText from $name', async ({ invokeModelRawResponse, expectedResponseText }) => {
        const result = await handler({ invokeModelRawResponse } as any);
        expect(result.postProcessingParsedResponse.responseText).toBe(expectedResponseText);
    });

    it('parses the direct format', async () => {
        const result = await handler({ invokeModelRawResponse: JSON.stringify({ content: [{ text: '<final_response>x</final_response>' }] }) } as any);
        expect(result.postProcessingParsedResponse.responseText).toBe('x');
    });
});
