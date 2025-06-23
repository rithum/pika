// No imports needed from shared types
import type { ComponentRegistry } from './component-registry';
import type { SegmentProcessor, ProcessedSegment, ProcessedTextSegment, ProcessedTagSegment, MetadataTagSegment, MetadataTagHandler } from './segment-types';
import type { ChatMessageForRendering } from '@pika/shared/types/chatbot/chatbot-types';
import type { ChatAppState } from '../chat-app.state.svelte';
import type { AppState } from '$lib/client/app/app.state.svelte';
import { isProcessedTextSegment } from './segment-utils';

/**
 * MessageSegmentProcessor
 *
 * This processor parses message content into segments (text and tag segments) with intelligent
 * streaming support. It can handle both complete content parsing and progressive streaming scenarios.
 *
 * ## Parsing Behavior:
 *
 * ### Text Rendering:
 * - Text segments contain raw markdown content in `rawContent`
 * - Markdown rendering is handled by a dedicated text renderer component (not here)
 * - The text renderer component will process the raw markdown into HTML when rendering
 * - This separation allows for different text rendering strategies and keeps this processor simple
 *
 * ### Tag Rendering:
 * - Tag segments contain the tag type and raw content
 * - Each tag type is mapped to a specific Svelte component via ComponentRegistry
 * - Tag components receive the raw tag content and handle their own rendering
 * - **No nested tags allowed** - everything between `<tag>` and `</tag>` is treated as literal content
 * - **Tag names** can contain letters, digits, hyphens, underscores, and periods (XML-compliant)
 *
 * ### Metadata Tags:
 * - Some tags are metadata-only and don't render inline
 * - These tags trigger side effects through MetadataTagHandler functions
 * - They create MetadataTagSegment instances instead of ProcessedTagSegment
 *
 * ## Streaming Use Cases:
 *
 * ### 1. Partial Text Messages (Streaming)
 * ```
 * Call 1: content="Hello wor", segments=[] → [{text:"Hello wor", streaming}]
 * Call 2: content="ld!", segments=[...] → [{text:"Hello world!", streaming}]
 * ```
 *
 * ### 2. Complete Content (Non-Streaming)
 * ```
 * Call: content="Hello <code-block>thought</code-block> world", isStreaming=false
 * Result: [{text:"Hello ", completed}, {tag:"code-block", content:"thought", completed}, {text:" world", completed}]
 * ```
 *
 * ### 3. Text + Multiple Complete Tags
 * ```
 * Call: content="Hi <user_input>a</user_input><debug.log>b</debug.log>", isStreaming=false
 * Result: [{text:"Hi ", completed}, {tag:"user_input", completed}, {tag:"debug.log", completed}]
 * ```
 *
 * ### 4. Starting with Complete Tag
 * ```
 * Call: content="<trace_output>thought</trace_output> hello", isStreaming=false
 * Result: [{tag:"trace_output", completed}, {text:" hello", completed}]
 * ```
 *
 * ### 5. Intelligent Incomplete Tag Detection (Streaming)
 * ```
 * Call 1: content="some text <log.trace>partial cont", segments=[], isStreaming=true
 * Result: [{text:"some text ", completed}, {tag:"log.trace", content:"partial cont", streaming}]
 *
 * Call 2: content="ent</log.trace>", segments=[...]
 * Result: [{text:"some text ", completed}, {tag:"log.trace", content:"partial content", completed}]
 * ```
 *
 * ### 5b. Incomplete Opening Tag Detection (Streaming)
 * ```
 * Call 1: content="test <ta", segments=[], isStreaming=true
 * Result depends on tag registry:
 * - If 'ta' is a supported tag: [{text:"test ", completed}, {tag:"ta", content:"", streaming}]
 * - If 'ta' could be partial of 'tag': [{text:"test ", completed}, {tag:"ta", content:"", incomplete}]
 *
 * Call 2: content="g>content", segments=[...]
 * Result: [{text:"test ", completed}, {tag:"tag", content:"content", streaming}]
 * ```
 *
 * ### 5c. Tag with Nested Content (Streaming)
 * ```
 * Call 1: content="text <ta<th", segments=[], isStreaming=true
 * Result: [{text:"text ", completed}, {tag:"ta", content:"<th", streaming}]
 * Note: The <ta> creates a streaming tag segment since 'ta' is a supported tag.
 * The <th becomes part of the tag's content since nested tags are not allowed.
 * ```
 *
 * ### 5d. Incomplete Tags with Special Characters (Streaming)
 * ```
 * Call 1: content="test <my-tag", segments=[], isStreaming=true
 * Result: [{text:"test ", completed}, {text:"<my-tag", incomplete}]
 *
 * Call 2: content="_name>content", segments=[...]
 * Result: [{text:"test ", completed}, {tag:"my-tag_name", content:"content", streaming}]
 *
 * Note: Tag names can contain letters, digits, hyphens, underscores, and periods.
 * Invalid cases like "<tag " (space after tag name) are treated as text.
 * ```
 *
 * ### 6. Complex Mixed Streaming
 * ```
 * Call 1: content="Start <tag1>content1</tag1> middle <tag2>partial", isStreaming=true
 * Result: [{text:"Start ", completed}, {tag:"tag1", completed}, {text:" middle ", completed}, {tag:"tag2", streaming}]
 * ```
 *
 * ### 7. Resilient Handling of Invalid Nested Tags
 * ```
 * Call: content="text <code-block>content1 <inner_tag>content2</code-block>", isStreaming=false
 * Result: [{text:"text ", completed}, {tag:"code-block", content:"content1 <inner_tag>content2", completed}]
 * Note: The <inner_tag> inside code-block is treated as literal text content, not as a nested tag.
 * ```
 *
 * ### 8. Edge Cases
 * ```
 * - Empty content → no segments
 * - Only whitespace → single text segment
 * - Malformed tags → treated as text
 * - Unknown tags → treated as text
 * - Incomplete tags in non-streaming → treated as text
 * ```
 *
 * ### 9. LLM-Generated Non-Tag Content (Streaming)
 * ```
 * Call 1: content="text <som", segments=[], isStreaming=true
 * Result: [{text:"text ", completed}, {tag:"som", content:"", incomplete}]
 * Note: Creates incomplete segment even though "som" might not be a supported tag.
 *
 * Call 2: content="e>more text", segments=[...], isStreaming=true
 * If "some" is NOT a supported tag:
 * Result: [{text:"text <some>more text", streaming}]
 * Note: Converts the invalid tag back to text and merges with previous text segment.
 * ```
 *
 * ## Key Features:
 * - **Progressive rendering**: Text segments are immediately available while tags stream in
 * - **Intelligent reconstruction**: Properly handles incomplete segments across streaming chunks
 * - **Resilient parsing**: Invalid or nested tags are gracefully handled as literal text
 * - **No data loss**: All content is preserved, even if not in expected format
 * - **Efficient**: Only modified/added segments are returned for optimal re-rendering
 */

