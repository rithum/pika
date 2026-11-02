import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { isFileInput } from '../src/lib/client/features/chat/chat-app-main/chat-scroll';

// A file input inside a shadow root is retargeted to its host at the window listener, so it is not exempt. Known limit.
describe('isFileInput', () => {
    const { document } = new JSDOM('<input id="f" type="file"><input id="t" type="text"><div id="d"></div>').window;

    it('is true for a file input', () => {
        expect(isFileInput(document.getElementById('f'))).toBe(true);
    });

    it('is false for a text input', () => {
        expect(isFileInput(document.getElementById('t'))).toBe(false);
    });

    it('is false for a div', () => {
        expect(isFileInput(document.getElementById('d'))).toBe(false);
    });

    it('is false for null', () => {
        expect(isFileInput(null)).toBe(false);
    });
});
