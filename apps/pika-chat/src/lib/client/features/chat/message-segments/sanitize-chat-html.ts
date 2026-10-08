// MarkdownIt runs with html:true, so model-authored HTML reaches innerHTML/{@html} sinks. Anything that
// fetches a URL on render (images, media, SVG references, style sheets) is forbidden by default because an
// injected URL can exfiltrate data on load.
import DOMPurify from 'dompurify';
import { allowedCustomAttrs, allowedCustomTags } from '$lib/custom/chat-html-allowed-tags';

export interface ChatHtmlAllowList {
    tags: readonly string[];
    attrs: Readonly<Record<string, readonly string[]>>;
}

const CUSTOM_ATTRIBUTE_NAME_PATTERN = /^(?!on)[a-zA-Z][a-zA-Z0-9-]*$/;
const FORBIDDEN_TAGS = [
    'form',
    'input',
    'button',
    'select',
    'textarea',
    'iframe',
    'object',
    'embed',
    'img',
    'picture',
    'source',
    'video',
    'audio',
    'track',
    'style',
    'svg',
    'math',
];
const FORBIDDEN_ATTRS = ['style', 'action', 'method', 'formaction', 'srcdoc', 'srcset', 'poster', 'background'];

export function createChatHtmlSanitizer(allowList: ChatHtmlAllowList): (html: string) => string {
    const tagSet: ReadonlySet<string> = new Set(allowList.tags);
    const attrSets = new Map(Object.entries(allowList.attrs).map(([tag, attrs]) => [tag, new Set(attrs)]));

    return (html: string): string => {
        if (!DOMPurify.isSupported) {
            console.error('[sanitizeChatHtml] DOMPurify is not supported — refusing to render unsanitized HTML');
            return '';
        }

        return DOMPurify.sanitize(html, {
            CUSTOM_ELEMENT_HANDLING: {
                tagNameCheck: (tagName: string) => tagSet.has(tagName),
                attributeNameCheck: (attributeName: string, tagName?: string) =>
                    !!tagName &&
                    CUSTOM_ATTRIBUTE_NAME_PATTERN.test(attributeName) &&
                    (attrSets.get(tagName)?.has(attributeName) ?? false),
                allowCustomizedBuiltInElements: false,
            },
            FORBID_TAGS: FORBIDDEN_TAGS.filter((tag) => !tagSet.has(tag)),
            FORBID_ATTR: [...FORBIDDEN_ATTRS],
        });
    };
}

export const sanitizeChatHtml = createChatHtmlSanitizer({ tags: allowedCustomTags, attrs: allowedCustomAttrs });