export class MessageSegmentProcessor implements SegmentProcessor {
    #componentRegistry: ComponentRegistry;
    #supportedTagsPattern: RegExp | undefined;
    #lastTagsHash: string = '';

    constructor(componentRegistry: ComponentRegistry) {
        this.#componentRegistry = componentRegistry;
    }

    /**
     * Get dynamic regex pattern for supported tags
     */
    private getSupportedTagsPattern(): RegExp {
        // Get all registered tags (both renderers and metadata handlers)
        const allRenderers = this.#componentRegistry.getAllRenderers();
        const allMetadataHandlers = this.#componentRegistry.getAllMetadataHandlers();

        // Exclude 'text' renderer since it's for text segments, not XML tags
        const rendererTags = Object.keys(allRenderers).filter((tag) => tag !== 'text');
        const metadataHandlerTags = Object.keys(allMetadataHandlers);

        // Combine all supported tags
        const allSupportedTags = [...rendererTags, ...metadataHandlerTags];

        // Create a hash to detect changes
        const currentTagsHash = allSupportedTags.sort().join(',');

        // Only rebuild pattern if tags have changed
        if (!this.#supportedTagsPattern || this.#lastTagsHash !== currentTagsHash) {
            if (allSupportedTags.length === 0) {
                // If no tags are supported, create a pattern that matches nothing
                this.#supportedTagsPattern = /(?!.*)/;
            } else {
                // Escape special regex characters and create pattern
                const escapedTags = allSupportedTags.map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                this.#supportedTagsPattern = new RegExp(`<(${escapedTags.join('|')})>([\\s\\S]*?)<\\/\\1>`);
            }
            this.#lastTagsHash = currentTagsHash;
        }

        return this.#supportedTagsPattern;
    }

