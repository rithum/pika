import { handler } from '../../src/lambda/agent-post-processor/index';

describe('agent-post-processor', () => {
    it('extracts text from old direct format: {content: [{text}]}', async () => {
        const invokeModelRawResponse = JSON.stringify({
            content: [
                {
                    text: '<final_response>Hello from the agent.</final_response>'
                }
            ]
        });

        const result = await handler({ invokeModelRawResponse });

        expect(result.postProcessingParsedResponse.responseText).toBe('Hello from the agent.');
    });

    it('extracts text from Converse API envelope format: {output: {message: {content: [{text}]}}}', async () => {
        const invokeModelRawResponse = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [
                        {
                            text: '<final_response>Hello from the new model.</final_response>',
                            image: null,
                            document: null,
                            video: null
                        }
                    ]
                }
            },
            stopReason: 'end_turn',
            usage: { inputTokens: 100, outputTokens: 50 }
        });

        const result = await handler({ invokeModelRawResponse });

        expect(result.postProcessingParsedResponse.responseText).toBe('Hello from the new model.');
    });

    it('extracts collaborator content from AgentCommunication__sendMessage inside <final_response>', async () => {
        // This is the actual failure case: the <final_response> contains a full Converse API envelope
        // with a toolUse block wrapping the collaborator's text
        const collaboratorEnvelope = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [
                        {
                            text: null,
                            image: null,
                            document: null,
                            video: null,
                            toolUse: {
                                toolUseId: 'tooluse_abc123',
                                name: 'AgentCommunication__sendMessage',
                                input: {
                                    recipient: 'User',
                                    content: '## Recent Orders Summary\n\n- Total Orders: 48\n- Shipped: 16'
                                }
                            }
                        }
                    ]
                }
            },
            stopReason: 'tool_use',
            usage: { inputTokens: 3314, outputTokens: 735 }
        });

        const invokeModelRawResponse = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [
                        {
                            text: `<final_response>\n${collaboratorEnvelope}\n</final_response>`,
                            image: null,
                            document: null,
                            video: null
                        }
                    ]
                }
            },
            stopReason: 'end_turn',
            usage: { inputTokens: 1024, outputTokens: 963 }
        });

        const result = await handler({ invokeModelRawResponse });

        expect(result.postProcessingParsedResponse.responseText).toBe(
            '## Recent Orders Summary\n\n- Total Orders: 48\n- Shipped: 16'
        );
    });

    it('extracts collaborator content with chart data preserving JSON structure', async () => {
        const chartJson = JSON.stringify({
            type: 'bar',
            data: { labels: ['Shipped', 'Pending'], datasets: [{ data: [16, 2] }] }
        });
        const collaboratorContent = `## Orders\n\n<chart>${chartJson}</chart>\n\nDone.`;

        const collaboratorEnvelope = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [
                        {
                            text: null,
                            toolUse: {
                                toolUseId: 'tooluse_xyz',
                                name: 'AgentCommunication__sendMessage',
                                input: { recipient: 'User', content: collaboratorContent }
                            }
                        }
                    ]
                }
            },
            stopReason: 'tool_use',
            usage: { inputTokens: 500, outputTokens: 200 }
        });

        const invokeModelRawResponse = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [{ text: `<final_response>${collaboratorEnvelope}</final_response>` }]
                }
            },
            stopReason: 'end_turn',
            usage: { inputTokens: 100, outputTokens: 50 }
        });

        const result = await handler({ invokeModelRawResponse });

        expect(result.postProcessingParsedResponse.responseText).toBe(collaboratorContent);
        // Verify the chart JSON is intact and parseable
        const chartMatch = result.postProcessingParsedResponse.responseText!.match(/<chart>(.*?)<\/chart>/s);
        expect(chartMatch).not.toBeNull();
        expect(() => JSON.parse(chartMatch![1])).not.toThrow();
    });

    it('passes through plain text inside <final_response> when not a JSON envelope', async () => {
        const invokeModelRawResponse = JSON.stringify({
            content: [
                {
                    text: '<final_response>Just a plain text response with no JSON.</final_response>'
                }
            ]
        });

        const result = await handler({ invokeModelRawResponse });

        expect(result.postProcessingParsedResponse.responseText).toBe(
            'Just a plain text response with no JSON.'
        );
    });

    it('throws when no <final_response> tags found', async () => {
        const invokeModelRawResponse = JSON.stringify({
            content: [{ text: 'No final response tags here.' }]
        });

        await expect(handler({ invokeModelRawResponse })).rejects.toThrow('no <final_response> tags found');
    });

    it('falls back to raw string when invokeModelRawResponse is not valid JSON', async () => {
        const invokeModelRawResponse = '<final_response>Fallback text.</final_response>';

        const result = await handler({ invokeModelRawResponse });

        expect(result.postProcessingParsedResponse.responseText).toBe('Fallback text.');
    });
});
