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

    it('extracts content from a complete JSON envelope with trailing error message', () => {
        // When the outer catch appends "Oops!" after the raw JSON, the safety net
        // receives the full JSON + suffix. Since JSON.parse will fail on the combined
        // string, it falls back to returning the original — the safety net works
        // correctly only when responseMsg is pure JSON (no suffix yet).
        const rawJson = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [
                        {
                            text: null,
                            toolUse: {
                                toolUseId: 'tooluse_abc',
                                name: 'AgentCommunication__sendMessage',
                                input: { recipient: 'User', content: 'Clean response.' }
                            }
                        }
                    ]
                }
            },
            stopReason: 'tool_use'
        });

        // Pure JSON envelope — safety net extracts content
        expect(extractTextFromRawResponse(rawJson)).toBe('Clean response.');

        // JSON + trailing error — JSON.parse fails, returns original unchanged
        const withOops = rawJson + '\nOops! Something glitched on my end.';
        expect(extractTextFromRawResponse(withOops)).toBe(withOops);
    });

    it('handles the real-world collaborator response from session investigations', () => {
        // Simulates the actual structure seen in DDB for session 019d4b9f
        const rawResponse = JSON.stringify({
            output: {
                message: {
                    role: 'assistant',
                    content: [
                        {
                            text: "I've received the analysis of your Q2 2025 order trends.",
                            image: null,
                            toolUse: null
                        },
                        {
                            text: '# Q2 2025 Order Trends Analysis\n\n**Total Orders:** 169\n\n<chart>{"type":"bar","data":{"labels":["Apr","May","Jun"],"datasets":[{"data":[26,58,85]}]}}</chart>\n\n<prompt>Compare Q2 to Q1</prompt>',
                            image: null,
                            toolUse: null
                        }
                    ]
                }
            },
            stopReason: 'tool_use',
            usage: { inputTokens: 5539, outputTokens: 1508 }
        });

        const result = extractTextFromRawResponse(rawResponse);
        expect(result).toBe(
            "I've received the analysis of your Q2 2025 order trends.\n" +
                '# Q2 2025 Order Trends Analysis\n\n**Total Orders:** 169\n\n<chart>{"type":"bar","data":{"labels":["Apr","May","Jun"],"datasets":[{"data":[26,58,85]}]}}</chart>\n\n<prompt>Compare Q2 to Q1</prompt>'
        );
        // Content should NOT contain raw JSON envelope fragments
        expect(result).not.toContain('"stopReason"');
        expect(result).not.toContain('"inputTokens"');
    });

    it('handles Bedrock streaming JSON with unescaped newlines inside string values', () => {
        // Bedrock inline-agent collaborator streaming produces JSON with raw newline
        // characters (0x0A) inside string values instead of proper JSON escapes (\\n).
        // This is invalid JSON per spec but we must handle it.
        const rawWithNewlines =
            '{"output":{"message":{"role":"assistant","content":[{"text":"# Stock Analysis\n\n## Key Findings\n\n- Item A: 50 units\n- Item B: 30 units","image":null,"toolUse":null}]}},"stopReason":"end_turn","usage":{"inputTokens":100,"outputTokens":50}}';

        const result = extractTextFromRawResponse(rawWithNewlines);
        expect(result).toBe('# Stock Analysis\n\n## Key Findings\n\n- Item A: 50 units\n- Item B: 30 units');
        expect(result).not.toContain('"stopReason"');
    });

    it('handles Bedrock JSON with mixed escaped and unescaped newlines', () => {
        // Real-world case: some newlines are properly escaped (\\n) and some are raw (0x0A)
        const raw =
            '{"output":{"message":{"role":"assistant","content":[{"text":"Line 1\\nLine 2\nLine 3","image":null}]}},"stopReason":"end_turn"}';

        const result = extractTextFromRawResponse(raw);
        expect(result).toBe('Line 1\nLine 2\nLine 3');
    });
});