    /**
     * Parse message content into segments, adding the segments to the segments array provided.
     *
     * @param content The new content to parse and add to segments
     * @param segments The existing segments array to modify
     * @param isStreaming Whether we're in streaming mode
     * @returns Any modified or newly added segments.  This is used so you can tell what changed
     * should you need to.
     */
    parseMessage(content: string, segments: ProcessedSegment[], isStreaming: boolean): ProcessedSegment[] {
        // console.log('[SEGMENT-PROCESSOR] parseMessage called:', {
        //     contentLength: content.length,
        //     contentPreview: content.slice(0, 100) + (content.length > 100 ? '...' : ''),
        //     existingSegmentCount: segments.length,
        //     isStreaming,
        //     existingSegments: segments.map((s) => ({
        //         id: s.id,
        //         type: s.segmentType,
        //         status: s.streamingStatus,
        //         tag: 'tag' in s ? s.tag : undefined,
        //         contentLength: s.rawContent.length
        //     }))
        // });

        const modifiedSegments: ProcessedSegment[] = [];

        // Mark any existing streaming segments as modified so they get their status updated
        // This handles the case where we have streaming segments that aren't the last segment
        segments.forEach((segment) => {
            if (segment.streamingStatus === 'streaming' && !modifiedSegments.includes(segment)) {
                modifiedSegments.push(segment);
            }
        });

        // Early return for empty content when there's no incomplete segment to process
        const lastSegment = segments.length > 0 ? segments[segments.length - 1] : undefined;
        const hasIncompleteLast = !!lastSegment && (lastSegment.streamingStatus === 'streaming' || lastSegment.streamingStatus === 'incomplete');

        // console.log('[SEGMENT-PROCESSOR] Processing state:', {
        //     hasLastSegment: !!lastSegment,
        //     lastSegmentStatus: lastSegment?.streamingStatus,
        //     hasIncompleteLast,
        //     contentEmpty: content === ''
        // });

        if (content === '' && !hasIncompleteLast) {
            // console.log('[SEGMENT-PROCESSOR] Early return - no content and no incomplete segments');
            return modifiedSegments; // No content to process and no incomplete segments
        }

        // Check if we have an existing streaming or incomplete segment that needs to be extended

        // If we have an incomplete last segment, we need to reparse including its content
        let contentToParse = content;
        let segmentStartIndex = segments.length;

        if (hasIncompleteLast) {
            // console.log('[SEGMENT-PROCESSOR] Processing incomplete last segment:', {
            //     segmentId: lastSegment!.id,
            //     segmentType: lastSegment!.segmentType,
            //     status: lastSegment!.streamingStatus,
            //     existingContent: lastSegment!.rawContent
            // });

            // Remove the last incomplete segment and include its content in our parsing (we are guaranteed to have at least one segment)
            const removedSegment = segments.pop() as ProcessedSegment;

            // console.log('[SEGMENT-PROCESSOR] 🔧 RECONSTRUCTION DEBUG:', {
            //     removedSegmentType: removedSegment.segmentType,
            //     removedSegmentStatus: removedSegment.streamingStatus,
            //     removedSegmentTag: 'tag' in removedSegment ? removedSegment.tag : 'N/A',
            //     removedSegmentContent: removedSegment.rawContent,
            //     newIncomingContent: content,
            //     newIncomingContentLength: content.length
            // });

            if (isProcessedTextSegment(removedSegment)) {
                // For text segments, just prepend the existing content
                contentToParse = removedSegment.rawContent + content;
                // console.log('[SEGMENT-PROCESSOR] 🔧 TEXT RECONSTRUCTION:', {
                //     originalContent: removedSegment.rawContent,
                //     newContent: content,
                //     reconstructedContent: contentToParse,
                //     reconstructedLength: contentToParse.length
                // });
                // console.log('[SEGMENT-PROCESSOR] Merged text segment content:', {
                //     originalLength: removedSegment.rawContent.length,
                //     newContentLength: content.length,
                //     totalLength: contentToParse.length
                // });
            } else if (removedSegment.streamingStatus === 'incomplete') {
                // For incomplete tag segments, reconstruct the partial opening tag
                const tag = removedSegment.tag;
                const reconstructedContent = `<${tag}` + content;

                // console.log('[SEGMENT-PROCESSOR] 🔧 INCOMPLETE TAG RECONSTRUCTION:', {
                //     tag,
                //     originalPartial: `<${tag}`,
                //     newContent: content,
                //     reconstructedContent,
                //     reconstructedLength: reconstructedContent.length
                // });

                // console.log('[SEGMENT-PROCESSOR] Reconstructing incomplete tag:', {
                //     tag,
                //     originalPartial: `<${tag}`,
                //     newContent: content,
                //     reconstructed: reconstructedContent
                // });

                // Check if the new content completes the tag and if it's supported
                const completedTagCheck = this.checkForCompletedTag(reconstructedContent, tag);

                // console.log('[SEGMENT-PROCESSOR] Completed tag check:', completedTagCheck);

                if (completedTagCheck.isNowValid) {
                    // The completed tag is supported, proceed normally
                    contentToParse = reconstructedContent;
                } else {
                    // The completed tag is not supported, convert to text
                    // console.log('[SEGMENT-PROCESSOR] Converting invalid completed tag to text');
                    this.convertIncompleteTagToText(reconstructedContent, segments, modifiedSegments);
                    return modifiedSegments; // Early return since we've handled everything
                }
            } else {
                // For streaming tag segments, reconstruct the original tag format
                const tag = removedSegment.tag;
                //TODO: remove this when we're sure the fix after it worked
                //const tagContent = `<${tag}>${removedSegment.rawContent}` + content;
                const tagContent =
                    //removedSegment.rawContent === ''
                    removedSegment.rawContent === '' && content.startsWith('>')
                        ? `<${tag}` + content // Don't add > if no content yet (content should provide it)
                        : `<${tag}>${removedSegment.rawContent}` + content;
                contentToParse = tagContent;

                // console.log('[SEGMENT-PROCESSOR] 🔧 STREAMING TAG RECONSTRUCTION:', {
                //     tag,
                //     existingTagContent: removedSegment.rawContent,
                //     newContent: content,
                //     reconstructedTagFormat: `<${tag}>${removedSegment.rawContent}`,
                //     finalReconstructedContent: tagContent,
                //     finalLength: tagContent.length
                // });
                // console.log('[SEGMENT-PROCESSOR] Reconstructing streaming tag:', {
                //     tag,
                //     existingContent: removedSegment.rawContent,
                //     newContent: content,
                //     reconstructed: tagContent
                // });
            }

            segmentStartIndex = segments.length;
        }

        const tagPattern = this.getSupportedTagsPattern();
        let searchIndex = 0;

        // console.log('[SEGMENT-PROCESSOR] Starting tag parsing:', {
        //     contentToParseLength: contentToParse.length,
        //     segmentStartIndex,
        //     tagPatternExists: !!tagPattern
        // });

        // First, process all complete tags
        while (searchIndex < contentToParse.length) {
            const remainingContent = contentToParse.slice(searchIndex);
            const match = tagPattern.exec(remainingContent);

            if (!match) {
                // console.log('[SEGMENT-PROCESSOR] No more complete tags found at index:', searchIndex);
                break;
            }

            // Adjust match.index to be relative to original content
            const actualIndex = searchIndex + match.index;

            // console.log('[SEGMENT-PROCESSOR] Found complete tag:', {
            //     tagName: match[1],
            //     tagContent: match[2],
            //     startIndex: actualIndex,
            //     endIndex: actualIndex + match[0].length,
            //     fullMatch: match[0]
            // });

            // Add any text content before this tag
            if (actualIndex > searchIndex) {
                const textContent = contentToParse.slice(searchIndex, actualIndex);
                if (textContent) {
                    // console.log('[SEGMENT-PROCESSOR] Adding text before tag:', {
                    //     textLength: textContent.length,
                    //     textPreview: textContent.slice(0, 50)
                    // });
                    // Use addTextContent to merge with existing text segments instead of creating new ones
                    this.addTextContent(textContent, segments, modifiedSegments);
                }
            }

            // Add the complete tag segment
            const tagType = match[1];
            const tagContent = match[2];
            const tagSegment = this.createTagSegment(tagType, tagContent, segments);
            tagSegment.streamingStatus = 'completed'; // Complete tags are always completed
            // console.log('[SEGMENT-PROCESSOR] Created complete tag segment:', {
            //     id: tagSegment.id,
            //     tag: tagType,
            //     contentLength: tagContent.length,
            //     isMetadata: 'isMetadata' in tagSegment ? tagSegment.isMetadata : false
            // });
            segments.push(tagSegment);
            modifiedSegments.push(tagSegment);

            searchIndex = actualIndex + match[0].length;
        }

        // Handle remaining content, checking for incomplete tags during streaming
        if (searchIndex < contentToParse.length) {
            const remainingContent = contentToParse.slice(searchIndex);
            // console.log('[SEGMENT-PROCESSOR] Processing remaining content:', {
            //     remainingLength: remainingContent.length,
            //     remainingPreview: remainingContent.slice(0, 100),
            //     isStreaming
            // });

            if (isStreaming) {
                this.parseRemainingContentStreaming(remainingContent, segments, modifiedSegments);
            } else {
                // Not streaming, treat all remaining content as text
                // console.log('[SEGMENT-PROCESSOR] Adding remaining content as text (not streaming)');
                this.addTextContent(remainingContent, segments, modifiedSegments);
            }
        }

        // Set streaming status for the modified segments
        // BEFORE the forEach loop - log all segments before modification
        // console.log('[SEGMENT-PROCESSOR] BEFORE status updates:', {
        //     totalSegments: segments.length,
        //     isStreaming,
        //     segmentStartIndex,
        //     allSegments: segments.map((seg, idx) => ({
        //         index: idx,
        //         segmentId: seg.id,
        //         segmentType: seg.segmentType,
        //         currentStatus: seg.streamingStatus,
        //         isLastSegment: idx === segments.length - 1,
        //         contentLength: seg.rawContent?.length || 0,
        //         contentPreview: seg.rawContent?.substring(0, 30) || '<no content>'
        //     }))
        // });

        // Update status for ALL segments, not just modified ones
        // This ensures completed segments stay completed
        segments.forEach((segment, index) => {
            const oldStatus = segment.streamingStatus;
            const wasModified = modifiedSegments.includes(segment);

            // console.log('[SEGMENT-PROCESSOR] 🔍 STATUS UPDATE CHECK:', {
            //     segmentId: segment.id,
            //     segmentType: segment.segmentType,
            //     currentStatus: segment.streamingStatus,
            //     wasModified,
            //     isLastSegment: index === segments.length - 1,
            //     modifiedSegmentIds: modifiedSegments.map((s) => s.id)
            // });

            // Don't override incomplete status or already completed status
            if (segment.streamingStatus === 'incomplete' || segment.streamingStatus === 'completed') {
                // console.log('[SEGMENT-PROCESSOR] SKIPPING status update (keeping existing):', {
                //     segmentId: segment.id,
                //     segmentType: segment.segmentType,
                //     currentStatus: segment.streamingStatus,
                //     reason: segment.streamingStatus === 'incomplete' ? 'incomplete' : 'already completed',
                //     wasModified
                // });
                return; // Keep existing status for incomplete tags and completed tags
            }

            // Only update status for segments that were actually modified in this round
            if (!wasModified) {
                // console.log('[SEGMENT-PROCESSOR] SKIPPING status update (not modified):', {
                //     segmentId: segment.id,
                //     segmentType: segment.segmentType,
                //     currentStatus: segment.streamingStatus
                // });
                return; // Don't change status of unmodified segments
            }

            if (!isStreaming || index < segments.length - 1) {
                segment.streamingStatus = 'completed';
            } else {
                // Last segment during streaming
                segment.streamingStatus = 'streaming';
            }

            // console.log('[SEGMENT-PROCESSOR] Updated segment streaming status:', {
            //     segmentId: segment.id,
            //     segmentType: segment.segmentType,
            //     oldStatus,
            //     newStatus: segment.streamingStatus,
            //     isLastSegment: index === segments.length - 1,
            //     wasModified
            // });
        });

        // AFTER the forEach loop - log all segments after modification
        // console.log('[SEGMENT-PROCESSOR] AFTER status updates:', {
        //     totalSegments: segments.length,
        //     allSegments: segments.map((seg, idx) => ({
        //         index: idx,
        //         segmentId: seg.id,
        //         segmentType: seg.segmentType,
        //         finalStatus: seg.streamingStatus,
        //         isLastSegment: idx === segments.length - 1,
        //         contentLength: seg.rawContent?.length || 0,
        //         contentPreview: seg.rawContent?.substring(0, 30) || '<no content>'
        //     }))
        // });

        // console.log('[SEGMENT-PROCESSOR] parseMessage completed:', {
        //     totalSegments: segments.length,
        //     modifiedSegmentCount: modifiedSegments.length,
        //     finalSegments: segments.map((s) => ({
        //         id: s.id,
        //         type: s.segmentType,
        //         status: s.streamingStatus,
        //         tag: 'tag' in s ? s.tag : undefined,
        //         contentLength: s.rawContent.length
        //     }))
        // });

        return modifiedSegments;
    }

