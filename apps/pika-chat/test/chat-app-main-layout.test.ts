/** Source-text guards for chat-app-main.svelte layout and scroll invariants that can't be mounted under jsdom. */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
    resolve(__dirname, '../src/lib/client/features/chat/chat-app-main/chat-app-main.svelte'),
    'utf8'
);

function functionBody(name: string): string {
    const start = source.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThanOrEqual(0);
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
    }
    throw new Error(`unterminated function ${name}`);
}

describe('chat-app-main.svelte layout', () => {
    it('does not pin any element to the bottom with absolute positioning', () => {
        expect(source).not.toMatch(/absolute\s+bottom-0/);
    });

    it('does not track an input region height', () => {
        expect(source).not.toContain('inputRegionHeight');
    });

    it('caps every content container with the max-width CSS variable and no hard-coded 768px class', () => {
        expect(source.split('var(--chat-content-max-width, 768px)')).toHaveLength(6);
        expect(source).not.toContain('max-w-[768px]');
    });

    it('scrollToBottom writes scrollTop before arming stickToBottom', () => {
        const body = functionBody('scrollToBottom');
        const write = body.indexOf('resizeHeightEl.scrollTop = resizeHeightEl.scrollHeight;');
        const arm = body.indexOf('stickToBottom = true;');
        expect(write).toBeGreaterThanOrEqual(0);
        expect(arm).toBeGreaterThan(write);
    });

    it('routes message and session changes through the scroll tracker', () => {
        expect(source).toContain('createScrollTracker()');
        expect(source).toMatch(/action === 'settle'\) scrollToBottomSettled\(\)/);
        expect(source).toMatch(/action === 'jump'\) scrollToBottom\(\)/);
    });

    it('growth re-pins yield to a user who scrolled away after the re-pin was queued', () => {
        const body = functionBody('scrollToBottom');
        expect(body).toContain('if (onlyIfStillSticky && !stickToBottom) return;');
        expect(source).toContain('scrollToBottom(true);');
        expect(source).toContain("el.addEventListener('wheel', handleWheel, { passive: true });");
    });

    it('defines OPEN_SETTLE_FRAMES', () => {
        expect(source).toMatch(/const OPEN_SETTLE_FRAMES = \d+;/);
    });
});
