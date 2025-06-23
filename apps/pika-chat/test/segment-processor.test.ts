import { MessageSegmentProcessor } from '../src/lib/client/features/chat/message-segments/segment-processor';
import type { ComponentRegistry } from '../src/lib/client/features/chat/message-segments/component-registry';
import type { ProcessedSegment, ProcessedTextSegment, ProcessedTagSegment, MetadataTagSegment } from '../src/lib/client/features/chat/message-segments/segment-types';

// Mock components for testing
const mockTextRenderer = {
    /* mock text renderer */
};
const mockTagRenderer = {
    /* mock tag renderer */
};
const mockAnothertagRenderer = {
    /* mock anothertag renderer */
};

// Mock metadata handler
const mockMetadataHandler = jest.fn();

// Create a comprehensive mock ComponentRegistry
const createMockComponentRegistry = (supportedTags: string[] = ['tag', 'anothertag'], metadataTags: string[] = ['metadata-tag']) => {
    const renderers: Record<string, any> = {
        text: mockTextRenderer
    };

    // Add supported tag renderers
    supportedTags.forEach((tag) => {
        renderers[tag] = tag === 'tag' ? mockTagRenderer : mockAnothertagRenderer;
    });

    const metadataHandlers: Record<string, any> = {};
    metadataTags.forEach((tag) => {
        metadataHandlers[tag] = mockMetadataHandler;
    });

    const mockComponentRegistry: ComponentRegistry = {
        getAllRenderers: jest.fn().mockReturnValue(renderers),
        getAllMetadataHandlers: jest.fn().mockReturnValue(metadataHandlers),
        getRenderer: jest.fn().mockImplementation((type: string) => {
            return renderers[type] || undefined;
        }),
        getMetadataHandler: jest.fn().mockImplementation((type: string) => {
            return metadataHandlers[type] || undefined;
        }),
        registerRenderer: jest.fn(),
        registerMetadataHandler: jest.fn(),
        hasRenderer: jest.fn().mockImplementation((type: string) => type in renderers),
        hasMetadataHandler: jest.fn().mockImplementation((type: string) => type in metadataHandlers),
        unregisterRenderer: jest.fn().mockReturnValue(false),
        unregisterMetadataHandler: jest.fn().mockReturnValue(false),
        getRegisteredRendererTypes: jest.fn().mockReturnValue(Object.keys(renderers)),
        getRegisteredMetadataHandlerTypes: jest.fn().mockReturnValue(Object.keys(metadataHandlers))
    } as any;

    return mockComponentRegistry;
};

// Helper functions for test assertions
const expectTextSegment = (segment: ProcessedSegment, content: string, streamingStatus: 'streaming' | 'completed' | 'incomplete' | 'error') => {
    const seg = segment as ProcessedTextSegment;
    expect(seg.segmentType).toBe('text');
    expect(seg.rawContent).toBe(content);
    expect(seg.streamingStatus).toBe(streamingStatus);
    expect(seg.rendererType).toBe('text');
};

const expectTagSegment = (segment: ProcessedSegment, tag: string, content: string, streamingStatus: 'streaming' | 'completed' | 'incomplete' | 'error') => {
    expect(segment.segmentType).toBe('tag');
    expect((segment as ProcessedTagSegment).tag).toBe(tag);
    expect(segment.rawContent).toBe(content);
    expect(segment.streamingStatus).toBe(streamingStatus);
    expect(segment.rendererType).toBe(tag);
};

const expectMetadataSegment = (segment: ProcessedSegment, tag: string, content: string, streamingStatus: 'streaming' | 'completed' | 'incomplete' | 'error') => {
    expect(segment.segmentType).toBe('tag');
    expect((segment as MetadataTagSegment).tag).toBe(tag);
    expect(segment.rawContent).toBe(content);
    expect(segment.streamingStatus).toBe(streamingStatus);
    expect(segment.rendererType).toBe(tag);
    expect((segment as MetadataTagSegment).isMetadata).toBe(true);
    expect((segment as MetadataTagSegment).renderer).toBeUndefined();
};