    doneStreaming(segments: ProcessedSegment[]): void {
        // console.log('[SEGMENT-PROCESSOR] doneStreaming called:', {
        //     segmentCount: segments.length,
        //     segments: segments.map((s) => ({
        //         id: s.id,
        //         type: s.segmentType,
        //         status: s.streamingStatus,
        //         tag: 'tag' in s ? s.tag : undefined
        //     }))
        // });

        // Convert any incomplete or streaming segments to text segments
        // Only the last segment can be in progress, but we'll check all just to be safe
        for (let i = segments.length - 1; i >= 0; i--) {
            const segment = segments[i];

            // Only process segments that are not completed or error
            if (segment.streamingStatus === 'completed' || segment.streamingStatus === 'error') {
                break; // All previous segments should be completed, so we can stop
            }

            // Only convert truly incomplete segments, not complete tags that happen to have streaming status
            if ((segment.streamingStatus === 'streaming' || segment.streamingStatus === 'incomplete') && !this.isTagSegmentComplete(segment)) {
                // console.log('[SEGMENT-PROCESSOR] Converting incomplete segment to text:', {
                //     segmentId: segment.id,
                //     segmentType: segment.segmentType,
                //     status: segment.streamingStatus,
                //     tag: 'tag' in segment ? segment.tag : undefined
                // });

                // Convert to text segment by reconstructing the original content
                let reconstructedContent: string;

                if (isProcessedTextSegment(segment)) {
                    // For text segments, just use the raw content as-is
                    reconstructedContent = segment.rawContent;
                } else {
                    // For tag segments, reconstruct the original tag format
                    if (segment.streamingStatus === 'incomplete') {
                        // Incomplete segments have partial tag names like "<ta"
                        reconstructedContent = `<${segment.tag}`;
                    } else {
                        // Streaming segments have full opening tags with content
                        reconstructedContent = `<${segment.tag}>${segment.rawContent}`;
                    }
                }

                // console.log('[SEGMENT-PROCESSOR] Reconstructed content for text segment:', {
                //     originalSegmentId: segment.id,
                //     reconstructedContent: reconstructedContent.slice(0, 100)
                // });

                // Create a new text segment to replace this one
                const textRenderer = this.#componentRegistry.getRenderer('text');
                const newTextSegment: ProcessedTextSegment = {
                    id: segment.id,
                    segmentType: 'text',
                    rawContent: reconstructedContent,
                    streamingStatus: 'completed',
                    rendererType: 'text',
                    renderer: textRenderer
                };

                // Replace the segment
                segments[i] = newTextSegment;
                // console.log('[SEGMENT-PROCESSOR] Replaced segment with text segment:', {
                //     segmentId: segment.id,
                //     newContentLength: reconstructedContent.length
                // });
            }
        }

        // console.log('[SEGMENT-PROCESSOR] doneStreaming completed:', {
        //     finalSegmentCount: segments.length,
        //     finalSegments: segments.map((s) => ({
        //         id: s.id,
        //         type: s.segmentType,
        //         status: s.streamingStatus
        //     }))
        // });
    }

