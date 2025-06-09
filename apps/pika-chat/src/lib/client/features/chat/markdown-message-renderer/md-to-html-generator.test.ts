// Example usage and test cases for the markdown-to-html generator

import { MarkdownToHtmlGenerator, StreamingMarkdownProcessor } from './md-to-html-generator';

// Example 1: Static markdown processing
export function testStaticMarkdown() {
    const generator = new MarkdownToHtmlGenerator();
    
    const markdown = `
## Weather Report

Here's today's weather:

<image>https://example.com/weather-map.jpg</image>

The temperature forecast for the week:

<chart>{"type":"line","data":{"labels":["Mon","Tue","Wed","Thu","Fri"],"datasets":[{"label":"Temperature (°F)","data":[72,75,79,76,72],"backgroundColor":"rgba(54,162,235,0.5)"}]}}</chart>

You might want to ask:

<prompt>What's the humidity forecast?</prompt>
<prompt>Show me next week's forecast</prompt>
`;

    const result = generator.parseMarkdown(markdown);
    console.log('Segments:', result.segments);
    console.log('HTML:', generator.combineSegments(result.segments));
}

// Example 2: Streaming markdown processing
export function testStreamingMarkdown() {
    const processor = new StreamingMarkdownProcessor();
    
    // Simulate streaming chunks
    const chunks = [
        '## Weather Report\n\nHere\'s today\'s weather:\n\n<ima',
        'ge>https://example.com/weather-map.jpg</image>\n\nThe temp',
        'erature forecast:\n\n<chart>{"type":"line","data":{"labels":["Mon"',
        ',"Tue","Wed"],"datasets":[{"label":"Temp","data":[72,75,79]}]}}</ch',
        'art>\n\nYou might want to ask:\n\n<prompt>What\'s the humidity?</prompt>'
    ];
    
    chunks.forEach((chunk, index) => {
        console.log(`\n--- Processing chunk ${index + 1} ---`);
        const result = processor.processChunk(chunk);
        console.log('New segments:', result.newSegments);
        console.log('Current HTML length:', result.fullHtml.length);
    });
    
    // Finalize
    const finalResult = processor.finalize();
    console.log('\n--- Final result ---');
    console.log('Total segments:', finalResult.finalSegments.length);
    console.log('Final HTML:', finalResult.fullHtml);
}

// Example 3: Handling incomplete tags
export function testIncompleteTagHandling() {
    const processor = new StreamingMarkdownProcessor();
    
    // Test with tag split across chunks
    const chunks = [
        'Here is a prompt: <pr',
        'ompt>Ask about weather</prompt> and some more text'
    ];
    
    chunks.forEach((chunk, index) => {
        const result = processor.processChunk(chunk);
        console.log(`Chunk ${index + 1}:`, {
            hasPlaceholders: result.newSegments.some(s => s.type === 'placeholder'),
            segmentCount: result.newSegments.length
        });
    });
}

// Example 4: Complex markdown with multiple features
export function testComplexMarkdown() {
    const generator = new MarkdownToHtmlGenerator();
    
    const markdown = `
# Weather Analysis Report

## Summary

Today's weather shows **significant** variation across regions.

### Temperature Data

<chart>{"type":"bar","data":{"labels":["North","South","East","West"],"datasets":[{"label":"Temperature (°C)","data":[15,22,18,20],"backgroundColor":"rgba(255,99,132,0.5)"}]}}</chart>

### Satellite View

<image>https://example.com/satellite.jpg</image>

## Detailed Analysis

1. **Northern Region**: Experiencing cold front
2. **Southern Region**: Warm and humid
3. **Eastern Region**: Moderate temperatures
4. **Western Region**: Clear skies

> Note: All measurements taken at 12:00 PM local time

### Historical Comparison

| Region | Today | Yesterday | Change |
|--------|-------|-----------|---------|
| North  | 15°C  | 18°C      | -3°C    |
| South  | 22°C  | 20°C      | +2°C    |

## Next Steps

<prompt>Show detailed forecast for Northern region</prompt>
<prompt>Compare with last week's data</prompt>
<prompt>Get precipitation forecast</prompt>

---

*Report generated on ${new Date().toLocaleDateString()}*
`;

    const result = generator.parseMarkdown(markdown);
    const html = generator.combineSegments(result.segments);
    
    console.log('Complex markdown test:');
    console.log('- Total segments:', result.segments.length);
    console.log('- HTML segments:', result.segments.filter(s => s.type === 'html').length);
    console.log('- Placeholder segments:', result.segments.filter(s => s.type === 'placeholder').length);
    console.log('- Tag types found:', [...new Set(result.segments.filter(s => s.tagType).map(s => s.tagType))]);
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('=== Running markdown generator tests ===\n');
    
    console.log('\n1. Testing static markdown:');
    testStaticMarkdown();
    
    console.log('\n\n2. Testing streaming markdown:');
    testStreamingMarkdown();
    
    console.log('\n\n3. Testing incomplete tag handling:');
    testIncompleteTagHandling();
    
    console.log('\n\n4. Testing complex markdown:');
    testComplexMarkdown();
}
