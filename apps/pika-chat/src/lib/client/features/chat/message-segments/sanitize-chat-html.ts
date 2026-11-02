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
// Lifting a tag also lifts the URL attribute it cannot work without.
const ATTR_LIFTED_BY_TAGS: Record<string, readonly string[]> = { srcset: ['img', 'source'], poster: ['video'] };
const TABLE_ALIGN_STYLE = /^\s*text-align\s*:\s*(left|center|right)\s*;?\s*$/;
const TABLE_CELL_TAGS: ReadonlySet<string> = new Set(['th', 'td']);

export function createChatHtmlSanitizer(allowList: ChatHtmlAllowList): (html: string) => string {
    const tagSet: ReadonlySet<string> = new Set(allowList.tags);
    const attrSets = new Map(Object.entries(allowList.attrs).map(([tag, attrs]) => [tag, new Set(attrs)]));
    const forbiddenTags = FORBIDDEN_TAGS.filter((tag) => !tagSet.has(tag));
    const forbiddenAttrs = FORBIDDEN_ATTRS.filter(
        (attr) => !(ATTR_LIFTED_BY_TAGS[attr] ?? []).some((tag) => tagSet.has(tag))
    );

    const purify = DOMPurify();
    purify.addHook('uponSanitizeAttribute', (node, data) => {
        const tag = node.nodeName.toLowerCase();
        if (TABLE_CELL_TAGS.has(tag) && data.attrName === 'style' && TABLE_ALIGN_STYLE.test(data.attrValue)) {
            data.forceKeepAttr = true;
            return;
        }
        const listed = attrSets.get(tag);
        if (!listed || !tagSet.has(tag) || tag.includes('-')) return;
        const lifted = Object.entries(ATTR_LIFTED_BY_TAGS).some(
            ([attr, tags]) => attr === data.attrName && tags.includes(tag)
        );
        if (!listed.has(data.attrName) && !lifted) data.keepAttr = false;
    });

    return (html: string): string => {
        if (!purify.isSupported) {
            console.error('[sanitizeChatHtml] DOMPurify is not supported — refusing to render unsanitized HTML');
            return '';
        }

        return purify.sanitize(html, {
            CUSTOM_ELEMENT_HANDLING: {
                tagNameCheck: (tagName: string) => tagSet.has(tagName),
                attributeNameCheck: (attributeName: string, tagName?: string) =>
                    !!tagName &&
                    CUSTOM_ATTRIBUTE_NAME_PATTERN.test(attributeName) &&
                    (attrSets.get(tagName)?.has(attributeName) ?? false),
                allowCustomizedBuiltInElements: false,
            },
            FORBID_TAGS: forbiddenTags,
            FORBID_ATTR: forbiddenAttrs,
        });
    };
}

export const sanitizeChatHtml = createChatHtmlSanitizer({ tags: allowedCustomTags, attrs: allowedCustomAttrs });