    /**
     * Parse remaining content during streaming with robust left-to-right parsing
     */
    private parseRemainingContentStreaming(content: string, segments: ProcessedSegment[], modifiedSegments: ProcessedSegment[]): void {
        // console.log('[SEGMENT-PROCESSOR] parseRemainingContentStreaming called:', {
        //     contentLength: content.length,
        //     contentPreview: content.slice(0, 100)
        // });

        let currentIndex = 0;

        while (currentIndex < content.length) {
            // Find the next potential tag start
            const nextTagStart = content.indexOf('<', currentIndex);

            // console.log('[SEGMENT-PROCESSOR] Looking for next tag:', {
            //     currentIndex,
            //     nextTagStart,
            //     remainingContent: content.slice(currentIndex, currentIndex + 50)
            // });

            if (nextTagStart === -1) {
                // No more tags, add remaining content as text
                const remainingText = content.slice(currentIndex);
                if (remainingText) {
                    // console.log('[SEGMENT-PROCESSOR] Adding final text content:', {
                    //     textLength: remainingText.length,
                    //     textPreview: remainingText.slice(0, 50)
                    // });
                    this.addTextContent(remainingText, segments, modifiedSegments);
                }
                break;
            }

            // Add any text before the tag
            if (nextTagStart > currentIndex) {
                const textBefore = content.slice(currentIndex, nextTagStart);
                // console.log('[SEGMENT-PROCESSOR] Adding text before tag:', {
                //     textLength: textBefore.length,
                //     textPreview: textBefore.slice(0, 50)
                // });
                this.addTextContent(textBefore, segments, modifiedSegments);
            }

            // Analyze what kind of tag construct we have starting at nextTagStart
            const tagAnalysis = this.analyzeTagConstruct(content, nextTagStart);

            // console.log('[SEGMENT-PROCESSOR] 🔍 TAG ANALYSIS DEBUG:', {
            //     contentAtPosition: content.slice(nextTagStart, nextTagStart + 20),
            //     isValid: tagAnalysis.isValid,
            //     type: tagAnalysis.type,
            //     tagName: tagAnalysis.tagName,
            //     partialTagName: tagAnalysis.partialTagName,
            //     supportedTags: this.getAllSupportedTags(),
            //     analysisResult: tagAnalysis
            // });

            if (tagAnalysis.isValid) {
                if (tagAnalysis.type === 'complete') {
                    // Found <tag>content</tag>
                    const tagSegment = this.createTagSegment(tagAnalysis.tagName!, tagAnalysis.content!, segments);
                    tagSegment.streamingStatus = 'completed'; // Complete tags are always completed
                    segments.push(tagSegment);
                    modifiedSegments.push(tagSegment);
                    currentIndex = tagAnalysis.endIndex!;
                    // console.log('[SEGMENT-PROCESSOR] Added complete tag segment:', {
                    //     tag: tagAnalysis.tagName,
                    //     segmentId: tagSegment.id
                    // });
                } else if (tagAnalysis.type === 'streaming') {
                    // Found <tag> or <tag> or <tag content but no closing tag
                    const tagSegment = this.createTagSegment(tagAnalysis.tagName!, tagAnalysis.content!, segments);
                    tagSegment.streamingStatus = 'streaming';
                    segments.push(tagSegment);
                    modifiedSegments.push(tagSegment);
                    currentIndex = content.length; // Consume rest of content as tag content
                    // console.log('[SEGMENT-PROCESSOR] Added streaming tag segment:', {
                    //     tag: tagAnalysis.tagName,
                    //     segmentId: tagSegment.id,
                    //     contentLength: tagAnalysis.content!.length
                    // });
                } else if (tagAnalysis.type === 'incomplete') {
                    // Found <ta or incomplete tag name
                    const incompleteSegment = this.createIncompleteTagSegment(`<${tagAnalysis.partialTagName!}`, segments);
                    incompleteSegment.streamingStatus = 'incomplete';
                    segments.push(incompleteSegment);
                    modifiedSegments.push(incompleteSegment);
                    currentIndex = content.length; // Consume rest of content
                    // console.log('[SEGMENT-PROCESSOR] Added incomplete tag segment:', {
                    //     partialTag: tagAnalysis.partialTagName,
                    //     segmentId: incompleteSegment.id
                    // });
                }
            } else {
                // Not a valid tag, treat '<' as literal text
                // console.log('[SEGMENT-PROCESSOR] ⚠️ LONE < DETECTED:', {
                //     contentAtPosition: content.slice(nextTagStart, nextTagStart + 20),
                //     fullRemainingContent: content.slice(nextTagStart),
                //     reason: 'Tag construct analysis returned isValid: false'
                // });
                this.addTextContent('<', segments, modifiedSegments);
                currentIndex = nextTagStart + 1;
            }
        }

        // console.log('[SEGMENT-PROCESSOR] parseRemainingContentStreaming completed');
    }