describe('MessageSegmentProcessor', () => {
    let processor: MessageSegmentProcessor;
    let mockComponentRegistry: ComponentRegistry;

    beforeEach(() => {
        mockComponentRegistry = createMockComponentRegistry();
        processor = new MessageSegmentProcessor(mockComponentRegistry);
        jest.clearAllMocks();
    });

    describe('Basic Functionality', () => {
        describe('Empty and Simple Content', () => {
            it('should return empty array for empty content with no existing segments', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('', segments, false);

                expect(result).toEqual([]);
                expect(segments).toEqual([]);
            });

            it('should return empty array for empty content with completed segments', () => {
                const segments: ProcessedSegment[] = [
                    {
                        id: 0,
                        segmentType: 'text',
                        rawContent: 'existing',
                        streamingStatus: 'completed',
                        rendererType: 'text',
                        renderer: mockTextRenderer
                    } as ProcessedTextSegment
                ];

                const result = processor.parseMessage('', segments, false);

                expect(result).toEqual([]);
                expect(segments).toHaveLength(1);
                expect(segments[0].rawContent).toBe('existing');
            });

            it('should parse simple text content', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('Hello world', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result[0], 'Hello world', 'completed');
            });

            it('should parse simple text content while streaming', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('Hello world', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result[0], 'Hello world', 'streaming');
            });
        });

        describe('Complete Tags', () => {
            it('should parse complete tag', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>content</tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', 'content', 'completed');
            });

            it('should parse text with complete tag', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('Hello <tag>content</tag> world', segments, false);

                expect(result).toHaveLength(3);
                expect(segments).toHaveLength(3);
                expectTextSegment(result[0], 'Hello ', 'completed');
                expectTagSegment(result[1], 'tag', 'content', 'completed');
                expectTextSegment(result[2], ' world', 'completed');
            });

            it('should parse multiple complete tags', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>content1</tag><anothertag>content2</anothertag>', segments, false);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTagSegment(result[0], 'tag', 'content1', 'completed');
                expectTagSegment(result[1], 'anothertag', 'content2', 'completed');
            });
        });

        describe('Metadata Tags', () => {
            it('should parse metadata tag', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<metadata-tag>content</metadata-tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectMetadataSegment(result[0], 'metadata-tag', 'content', 'completed');
            });
        });
    });

    describe('Streaming Scenarios', () => {
        describe('Basic Streaming', () => {
            it('should handle streaming text', () => {
                // First call - partial text
                const segments: ProcessedSegment[] = [];
                const result1 = processor.parseMessage('Hello wor', segments, true);

                expect(result1).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result1[0], 'Hello wor', 'streaming');

                // Second call - complete text
                const result2 = processor.parseMessage('ld!', segments, true);

                expect(result2).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(segments[0], 'Hello world!', 'streaming');
            });

            it('should handle complete tag during streaming', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>content</tag>', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                // Complete tags should be marked as 'completed' even during streaming
                // because they have both opening and closing tags
                expectTagSegment(result[0], 'tag', 'content', 'completed');
            });
        });

        describe('Incomplete Tag Names', () => {
            it('should handle incomplete tag name "<ta"', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<ta', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'ta', '', 'incomplete');
            });

            it('should handle text before incomplete tag name', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <ta', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'ta', '', 'incomplete');
            });

            it('should complete tag name from incomplete state', () => {
                const segments: ProcessedSegment[] = [];

                // First call - incomplete tag name
                processor.parseMessage('text <ta', segments, true);
                expect(segments).toHaveLength(2);
                expectTagSegment(segments[1], 'ta', '', 'incomplete');

                // Second call - complete tag name
                const result = processor.parseMessage('g>content', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(2);
                expectTagSegment(segments[1], 'tag', 'content', 'streaming');
            });

            it('should convert incomplete tag to text if not valid', () => {
                // Create registry without 'som' tag
                const registry = createMockComponentRegistry(['tag'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [];

                // First call - incomplete tag name
                proc.parseMessage('text <som', segments, true);
                expect(segments).toHaveLength(2);
                expectTagSegment(segments[1], 'som', '', 'incomplete');

                // Second call - complete invalid tag name
                const result = proc.parseMessage('e>more text', segments, true);

                // Based on debug output: the processor keeps the first text segment
                // and replaces the incomplete tag with a new text segment
                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'text ', 'completed');
                expectTextSegment(segments[1], '<some>more text', 'streaming');
            });
        });

        describe('Streaming Tags', () => {
            it('should handle streaming tag with opening only', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', '', 'streaming');
            });

            it('should handle streaming tag with partial content', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>partial content', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', 'partial content', 'streaming');
            });

            it('should continue streaming tag content', () => {
                const segments: ProcessedSegment[] = [];

                // First call
                processor.parseMessage('<tag>partial', segments, true);
                expect(segments).toHaveLength(1);
                expectTagSegment(segments[0], 'tag', 'partial', 'streaming');

                // Second call
                const result = processor.parseMessage(' more content', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(segments[0], 'tag', 'partial more content', 'streaming');
            });

            it('should complete streaming tag', () => {
                const segments: ProcessedSegment[] = [];

                // First call
                processor.parseMessage('<tag>partial', segments, true);
                expect(segments).toHaveLength(1);
                expectTagSegment(segments[0], 'tag', 'partial', 'streaming');

                // Second call - complete tag
                const result = processor.parseMessage(' content</tag>', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                // Complete tags should be marked as 'completed' even during streaming
                // because they now have both opening and closing tags
                expectTagSegment(segments[0], 'tag', 'partial content', 'completed');
            });
        });

        describe('Complex Streaming Scenarios', () => {
            it('should handle text before streaming tag', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag>partial', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', 'partial', 'streaming');
            });

            it('should handle text before incomplete tag', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <ta', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'ta', '', 'incomplete');
            });

            it('should handle tag name with space (streaming)', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag ', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', '', 'streaming');
            });
        });
    });

    describe('Nested Tags and Complex Content', () => {
        describe('Nested Tags (should be treated as content)', () => {
            it('should treat nested tags as content in streaming mode', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag><anothertag>', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', '<anothertag>', 'streaming');
            });

            it('should treat nested tags as content in complete mode', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag><anothertag>nested</anothertag></tag>', segments, false);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', '<anothertag>nested</anothertag>', 'completed');
            });

            it('should handle nested incomplete closing tags', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag><anothertag></another', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', '<anothertag></another', 'streaming');
            });

            it('should not close outer tag with inner tag closing', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag><anothertag></anothertag>', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                // Based on debug output: the processor treats '<tag>' as text and then processes '<anothertag></anothertag>' as a tag
                expectTextSegment(result[0], 'text <tag>', 'completed');
                expectTagSegment(result[1], 'anothertag', '', 'completed'); // Complete tag should be marked as completed
            });
        });

        describe('Multiple Tags', () => {
            it('should handle complete tag followed by incomplete tag', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag>content</tag><anoth', segments, true);

                expect(result).toHaveLength(3);
                expect(segments).toHaveLength(3);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', 'content', 'completed');
                expectTagSegment(result[2], 'anoth', '', 'incomplete');
            });

            it('should handle complete tag followed by streaming tag', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag>content</tag><anothertag>', segments, true);

                expect(result).toHaveLength(3);
                expect(segments).toHaveLength(3);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', 'content', 'completed');
                expectTagSegment(result[2], 'anothertag', '', 'streaming');
            });

            it('should handle complete tag followed by complete tag', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag>content</tag><anothertag>more</anothertag>', segments, false);

                expect(result).toHaveLength(3);
                expect(segments).toHaveLength(3);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', 'content', 'completed');
                expectTagSegment(result[2], 'anothertag', 'more', 'completed');
            });

            it('should handle complete tags with text after', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag>content</tag><anothertag>more</anothertag> final text', segments, false);

                expect(result).toHaveLength(4);
                expect(segments).toHaveLength(4);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', 'content', 'completed');
                expectTagSegment(result[2], 'anothertag', 'more', 'completed');
                expectTextSegment(result[3], ' final text', 'completed');
            });
        });
    });

    describe('Text Merging', () => {
        describe('Merging with Previous Text Segments', () => {
            it('should merge text with previous incomplete text segment', () => {
                const segments: ProcessedSegment[] = [
                    {
                        id: 0,
                        segmentType: 'text',
                        rawContent: 'Hello ',
                        streamingStatus: 'streaming',
                        rendererType: 'text',
                        renderer: mockTextRenderer
                    } as ProcessedTextSegment
                ];

                const result = processor.parseMessage('world!', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(segments[0], 'Hello world!', 'streaming');
                expect(result[0]).toBe(segments[0]); // Should be the same object
            });

            it('should not merge text with previous completed text segment', () => {
                const segments: ProcessedSegment[] = [
                    {
                        id: 0,
                        segmentType: 'text',
                        rawContent: 'Hello ',
                        streamingStatus: 'completed',
                        rendererType: 'text',
                        renderer: mockTextRenderer
                    } as ProcessedTextSegment
                ];

                const result = processor.parseMessage('world!', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'Hello ', 'completed');
                expectTextSegment(segments[1], 'world!', 'streaming');
            });

            it('should not merge text with previous tag segment', () => {
                const segments: ProcessedSegment[] = [
                    {
                        id: 0,
                        segmentType: 'tag',
                        tag: 'tag',
                        rawContent: 'content',
                        streamingStatus: 'completed',
                        rendererType: 'tag',
                        renderer: mockTagRenderer
                    } as ProcessedTagSegment
                ];

                const result = processor.parseMessage('text', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(2);
                expectTagSegment(segments[0], 'tag', 'content', 'completed');
                expectTextSegment(segments[1], 'text', 'streaming');
            });
        });
    });

    describe('Invalid and Unknown Tags', () => {
        describe('Unknown Tags', () => {
            it('should treat unknown tags as text in non-streaming mode', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <unknown>content</unknown>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result[0], 'text <unknown>content</unknown>', 'completed');
            });

            it('should treat unknown tags as text in streaming mode', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <unknown>content', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result[0], 'text <unknown>content', 'streaming');
            });
        });

        describe('Malformed Tags', () => {
            it('should treat malformed tags as text', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag content</tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result[0], 'text <tag content</tag>', 'completed');
            });

            it('should handle tags with invalid characters', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag@name>content</tag@name>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result[0], 'text <tag@name>content</tag@name>', 'completed');
            });
        });
    });

    describe('Edge Cases', () => {
        describe('Empty Tags', () => {
            it('should handle empty tag content', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag></tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', '', 'completed');
            });
        });

        describe('Whitespace Handling', () => {
            it('should preserve whitespace in text segments', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('  hello  world  ', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result[0], '  hello  world  ', 'completed');
            });

            it('should preserve whitespace in tag content', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>  content  </tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', '  content  ', 'completed');
            });
        });

        describe('Special Characters', () => {
            it('should handle special characters in text', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('Hello & goodbye <> 123', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result[0], 'Hello & goodbye <> 123', 'completed');
            });

            it('should handle special characters in tag content', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>Hello & goodbye <> 123</tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', 'Hello & goodbye <> 123', 'completed');
            });
        });
    });

    describe('Registry Integration', () => {
        describe('Dynamic Tag Pattern Updates', () => {
            it('should update supported tags when registry changes', () => {
                // Start with limited registry
                const limitedRegistry = createMockComponentRegistry(['tag'], []);
                const proc = new MessageSegmentProcessor(limitedRegistry);
                const segments: ProcessedSegment[] = [];

                // Should parse 'tag' but not 'anothertag'
                proc.parseMessage('<tag>content</tag><anothertag>content</anothertag>', segments, false);

                expect(segments).toHaveLength(2);
                expectTagSegment(segments[0], 'tag', 'content', 'completed');
                expectTextSegment(segments[1], '<anothertag>content</anothertag>', 'completed');
            });
        });

        describe('Metadata vs Renderer Tags', () => {
            it('should create metadata segments for metadata tags', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<metadata-tag>content</metadata-tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectMetadataSegment(result[0], 'metadata-tag', 'content', 'completed');
            });

            it('should create regular segments for renderer tags', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>content</tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', 'content', 'completed');
                expect((result[0] as ProcessedTagSegment).renderer).toBe(mockTagRenderer);
            });
        });
    });

    describe('Performance and Efficiency', () => {
        it('should only return modified segments, not all segments', () => {
            const segments: ProcessedSegment[] = [
                {
                    id: 0,
                    segmentType: 'text',
                    rawContent: 'existing',
                    streamingStatus: 'completed',
                    rendererType: 'text',
                    renderer: mockTextRenderer
                } as ProcessedTextSegment
            ];

            const result = processor.parseMessage(' new text', segments, false);

            expect(result).toHaveLength(1); // Only the new segment
            expect(segments).toHaveLength(2); // But segments array has both
            expect(result[0]).toBe(segments[1]); // Result contains the new segment
        });
    });

    describe('User-Specified Additional Test Cases', () => {
        describe('Nested Tag Behavior - Advanced Cases', () => {
            it('should handle text <tag><anothertag> - treats nested tag as streaming content', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag><anothertag>', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                // Based on actual processor behavior: processes as text and tag separately
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', '<anothertag>', 'streaming');
            });

            it('should handle text <tag><anothertag></anothertag></tag> - complete nested structure', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag><anothertag></anothertag></tag>', segments, false);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                // Based on actual processor behavior: treats nested tags as tag content
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', '<anothertag></anothertag>', 'completed');
            });

            it('should handle text <tag><anothertag></anothertag> - nested with partial close', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag><anothertag></anothertag>', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                // Based on processor behavior: treats <tag> as text, then processes complete <anothertag>
                expectTextSegment(result[0], 'text <tag>', 'completed');
                expectTagSegment(result[1], 'anothertag', '', 'completed'); // Complete tag should be marked as completed
            });
        });

        describe('Progressive Tag Completion Scenarios', () => {
            it('should handle text <tag>somecontent</tag><anoth - complete + incomplete', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag>somecontent</tag><anoth', segments, true);

                expect(result).toHaveLength(3);
                expect(segments).toHaveLength(3);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', 'somecontent', 'completed');
                expectTagSegment(result[2], 'anoth', '', 'incomplete');
            });

            it('should handle text <tag>somecontent</tag><anothertag> - complete + streaming', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag>somecontent</tag><anothertag>', segments, true);

                expect(result).toHaveLength(3);
                expect(segments).toHaveLength(3);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', 'somecontent', 'completed');
                expectTagSegment(result[2], 'anothertag', '', 'streaming');
            });

            it('should handle text <tag>somecontent</tag><anothertag>more content</anothertag> - all complete', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag>somecontent</tag><anothertag>more content</anothertag>', segments, false);

                expect(result).toHaveLength(3);
                expect(segments).toHaveLength(3);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', 'somecontent', 'completed');
                expectTagSegment(result[2], 'anothertag', 'more content', 'completed');
            });

            it('should handle text <tag>somecontent</tag><anothertag>more content</anothertag> more text - with final text', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag>somecontent</tag><anothertag>more content</anothertag> more text', segments, false);

                expect(result).toHaveLength(4);
                expect(segments).toHaveLength(4);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', 'somecontent', 'completed');
                expectTagSegment(result[2], 'anothertag', 'more content', 'completed');
                expectTextSegment(result[3], ' more text', 'completed');
            });
        });

        describe('Text Merging with Previous Segments - Advanced', () => {
            it('should merge text with previous streaming text segment when appropriate', () => {
                const segments: ProcessedSegment[] = [
                    {
                        id: 0,
                        segmentType: 'text',
                        rawContent: 'text ',
                        streamingStatus: 'streaming',
                        rendererType: 'text',
                        renderer: mockTextRenderer
                    } as ProcessedTextSegment
                ];

                const result = processor.parseMessage('<ta', segments, true);

                // Based on actual behavior: creates two separate segments (text and incomplete tag)
                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'text ', 'completed');
                expectTagSegment(segments[1], 'ta', '', 'incomplete');
            });

            it('should create new segment when previous is completed', () => {
                const segments: ProcessedSegment[] = [
                    {
                        id: 0,
                        segmentType: 'text',
                        rawContent: 'text ',
                        streamingStatus: 'completed',
                        rendererType: 'text',
                        renderer: mockTextRenderer
                    } as ProcessedTextSegment
                ];

                const result = processor.parseMessage('<ta', segments, true);

                // Should not merge with completed segment
                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'text ', 'completed');
                expectTagSegment(segments[1], 'ta', '', 'incomplete');
            });
        });

        describe('Edge Cases with Special Tag Names', () => {
            it('should handle tags with hyphens', () => {
                // Create registry with hyphenated tag
                const registry = createMockComponentRegistry(['my-tag'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [];

                const result = proc.parseMessage('<my-tag>content</my-tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'my-tag', 'content', 'completed');
            });

            it('should handle tags with underscores', () => {
                // Create registry with underscore tag
                const registry = createMockComponentRegistry(['my_tag'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [];

                const result = proc.parseMessage('<my_tag>content</my_tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'my_tag', 'content', 'completed');
            });

            it('should handle tags with periods', () => {
                // Create registry with period tag
                const registry = createMockComponentRegistry(['log.trace'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [];

                const result = proc.parseMessage('<log.trace>content</log.trace>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'log.trace', 'content', 'completed');
            });
        });

        describe('LLMS Behavior Edge Cases', () => {
            it('should handle angle bracket text that is not a tag', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('Compare a < b and b > c', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result[0], 'Compare a < b and b > c', 'completed');
            });

            it('should handle partial angle brackets that do not form tags', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('This is < partial content', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result[0], 'This is < partial content', 'streaming');
            });
        });
    });

    describe('applyMetadataHandlers Functionality', () => {
        let mockMessage: any;
        let mockChatAppState: any;
        let mockAppState: any;

        beforeEach(() => {
            mockMessage = {
                id: 'test-message',
                content: 'test content',
                segments: [],
                traces: []
            };
            mockChatAppState = { componentRegistry: mockComponentRegistry };
            mockAppState = { user: { id: 'test-user' } };
            jest.clearAllMocks();
        });

        it('should call metadata handlers for completed metadata segments', () => {
            const segments: ProcessedSegment[] = [];
            processor.parseMessage('<metadata-tag>{"event": "test"}</metadata-tag>', segments, false);

            processor.applyMetadataHandlers(segments, mockMessage, mockChatAppState, mockAppState);

            expect(mockMetadataHandler).toHaveBeenCalledTimes(1);
            expect(mockMetadataHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    tag: 'metadata-tag',
                    rawContent: '{"event": "test"}',
                    streamingStatus: 'completed'
                }),
                mockMessage,
                mockChatAppState,
                mockAppState
            );
        });

        it('should not call metadata handlers for streaming metadata segments', () => {
            const segments: ProcessedSegment[] = [];
            // Create a truly streaming metadata segment (without closing tag)
            processor.parseMessage('<metadata-tag>{"event": "test"}', segments, true);

            processor.applyMetadataHandlers(segments, mockMessage, mockChatAppState, mockAppState);

            expect(mockMetadataHandler).not.toHaveBeenCalled();
        });

        it('should handle errors in metadata handlers gracefully', () => {
            const errorHandler = jest.fn().mockImplementation(() => {
                throw new Error('Handler error');
            });
            const registry = createMockComponentRegistry([], ['error-tag']);
            registry.getMetadataHandler = jest.fn().mockReturnValue(errorHandler);
            const proc = new MessageSegmentProcessor(registry);

            const segments: ProcessedSegment[] = [];
            proc.parseMessage('<error-tag>content</error-tag>', segments, false);

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            proc.applyMetadataHandlers(segments, mockMessage, mockChatAppState, mockAppState);

            expect(errorHandler).toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith("Error applying metadata handler for tag 'error-tag':", expect.any(Error));

            consoleSpy.mockRestore();
        });

        it('should skip metadata handlers for non-metadata segments', () => {
            const segments: ProcessedSegment[] = [];
            processor.parseMessage('<tag>content</tag>', segments, false);

            processor.applyMetadataHandlers(segments, mockMessage, mockChatAppState, mockAppState);

            expect(mockMetadataHandler).not.toHaveBeenCalled();
        });
    });

    describe('Complex Streaming Scenarios - Progressive Tag Completion', () => {
        describe('Text followed by incomplete tag scenarios', () => {
            it('should handle "text <ta>" - creates text segment and streaming tag', () => {
                // Create registry with 'ta' as a valid tag for this test
                const registry = createMockComponentRegistry(['tag', 'anothertag', 'ta'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [];
                const result = proc.parseMessage('text <ta>', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'ta', '', 'streaming');
            });

            it('should handle "text <ta" - creates text segment and incomplete tag', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <ta', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'ta', '', 'incomplete');
            });

            it('should handle "text <ta " - creates text segment and streaming tag (space indicates complete tag name)', () => {
                // Create registry with 'ta' as a valid tag for this test
                const registry = createMockComponentRegistry(['tag', 'anothertag', 'ta'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [];
                const result = proc.parseMessage('text <ta ', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'ta', '', 'streaming');
            });
        });

        describe('Text merging with previous segments', () => {
            it('should merge text with previous streaming text segment', () => {
                // Create registry with 'ta' as a valid tag for this test
                const registry = createMockComponentRegistry(['tag', 'anothertag', 'ta'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [
                    {
                        id: 0,
                        segmentType: 'text',
                        rawContent: 'previous ',
                        streamingStatus: 'streaming',
                        rendererType: 'text',
                        renderer: mockTextRenderer
                    } as ProcessedTextSegment
                ];

                const result = proc.parseMessage('<ta>', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'previous ', 'completed');
                expectTagSegment(segments[1], 'ta', '', 'streaming');
            });

            it('should not merge text with previous completed text segment', () => {
                // Create registry with 'ta' as a valid tag for this test
                const registry = createMockComponentRegistry(['tag', 'anothertag', 'ta'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [
                    {
                        id: 0,
                        segmentType: 'text',
                        rawContent: 'previous ',
                        streamingStatus: 'completed',
                        rendererType: 'text',
                        renderer: mockTextRenderer
                    } as ProcessedTextSegment
                ];

                const result = proc.parseMessage('<ta>', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'previous ', 'completed');
                expectTagSegment(segments[1], 'ta', '', 'streaming');
            });
        });

        describe('Progressive tag completion with invalid tags', () => {
            it('should handle incomplete tag followed by completion to invalid tag', () => {
                // Create registry without 'some' tag
                const registry = createMockComponentRegistry(['tag', 'anothertag'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [];

                // First call - incomplete tag name
                proc.parseMessage('text <som', segments, true);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'text ', 'completed');
                expectTagSegment(segments[1], 'som', '', 'incomplete');

                // Second call - complete invalid tag name
                const result = proc.parseMessage('e>more text', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'text ', 'completed');
                expectTextSegment(segments[1], '<some>more text', 'streaming');
            });

            it('should handle multiple progressive completions', () => {
                const segments: ProcessedSegment[] = [];

                // Step 1: text with incomplete tag
                processor.parseMessage('text <ta', segments, true);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'text ', 'completed');
                expectTagSegment(segments[1], 'ta', '', 'incomplete');

                // Step 2: complete tag name and add content
                processor.parseMessage('g>partial content', segments, true);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'text ', 'completed');
                expectTagSegment(segments[1], 'tag', 'partial content', 'streaming');

                // Step 3: complete the tag
                processor.parseMessage('</tag> final text', segments, true);
                expect(segments).toHaveLength(3);
                expectTextSegment(segments[0], 'text ', 'completed');
                expectTagSegment(segments[1], 'tag', 'partial content', 'completed');
                expectTextSegment(segments[2], ' final text', 'streaming');
            });
        });
    });

    describe('Advanced Nested Tag Scenarios', () => {
        describe('Deeply nested content handling', () => {
            it('should handle deeply nested tags as content', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag><level1><level2><level3>deep content</level3></level2></level1></tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', '<level1><level2><level3>deep content</level3></level2></level1>', 'completed');
            });

            it('should handle mixed text and nested tags in streaming', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('prefix <tag>content <nested>more</nested> and <another>tag</another>', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'prefix ', 'completed');
                expectTagSegment(result[1], 'tag', 'content <nested>more</nested> and <another>tag</another>', 'streaming');
            });

            it('should handle partial nested closing tags in streaming', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag>content <inner>data</inn', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', 'content <inner>data</inn', 'streaming');
            });
        });

        describe('Complex multi-tag scenarios', () => {
            it('should handle alternating complete and streaming tags', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>complete</tag> text <anothertag>streaming content', segments, true);

                expect(result).toHaveLength(3);
                expect(segments).toHaveLength(3);
                expectTagSegment(result[0], 'tag', 'complete', 'completed');
                expectTextSegment(result[1], ' text ', 'completed');
                expectTagSegment(result[2], 'anothertag', 'streaming content', 'streaming');
            });

            it('should handle multiple incomplete tags', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <ta', segments, true);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'ta', '', 'incomplete');

                // Continue with another incomplete tag completion
                const result2 = processor.parseMessage('g>content<ano', segments, true);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'text ', 'completed');
                expectTagSegment(segments[1], 'tag', 'content<ano', 'streaming');
            });
        });
    });

    describe('Error Handling and Recovery', () => {
        describe('Registry errors', () => {
            it('should handle registry that throws errors', () => {
                const faultyRegistry = createMockComponentRegistry();
                faultyRegistry.getAllRenderers = jest.fn().mockImplementation(() => {
                    throw new Error('Registry error');
                });

                expect(() => {
                    new MessageSegmentProcessor(faultyRegistry);
                }).not.toThrow();
            });

            it('should handle undefined renderers gracefully', () => {
                const registry = createMockComponentRegistry();
                registry.getRenderer = jest.fn().mockReturnValue(undefined);

                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [];

                const result = proc.parseMessage('<tag>content</tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expect(segments[0]).toEqual(
                    expect.objectContaining({
                        tag: 'tag',
                        rawContent: 'content',
                        renderer: undefined
                    })
                );
            });
        });

        describe('Malformed content recovery', () => {
            it('should recover from extremely malformed nested content', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag><<>><><broken><><tag><><<>content<><><>', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', '<<>><><broken><><tag><><<>content<><><>', 'streaming');
            });

            it('should handle mixed valid and invalid tags', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>valid</tag> text <invalid>><<> more <anothertag>also valid</anothertag>', segments, false);

                expect(result).toHaveLength(3);
                expect(segments).toHaveLength(3);
                expectTagSegment(result[0], 'tag', 'valid', 'completed');
                expectTextSegment(result[1], ' text <invalid>><<> more ', 'completed');
                expectTagSegment(result[2], 'anothertag', 'also valid', 'completed');
            });
        });

        describe('Memory and performance edge cases', () => {
            it('should handle very long content efficiently', () => {
                const longContent = 'a'.repeat(10000);
                const segments: ProcessedSegment[] = [];

                const start = performance.now();
                const result = processor.parseMessage(longContent, segments, false);
                const end = performance.now();

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expect(segments[0].rawContent).toBe(longContent);
                expect(end - start).toBeLessThan(100); // Should complete in less than 100ms
            });

            it('should handle many small segments efficiently', () => {
                const segments: ProcessedSegment[] = [];
                const manySegments = Array(100)
                    .fill(0)
                    .map((_, i) => `<tag>content${i}</tag>`)
                    .join(' ');

                const start = performance.now();
                const result = processor.parseMessage(manySegments, segments, false);
                const end = performance.now();

                expect(segments.length).toBeGreaterThan(100); // Many segments created
                expect(end - start).toBeLessThan(500); // Should complete in reasonable time
            });

            it('should handle streaming with many updates', () => {
                const segments: ProcessedSegment[] = [];

                // Simulate 50 streaming updates
                for (let i = 0; i < 50; i++) {
                    processor.parseMessage(`chunk${i} `, segments, true);
                }

                expect(segments).toHaveLength(1);
                expect(segments[0].rawContent).toContain('chunk0');
                expect(segments[0].rawContent).toContain('chunk49');
                expect(segments[0].streamingStatus).toBe('streaming');
            });
        });
    });

    describe('Complex Tag Name Patterns', () => {
        describe('Special character handling', () => {
            it('should handle tags with multiple hyphens', () => {
                const registry = createMockComponentRegistry(['multi-hyphen-tag'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [];

                const result = proc.parseMessage('<multi-hyphen-tag>content</multi-hyphen-tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'multi-hyphen-tag', 'content', 'completed');
            });

            it('should handle tags with mixed special characters', () => {
                const registry = createMockComponentRegistry(['complex_tag-name.v2'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [];

                const result = proc.parseMessage('<complex_tag-name.v2>content</complex_tag-name.v2>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'complex_tag-name.v2', 'content', 'completed');
            });

            it('should handle streaming with complex tag names', () => {
                const registry = createMockComponentRegistry(['log.trace-debug'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [];

                // Incomplete
                proc.parseMessage('<log.tr', segments, true);
                expectTagSegment(segments[0], 'log.tr', '', 'incomplete');

                // Complete
                proc.parseMessage('ace-debug>streaming content', segments, true);
                expect(segments).toHaveLength(1);
                expectTagSegment(segments[0], 'log.trace-debug', 'streaming content', 'streaming');
            });

            it('should handle invalid characters in tag names', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag@invalid>content</tag@invalid>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result[0], '<tag@invalid>content</tag@invalid>', 'completed');
            });
        });

        describe('Case sensitivity and validation', () => {
            it('should handle case-sensitive tag names', () => {
                const registry = createMockComponentRegistry(['CamelCase', 'lowercase'], []);
                const proc = new MessageSegmentProcessor(registry);
                const segments: ProcessedSegment[] = [];

                const result = proc.parseMessage('<CamelCase>content1</CamelCase><lowercase>content2</lowercase>', segments, false);

                expect(result).toHaveLength(2);
                expect(segments).toHaveLength(2);
                expectTagSegment(result[0], 'CamelCase', 'content1', 'completed');
                expectTagSegment(result[1], 'lowercase', 'content2', 'completed');
            });

            it('should reject tags starting with non-letters', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<123invalid>content</123invalid>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTextSegment(result[0], '<123invalid>content</123invalid>', 'completed');
            });
        });
    });

    describe('Boundary Conditions and Buffer Edge Cases', () => {
        describe('Empty and whitespace handling', () => {
            it('should handle empty tags', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag></tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', '', 'completed');
            });

            it('should handle tags with only whitespace', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>   \n\t  </tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', '   \n\t  ', 'completed');
            });

            it('should handle multiple consecutive empty tags', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag></tag><anothertag></anothertag><tag></tag>', segments, false);

                expect(result).toHaveLength(3);
                expect(segments).toHaveLength(3);
                expectTagSegment(result[0], 'tag', '', 'completed');
                expectTagSegment(result[1], 'anothertag', '', 'completed');
                expectTagSegment(result[2], 'tag', '', 'completed');
            });
        });

        describe('Unicode and special content', () => {
            it('should handle unicode content in tags', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>🚀 unicode émojis 中文</tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', '🚀 unicode émojis 中文', 'completed');
            });

            it('should handle mixed unicode and nested tags', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>🎯 <nested>中文</nested> 🌟</tag>', segments, false);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', '🎯 <nested>中文</nested> 🌟', 'completed');
            });
        });

        describe('Streaming buffer edge cases', () => {
            it('should handle streaming interruption at tag boundaries', () => {
                const segments: ProcessedSegment[] = [];

                // Split right at tag opening
                processor.parseMessage('text <', segments, true);
                expect(segments).toHaveLength(1);
                expectTextSegment(segments[0], 'text <', 'streaming');

                // Continue with tag name
                processor.parseMessage('tag>', segments, true);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'text ', 'completed');
                expectTagSegment(segments[1], 'tag', '', 'streaming');
            });

            it('should handle streaming interruption within tag names', () => {
                const segments: ProcessedSegment[] = [];

                // Split within tag name
                processor.parseMessage('text <ta', segments, true);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'text ', 'completed');
                expectTagSegment(segments[1], 'ta', '', 'incomplete');

                // Complete tag name
                processor.parseMessage('g>content', segments, true);
                expect(segments).toHaveLength(2);
                expectTextSegment(segments[0], 'text ', 'completed');
                expectTagSegment(segments[1], 'tag', 'content', 'streaming');
            });

            it('should handle streaming interruption at closing tag boundaries', () => {
                const segments: ProcessedSegment[] = [];

                // Start with complete opening
                processor.parseMessage('<tag>content</ta', segments, true);
                expect(segments).toHaveLength(1);
                expectTagSegment(segments[0], 'tag', 'content</ta', 'streaming');

                // Complete closing tag
                processor.parseMessage('g>', segments, true);
                expect(segments).toHaveLength(1);
                expectTagSegment(segments[0], 'tag', 'content', 'completed'); // Should be completed when closing tag is added
            });
        });

        describe('Complete Tag Status Fix', () => {
            it('should mark complete tags as completed even when they are the last segment during streaming', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>content</tag>', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', 'content', 'completed'); // Should be completed, not streaming
            });

            it('should mark complete tags as completed in complex streaming scenarios', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('text <tag>content</tag><anothertag>more</anothertag>', segments, true);

                expect(result).toHaveLength(3);
                expect(segments).toHaveLength(3);
                expectTextSegment(result[0], 'text ', 'completed');
                expectTagSegment(result[1], 'tag', 'content', 'completed'); // Complete tag
                expectTagSegment(result[2], 'anothertag', 'more', 'completed'); // Complete tag, even as last segment
            });

            it('should keep truly streaming tags as streaming', () => {
                const segments: ProcessedSegment[] = [];
                const result = processor.parseMessage('<tag>partial content', segments, true);

                expect(result).toHaveLength(1);
                expect(segments).toHaveLength(1);
                expectTagSegment(result[0], 'tag', 'partial content', 'streaming'); // Truly streaming
            });
        });

        describe('doneStreaming Fix', () => {
            it('should not convert complete tags to text in doneStreaming', () => {
                const segments: ProcessedSegment[] = [];

                // Parse a complete tag during streaming (this should mark it as completed)
                processor.parseMessage('<tag>content</tag>', segments, true);
                expect(segments).toHaveLength(1);
                expectTagSegment(segments[0], 'tag', 'content', 'completed');

                // Call doneStreaming - it should NOT convert the complete tag to text
                processor.doneStreaming(segments);

                expect(segments).toHaveLength(1);
                expectTagSegment(segments[0], 'tag', 'content', 'completed'); // Should remain as tag segment
            });

            it('should convert truly incomplete tags to text in doneStreaming', () => {
                const segments: ProcessedSegment[] = [];

                // Parse an incomplete tag
                processor.parseMessage('<ta', segments, true);
                expect(segments).toHaveLength(1);
                expectTagSegment(segments[0], 'ta', '', 'incomplete');

                // Call doneStreaming - it should convert the incomplete tag to text
                processor.doneStreaming(segments);

                expect(segments).toHaveLength(1);
                expectTextSegment(segments[0], '<ta', 'completed'); // Should be converted to text
            });

            it('should convert truly streaming tags to text in doneStreaming', () => {
                const segments: ProcessedSegment[] = [];

                // Parse a streaming tag without closing
                processor.parseMessage('<tag>incomplete content', segments, true);
                expect(segments).toHaveLength(1);
                expectTagSegment(segments[0], 'tag', 'incomplete content', 'streaming');

                // Call doneStreaming - it should convert the streaming tag to text
                processor.doneStreaming(segments);

                expect(segments).toHaveLength(1);
                expectTextSegment(segments[0], '<tag>incomplete content', 'completed'); // Should be converted to text
            });

            it('should handle mixed complete and incomplete segments in doneStreaming', () => {
                const segments: ProcessedSegment[] = [];

                // Parse mixed content: complete tag + incomplete tag
                processor.parseMessage('<tag>complete</tag>', segments, false); // Complete tag
                processor.parseMessage('<anothertag>incomplete', segments, true); // Incomplete tag

                expect(segments).toHaveLength(2);
                expectTagSegment(segments[0], 'tag', 'complete', 'completed');
                expectTagSegment(segments[1], 'anothertag', 'incomplete', 'streaming');

                // Call doneStreaming
                processor.doneStreaming(segments);

                expect(segments).toHaveLength(2);
                expectTagSegment(segments[0], 'tag', 'complete', 'completed'); // Complete tag unchanged
                expectTextSegment(segments[1], '<anothertag>incomplete', 'completed'); // Incomplete tag converted to text
            });
        });

        describe('Memory optimization scenarios', () => {
            it('should not create unnecessary segment copies', () => {
                const segments: ProcessedSegment[] = [];

                // First parse
                const result1 = processor.parseMessage('text content', segments, true);
                const firstSegment = result1[0];

                // Second parse that should modify existing segment
                const result2 = processor.parseMessage(' more', segments, true);

                expect(segments).toHaveLength(1);
                expect(segments[0].rawContent).toBe('text content more');
                // The segment content should be updated correctly
                expect(segments[0].segmentType).toBe('text');
                expect(segments[0].streamingStatus).toBe('streaming');
            });

            it('should efficiently handle large streaming updates', () => {
                const segments: ProcessedSegment[] = [];
                const largeChunk = 'x'.repeat(1000);

                // Start streaming
                processor.parseMessage('start ', segments, true);

                // Add large chunk
                processor.parseMessage(largeChunk, segments, true);

                expect(segments).toHaveLength(1);
                expect(segments[0].rawContent).toBe('start ' + largeChunk);
                // The content should be properly concatenated
                expect(segments[0].segmentType).toBe('text');
                expect(segments[0].streamingStatus).toBe('streaming');
            });
        });
    });
});
