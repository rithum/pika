import { extractTextFromRawResponse } from '../../src/lib/bedrock-agent';

describe('extractTextFromRawResponse', () => {
    it('returns plain text chunks unchanged', () => {
        const plainText = 'Hello, how can I help you today?';
        expect(extractTextFromRawResponse(plainText)).toBe(plainText);
    });

    it('returns markdown content unchanged', () => {
        const markdown = '## Here are some suggestions\n\n- Option A\n- Option B';
        expect(extractTextFromRawResponse(markdown)).toBe(markdown);
    });

    it('returns empty string unchanged', () => {
        expect(extractTextFromRawResponse('')).toBe('');
    });

    it('extracts text from AgentCommunication__sendMessage tool use', () => {
        const rawResponse = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [
                        {
                            text: null,
                            toolUse: {
                                toolUseId: 'tooluse_abc123',
                                name: 'AgentCommunication__sendMessage',
                                input: {
                                    recipient: 'User',
                                    content: 'Here is the formatted response from the collaborator agent.'
                                }
                            }
                        }
                    ]
                }
            },
            stopReason: 'tool_use',
            usage: { inputTokens: 6408, outputTokens: 215 }
        });

        expect(extractTextFromRawResponse(rawResponse)).toBe(
            'Here is the formatted response from the collaborator agent.'
        );
    });

    it('extracts text from plain text content blocks', () => {
        const rawResponse = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [{ text: 'Direct text response from the model.' }]
                }
            },
            stopReason: 'end_turn',
            usage: { inputTokens: 100, outputTokens: 20 }
        });

        expect(extractTextFromRawResponse(rawResponse)).toBe('Direct text response from the model.');
    });

    it('joins multiple content blocks with newlines', () => {
        const rawResponse = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [
                        { text: 'First part.' },
                        {
                            toolUse: {
                                toolUseId: 'tooluse_xyz',
                                name: 'AgentCommunication__sendMessage',
                                input: { recipient: 'User', content: 'Second part from collaborator.' }
                            }
                        }
                    ]
                }
            },
            stopReason: 'tool_use',
            usage: { inputTokens: 500, outputTokens: 100 }
        });

        expect(extractTextFromRawResponse(rawResponse)).toBe('First part.\nSecond part from collaborator.');
    });

    it('returns original chunk when JSON has no recognizable content blocks', () => {
        const rawResponse = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [{ image: { format: 'png', source: {} } }]
                }
            },
            stopReason: 'end_turn',
            usage: { inputTokens: 100, outputTokens: 50 }
        });

        expect(extractTextFromRawResponse(rawResponse)).toBe(rawResponse);
    });

    it('returns original chunk for non-Converse JSON (no output.message.content)', () => {
        const otherJson = JSON.stringify({ key: 'value', nested: { data: true } });
        expect(extractTextFromRawResponse(otherJson)).toBe(otherJson);
    });

    it('returns original chunk for malformed JSON starting with {', () => {
        const malformed = '{"output":{"message": broken json here';
        expect(extractTextFromRawResponse(malformed)).toBe(malformed);
    });

    it('handles content blocks with null text fields gracefully', () => {
        const rawResponse = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [
                        {
                            text: null,
                            toolUse: {
                                toolUseId: 'tooluse_abc',
                                name: 'AgentCommunication__sendMessage',
                                input: { recipient: 'User', content: 'The actual message.' }
                            }
                        }
                    ]
                }
            },
            stopReason: 'tool_use',
            usage: { inputTokens: 200, outputTokens: 50 }
        });

        expect(extractTextFromRawResponse(rawResponse)).toBe('The actual message.');
    });

    it('ignores tool use blocks that are not AgentCommunication__sendMessage', () => {
        const rawResponse = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [
                        {
                            toolUse: {
                                toolUseId: 'tooluse_abc',
                                name: 'SomeOtherTool__doSomething',
                                input: { data: 'not a message' }
                            }
                        },
                        { text: 'Visible text.' }
                    ]
                }
            },
            stopReason: 'tool_use',
            usage: { inputTokens: 300, outputTokens: 80 }
        });

        expect(extractTextFromRawResponse(rawResponse)).toBe('Visible text.');
    });

    it('returns original chunk when content is not an array', () => {
        const rawResponse = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: 'just a string'
                }
            },
            stopReason: 'end_turn'
        });

        expect(extractTextFromRawResponse(rawResponse)).toBe(rawResponse);
    });
});