    /**
     * Analyze a tag construct starting at the given position
     */
    private analyzeTagConstruct(
        content: string,
        startIndex: number
    ): {
        isValid: boolean;
        type?: 'complete' | 'streaming' | 'incomplete';
        tagName?: string;
        partialTagName?: string;
        content?: string;
        endIndex?: number;
    } {
        // Extract potential tag pattern: <tagname> or <tagname or <tagname
        const tagPattern = /^<([a-zA-Z][a-zA-Z0-9_.-]*)(>|\s|$)/;
        const contentToAnalyze = content.slice(startIndex);
        const match = contentToAnalyze.match(tagPattern);

        // console.log('[SEGMENT-PROCESSOR] 🔍 ANALYZE TAG CONSTRUCT:', {
        //     startIndex,
        //     contentToAnalyze: contentToAnalyze.slice(0, 30),
        //     regexPattern: tagPattern.toString(),
        //     regexMatch: match
        //         ? {
        //               fullMatch: match[0],
        //               tagName: match[1],
        //               afterTagName: match[2]
        //           }
        //         : null
        // });

        if (!match) {
            // console.log('[SEGMENT-PROCESSOR] ❌ TAG ANALYSIS FAILED: No regex match');
            return { isValid: false };
        }

        const tagName = match[1];
        const afterTagName = match[2];

        // Check if this tag name is supported
        const allSupportedTags = this.getAllSupportedTags();
        const isFullySupportedTag = allSupportedTags.includes(tagName);

        // console.log('[SEGMENT-PROCESSOR] 🔍 TAG SUPPORT CHECK:', {
        //     tagName,
        //     afterTagName: afterTagName === '' ? '<EMPTY>' : afterTagName,
        //     isFullySupportedTag,
        //     allSupportedTags
        // });

        if (afterTagName === '>') {
            // We have <tag>, check if it's supported
            if (!isFullySupportedTag) {
                // Not a supported tag, treat as text
                // console.log('[SEGMENT-PROCESSOR] ❌ TAG REJECTED: Complete tag not supported');
                return { isValid: false };
            }

            // Look for </tag>
            const closingTag = `</${tagName}>`;
            const contentAfterOpening = content.slice(startIndex + match[0].length);
            const closingIndex = contentAfterOpening.indexOf(closingTag);

            if (closingIndex !== -1) {
                // Found complete tag
                const tagContent = contentAfterOpening.slice(0, closingIndex);
                // console.log('[SEGMENT-PROCESSOR] ✅ COMPLETE TAG FOUND:', {
                //     tagName,
                //     contentLength: tagContent.length
                // });
                return {
                    isValid: true,
                    type: 'complete',
                    tagName,
                    content: tagContent,
                    endIndex: startIndex + match[0].length + closingIndex + closingTag.length
                };
            } else {
                // No closing tag found, it's streaming
                // console.log('[SEGMENT-PROCESSOR] ✅ STREAMING TAG (no closing):', { tagName });
                return {
                    isValid: true,
                    type: 'streaming',
                    tagName,
                    content: contentAfterOpening,
                    endIndex: content.length
                };
            }
        } else if (afterTagName === ' ') {
            // We have <tag , check if it's supported
            if (!isFullySupportedTag) {
                // Not a supported tag, treat as text
                // console.log('[SEGMENT-PROCESSOR] ❌ TAG REJECTED: Space after unsupported tag');
                return { isValid: false };
            }

            // The space indicates complete tag name, this is streaming
            const contentAfterSpace = content.slice(startIndex + match[0].length);
            // console.log('[SEGMENT-PROCESSOR] ✅ STREAMING TAG (space):', { tagName });
            return {
                isValid: true,
                type: 'streaming',
                tagName,
                content: contentAfterSpace,
                endIndex: content.length
            };
        } else {
            // afterTagName is empty string (end of content), this could be incomplete
            if (isFullySupportedTag) {
                // This is a complete supported tag name but no closing >, so it's streaming
                // console.log('[SEGMENT-PROCESSOR] ✅ STREAMING TAG (incomplete but supported):', { tagName });
                return {
                    isValid: true,
                    type: 'streaming',
                    tagName,
                    content: '',
                    endIndex: content.length
                };
            } else {
                // This could be a partial tag name - be permissive and create incomplete segment
                // We'll validate when we get the complete name
                // console.log('[SEGMENT-PROCESSOR] ✅ INCOMPLETE TAG (partial name):', {
                //     partialTagName: tagName,
                //     reason: 'Not in supported tags yet, being permissive'
                // });
                return {
                    isValid: true,
                    type: 'incomplete',
                    partialTagName: tagName
                };
            }
        }
    }

