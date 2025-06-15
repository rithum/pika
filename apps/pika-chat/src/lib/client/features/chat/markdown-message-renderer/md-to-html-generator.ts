import type { AppState } from '$client/app/app.state.svelte';
import MarkdownIt from 'markdown-it';
import { mount, type Component } from 'svelte';
import type { ChatAppState } from '../chat-app.state.svelte';

// Types
export interface ParsedSegment {
    type: 'html' | 'placeholder' | 'component';
    content: string;
    tagType?: string;
    tagContent?: string;
    id?: string;
}

export interface MarkdownRenderResult {
    segments: ParsedSegment[];
    hasIncompleteTag: boolean;
    incompleteTagContent: string;
}

// Supported custom tags
const SUPPORTED_TAGS = ['prompt', 'chart', 'image', 'chat', 'download'] as const;
type SupportedTag = (typeof SUPPORTED_TAGS)[number];

// Type for component map
export type TagComponentMap = Record<SupportedTag, Component>;

// Tag patterns for detection
const TAG_PATTERNS = {
    // Matches complete tags: <tagname>content</tagname>
    complete: new RegExp(`<(${SUPPORTED_TAGS.join('|')})>([\\s\\S]*?)<\\/\\1>`, 'g'),
    // Matches potentially incomplete opening tags
    incompleteOpen: new RegExp(`<(${SUPPORTED_TAGS.join('|')})(?:[^>]*)?$`),
    // Matches incomplete closing tags
    incompleteClose: new RegExp(`<\\/(${SUPPORTED_TAGS.join('|')})(?:[^>]*)?$`),
};

export class MarkdownToHtmlGenerator {
    private md: MarkdownIt;
    private componentIdCounter = 0;

    constructor() {
        // Initialize markdown-it with safe defaults
        this.md = new MarkdownIt({
            html: true,
            linkify: true,
            typographer: true,
            breaks: true,
        });
    }

    /**
     * Parse markdown content (streaming or complete) and return segments
     */
    parseMarkdown(content: string, previousIncompleteTag: string = ''): MarkdownRenderResult {
        // Combine with any previous incomplete tag
        const fullContent = previousIncompleteTag + content;

        // Check for incomplete tags at the end
        const incompleteTagResult = this.detectIncompleteTag(fullContent);
        let processableContent = incompleteTagResult.processableContent;

        // Extract complete tags and create segments
        const segments: ParsedSegment[] = [];
        let lastIndex = 0;

        // Reset the regex lastIndex
        TAG_PATTERNS.complete.lastIndex = 0;

        let match;
        while ((match = TAG_PATTERNS.complete.exec(processableContent)) !== null) {
            // Add any markdown content before this tag
            if (match.index > lastIndex) {
                const markdownContent = processableContent.slice(lastIndex, match.index);
                if (markdownContent.trim()) {
                    segments.push({
                        type: 'html',
                        content: this.md.render(markdownContent),
                    });
                }
            }

            // Add the tag as a placeholder segment
            const tagType = match[1] as SupportedTag;
            const tagContent = match[2];
            const id = `${tagType}-${this.componentIdCounter++}`;

            segments.push({
                type: 'placeholder',
                content: this.createPlaceholder(tagType, id),
                tagType,
                tagContent,
                id,
            });

            lastIndex = match.index + match[0].length;
        }

        // Add any remaining markdown content
        if (lastIndex < processableContent.length) {
            const remainingContent = processableContent.slice(lastIndex);
            if (remainingContent.trim()) {
                segments.push({
                    type: 'html',
                    content: this.md.render(remainingContent),
                });
            }
        }

        return {
            segments,
            hasIncompleteTag: incompleteTagResult.hasIncompleteTag,
            incompleteTagContent: incompleteTagResult.incompleteTagContent,
        };
    }

    /**
     * Detect incomplete tags at the end of content
     */
    private detectIncompleteTag(content: string): {
        processableContent: string;
        hasIncompleteTag: boolean;
        incompleteTagContent: string;
    } {
        // Look for incomplete tags at the end
        const lastOpenTagIndex = content.lastIndexOf('<');

        if (lastOpenTagIndex === -1) {
            return {
                processableContent: content,
                hasIncompleteTag: false,
                incompleteTagContent: '',
            };
        }

        const potentialTag = content.slice(lastOpenTagIndex);

        // Check if it's a complete tag
        const closeTagIndex = potentialTag.indexOf('>');
        if (closeTagIndex !== -1) {
            // Tag is complete, check if it's one of our supported tags that needs a closing tag
            const tagMatch = potentialTag.match(/^<(prompt|chart|image|chat|download)>/);
            if (tagMatch) {
                const tagName = tagMatch[1];
                const expectedClosingTag = `</${tagName}>`;
                const closingTagIndex = content.lastIndexOf(expectedClosingTag);

                if (closingTagIndex === -1 || closingTagIndex < lastOpenTagIndex) {
                    // Opening tag exists but no closing tag
                    return {
                        processableContent: content.slice(0, lastOpenTagIndex),
                        hasIncompleteTag: true,
                        incompleteTagContent: content.slice(lastOpenTagIndex),
                    };
                }
            }

            // Either not our tag or has proper closing
            return {
                processableContent: content,
                hasIncompleteTag: false,
                incompleteTagContent: '',
            };
        }

        // Check if it might be the start of one of our tags
        if (TAG_PATTERNS.incompleteOpen.test(potentialTag) || TAG_PATTERNS.incompleteClose.test(potentialTag)) {
            return {
                processableContent: content.slice(0, lastOpenTagIndex),
                hasIncompleteTag: true,
                incompleteTagContent: potentialTag,
            };
        }

        // Not one of our tags
        return {
            processableContent: content,
            hasIncompleteTag: false,
            incompleteTagContent: '',
        };
    }