    /**
     * Add text content, merging with previous text segment if possible
     */
    private addTextContent(textContent: string, segments: ProcessedSegment[], modifiedSegments: ProcessedSegment[]): void {
        if (!textContent) return;

        const lastSegment = segments.length > 0 ? segments[segments.length - 1] : undefined;

        if (lastSegment && isProcessedTextSegment(lastSegment)) {
            // Merge with previous text segment (regardless of streaming status)
            // Once a text segment is created, we should always append to it rather than create new ones
            lastSegment.rawContent += textContent;
            if (!modifiedSegments.includes(lastSegment)) {
                modifiedSegments.push(lastSegment);
            }
        } else {
            // Create new text segment only if there's no previous text segment
            const textSegment = this.createTextSegment(textContent, segments);
            segments.push(textSegment);
            modifiedSegments.push(textSegment);
        }
    }

    /**
     * Check if reconstructed content from an incomplete tag now forms a valid supported tag
     */
    private checkForCompletedTag(content: string, partialTagName: string): { isNowValid: boolean; completedTagName?: string } {
        // Look for a pattern like "<partialName...>" to see if we now have a complete tag
        const tagPattern = new RegExp(`^<(${partialTagName}[a-zA-Z0-9_.-]*?)([>\\s])`);
        const match = content.match(tagPattern);

        if (!match) {
            return { isNowValid: false };
        }

        const completedTagName = match[1];
        const allSupportedTags = this.getAllSupportedTags();
        const isSupported = allSupportedTags.includes(completedTagName);

        return {
            isNowValid: isSupported,
            completedTagName
        };
    }

    /**
     * Convert an incomplete tag back to text and merge appropriately
     */
    private convertIncompleteTagToText(content: string, segments: ProcessedSegment[], modifiedSegments: ProcessedSegment[]): void {
        // The content includes the reconstructed tag that we now know is not valid
        // We need to add this as text content, merging with previous text segment if possible
        this.addTextContent(content, segments, modifiedSegments);
    }

    /**
     * Get all supported tags from both renderers and metadata handlers
     */
    private getAllSupportedTags(): string[] {
        const allRenderers = this.#componentRegistry.getAllRenderers();
        const allMetadataHandlers = this.#componentRegistry.getAllMetadataHandlers();
        const rendererTags = Object.keys(allRenderers).filter((tag) => tag !== 'text');
        const metadataHandlerTags = Object.keys(allMetadataHandlers);
        return [...rendererTags, ...metadataHandlerTags];
    }

    /**
     * Find an incomplete opening tag (like "<ta") in the content during streaming
     */
    private findIncompleteOpeningTag(content: string): { textBefore: string; partialTag: string } | undefined {
        // Get all supported tags
        const allRenderers = this.#componentRegistry.getAllRenderers();
        const allMetadataHandlers = this.#componentRegistry.getAllMetadataHandlers();
        const rendererTags = Object.keys(allRenderers).filter((tag) => tag !== 'text');
        const metadataHandlerTags = Object.keys(allMetadataHandlers);
        const allSupportedTags = [...rendererTags, ...metadataHandlerTags];

        if (allSupportedTags.length === 0) return undefined;

        // Look for partial opening tags like "<ta", "<tag-", "<my_tag.", etc.
        // We check if content ends with a partial tag that could match any supported tag
        // XML tag names can contain: letters, digits, hyphens, underscores, and periods
        const partialOpenPattern = /<[a-zA-Z][a-zA-Z0-9_.-]*$/;
        const match = content.match(partialOpenPattern);

        if (match) {
            const partialTag = match[0]; // e.g., "<ta"
            const tagNamePart = partialTag.slice(1); // e.g., "ta"

            // Check if this partial tag could be the beginning of any supported tag
            const couldBeTag = allSupportedTags.some((tag) => tag.startsWith(tagNamePart));

            if (couldBeTag) {
                const textBefore = content.slice(0, match.index!);
                return {
                    textBefore,
                    partialTag
                };
            }
        }

        return undefined;
    }

    /**
     * Find an incomplete tag in the content during streaming
     */
    private findIncompleteTag(content: string): { textBefore: string; tagType: string; tagContent: string } | undefined {
        // Get all supported tags
        const allRenderers = this.#componentRegistry.getAllRenderers();
        const allMetadataHandlers = this.#componentRegistry.getAllMetadataHandlers();
        const rendererTags = Object.keys(allRenderers).filter((tag) => tag !== 'text');
        const metadataHandlerTags = Object.keys(allMetadataHandlers);
        const allSupportedTags = [...rendererTags, ...metadataHandlerTags];

        if (allSupportedTags.length === 0) return undefined;

        // Look for the FIRST occurrence of an opening tag that doesn't have a matching closing tag
        // Since we don't allow nested tags, everything between <tag> and </tag> is literal content
        const escapedTags = allSupportedTags.map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const openingTagPattern = new RegExp(`<(${escapedTags.join('|')})>`, 'g');

        let openMatch: RegExpExecArray | null;

        // Find the first opening tag
        while ((openMatch = openingTagPattern.exec(content))) {
            const tagType = openMatch[1];
            const closingTag = `</${tagType}>`;

            // Look for the exact closing tag starting from after the opening tag
            const contentAfterOpen = content.slice(openMatch.index + openMatch[0].length);
            const closingIndex = contentAfterOpen.indexOf(closingTag);

            if (closingIndex === -1) {
                // No matching closing tag found - this is an incomplete tag
                const textBefore = content.slice(0, openMatch.index);
                const tagContent = contentAfterOpen; // Everything after opening tag is content

                return {
                    textBefore,
                    tagType,
                    tagContent
                };
            }
        }

        return undefined;
    }

    /**
     * Create an incomplete tag segment for partial opening tags like "<ta"
     */
    private createIncompleteTagSegment(partialTag: string, segments: ProcessedSegment[]): ProcessedTagSegment {
        // Extract the partial tag name (remove the '<')
        const partialTagName = partialTag.slice(1); // "<ta" → "ta"

        return {
            id: segments.length,
            segmentType: 'tag',
            tag: partialTagName,
            rawContent: '',
            streamingStatus: 'incomplete',
            rendererType: partialTagName
            // No renderer property - it's optional and unknown until complete
        };
    }

    /**
     * Create a text segment
     */
    private createTextSegment(content: string, segments: ProcessedSegment[]): ProcessedTextSegment {
        const textRenderer = this.#componentRegistry.getRenderer('text');
        return {
            id: segments.length,
            segmentType: 'text',
            rawContent: content,
            streamingStatus: 'streaming', // Will be set by main method
            rendererType: 'text',
            renderer: textRenderer
        };
    }

    /**
     * Create a tag segment (either ProcessedTagSegment or MetadataTagSegment)
     */
    private createTagSegment(tagType: string, tagContent: string, segments: ProcessedSegment[]): ProcessedTagSegment | MetadataTagSegment {
        const nextId = segments.length;

        // console.log('[SEGMENT-PROCESSOR] Creating tag segment:', {
        //     tagType,
        //     tagContentLength: tagContent.length,
        //     tagContentPreview: tagContent.slice(0, 100),
        //     segmentId: nextId
        // });

        // Check if this is a metadata handler (metadata tags don't render inline)
        const metadataHandler = this.#componentRegistry.getMetadataHandler(tagType);
        if (metadataHandler) {
            // console.log('[SEGMENT-PROCESSOR] Creating metadata tag segment:', {
            //     tagType,
            //     segmentId: nextId
            // });
            // Create metadata tag segment
            const metadataSegment: MetadataTagSegment = {
                id: nextId,
                segmentType: 'tag',
                tag: tagType,
                rawContent: tagContent,
                streamingStatus: 'streaming', // Will be set by main method
                rendererType: tagType,
                renderer: undefined,
                isMetadata: true
            };
            return metadataSegment;
        }

        // Create regular tag segment with renderer
        const renderer = this.#componentRegistry.getRenderer(tagType);
        // console.log('[SEGMENT-PROCESSOR] Creating regular tag segment:', {
        //     tagType,
        //     segmentId: nextId,
        //     hasRenderer: !!renderer
        // });
        const tagSegment: ProcessedTagSegment = {
            id: nextId,
            segmentType: 'tag',
            tag: tagType,
            rawContent: tagContent,
            streamingStatus: 'streaming', // Will be set by main method
            rendererType: tagType,
            renderer: renderer
        };
        return tagSegment;
    }

    /**
     * Check if a tag segment is complete (has both opening and closing tags)
     * Complete tags should not be converted to text by doneStreaming
     */
    private isTagSegmentComplete(segment: ProcessedSegment): boolean {
        // Text segments are not tag segments
        if (isProcessedTextSegment(segment)) {
            return false;
        }

        // If the segment is already marked as completed, it's complete
        if (segment.streamingStatus === 'completed') {
            return true;
        }

        // Incomplete segments (like "<ta") are not complete
        if (segment.streamingStatus === 'incomplete') {
            return false;
        }

        // For streaming tag segments, check if the content suggests completeness
        // A complete tag would have been detected during parsing and marked as completed
        // If we reach here, it's truly a streaming/incomplete tag
        return false;
    }

    /**
     * Apply metadata handlers to completed metadata segments
     */
    applyMetadataHandlers(segments: ProcessedSegment[], message: ChatMessageForRendering, chatAppState: ChatAppState, appState: AppState): void {
        segments.forEach((segment) => {
            if ('isMetadata' in segment && segment.isMetadata && segment.streamingStatus === 'completed') {
                const handler = this.#componentRegistry.getMetadataHandler(segment.tag);
                if (handler) {
                    try {
                        handler(segment as MetadataTagSegment, message, chatAppState, appState);
                    } catch (error) {
                        console.error(`Error applying metadata handler for tag '${segment.tag}':`, error);
                    }
                }
            }
        });
    }
}