    /**
     * Create a placeholder div for a tag
     */
    private createPlaceholder(tagType: SupportedTag, id: string): string {
        const placeholderContent = this.getPlaceholderContent(tagType);
        return `<div class="markdown-tag-placeholder" data-tag-type="${tagType}" data-tag-id="${id}">${placeholderContent}</div>`;
    }

    /**
     * Get placeholder content based on tag type
     */
    private getPlaceholderContent(tagType: SupportedTag): string {
        switch (tagType) {
            case 'prompt':
                return '<div class="animate-pulse bg-gray-100 rounded p-3 text-gray-500">Loading prompt...</div>';
            case 'chart':
                return '<div class="animate-pulse bg-gray-100 rounded p-6 text-center text-gray-500">Loading chart...</div>';
            case 'image':
                return '<div class="animate-pulse bg-gray-100 rounded p-12 text-center text-gray-500">Loading image...</div>';
            case 'chat':
                return '<div class="animate-pulse bg-gray-100 rounded p-3 text-gray-500">Loading chat component...</div>';
            case 'download':
                return '<div class="animate-pulse bg-gray-100 rounded p-3 text-gray-500">Loading download...</div>';
            default:
                return '<div class="animate-pulse bg-gray-100 rounded p-3 text-gray-500">Loading...</div>';
        }
    }

    /**
     * Combine segments into HTML string
     */
    combineSegments(segments: ParsedSegment[]): string {
        return segments.map((segment) => segment.content).join('');
    }
}

/**
 * Helper function to mount Svelte components in placeholders
 */
export function hydrateComponents(
    container: HTMLElement,
    segments: ParsedSegment[],
    componentMap: Record<string, Component<any, {}, ''>>,
    chatAppState: ChatAppState,
    appState: AppState
): void {
    const componentSegments = segments.filter((s) => s.type === 'placeholder');

    for (const segment of componentSegments) {
        if (!segment.id || !segment.tagType || segment.tagContent === undefined) continue;

        const placeholder = container.querySelector(`[data-tag-id="${segment.id}"]`);
        if (!placeholder || !(placeholder instanceof HTMLElement)) continue;

        try {
            const ComponentClass = componentMap[segment.tagType];

            if (!ComponentClass) {
                throw new Error(`Component not found for tag type: ${segment.tagType}`);
            }

            // Clear placeholder content
            placeholder.innerHTML = '';

            // Mount the component using Svelte 5 API
            mount(ComponentClass, {
                target: placeholder,
                props: {
                    rawTagContent: segment.tagContent,
                    appState,
                    chatAppState,
                },
            });

            // Remove placeholder classes
            placeholder.classList.remove('markdown-tag-placeholder');
        } catch (error) {
            console.error(`Failed to load component for tag type: ${segment.tagType}`, error);
            placeholder.innerHTML = `<div class="text-red-500">Error loading ${segment.tagType} component</div>`;
        }
    }
}

/**
 * Streaming markdown processor that maintains state
 */
export class StreamingMarkdownProcessor {
    private generator: MarkdownToHtmlGenerator;
    private incompleteTagBuffer: string = '';
    private allSegments: ParsedSegment[] = [];
    private accumulatedContent: string = '';

    constructor() {
        this.generator = new MarkdownToHtmlGenerator();
    }

    /**
     * Process a chunk of markdown content
     */
    processChunk(chunk: string): {
        newSegments: ParsedSegment[];
        fullHtml: string;
    } {
        // Accumulate all content
        this.accumulatedContent += chunk;

        // Reparse the entire accumulated content to maintain markdown structure integrity
        const result = this.generator.parseMarkdown(this.accumulatedContent);

        // Update incomplete tag buffer
        this.incompleteTagBuffer = result.incompleteTagContent;

        // Calculate new segments (segments that weren't in the previous parse)
        const previousSegmentCount = this.allSegments.length;
        this.allSegments = result.segments;
        const newSegments = result.segments.slice(previousSegmentCount);

        // Generate full HTML
        const fullHtml = this.generator.combineSegments(this.allSegments);

        return {
            newSegments,
            fullHtml,
        };
    }

    /**
     * Finalize processing (call when streaming is complete)
     */
    finalize(): {
        finalSegments: ParsedSegment[];
        fullHtml: string;
    } {
        // If there's an incomplete tag buffer, it means we have partial tag content
        // that wasn't processed. Since streaming is complete, we should treat it
        // as regular markdown content
        if (this.incompleteTagBuffer) {
            // Append the incomplete tag buffer to accumulated content
            this.accumulatedContent += this.incompleteTagBuffer;

            // Reparse everything one final time
            const finalResult = this.generator.parseMarkdown(this.accumulatedContent);
            this.allSegments = finalResult.segments;
            this.incompleteTagBuffer = '';
        }

        const fullHtml = this.generator.combineSegments(this.allSegments);

        return {
            finalSegments: this.allSegments,
            fullHtml,
        };
    }

    /**
     * Reset the processor for a new message
     */
    reset(): void {
        this.incompleteTagBuffer = '';
        this.allSegments = [];
        this.accumulatedContent = '';
    }

    /**
     * Get current segments
     */
    getSegments(): ParsedSegment[] {
        return this.allSegments;
    }
}
