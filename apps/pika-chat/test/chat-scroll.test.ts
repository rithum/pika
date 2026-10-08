import { describe, expect, it } from '@jest/globals';
import {
    STICKY_BOTTOM_THRESHOLD_PX,
    createScrollTracker,
    isScrolledToBottom,
    nextScrollAction
} from '../src/lib/client/features/chat/chat-app-main/chat-scroll';

const metrics = (scrollHeight: number, scrollTop: number, clientHeight: number) => ({ scrollHeight, scrollTop, clientHeight });

describe('isScrolledToBottom', () => {
    it('is true when exactly at the bottom', () => {
        expect(isScrolledToBottom(metrics(1000, 600, 400))).toBe(true);
    });

    it('is true just inside the threshold', () => {
        expect(isScrolledToBottom(metrics(1000, 600 - (STICKY_BOTTOM_THRESHOLD_PX - 1), 400))).toBe(true);
    });

    it('is false at the threshold', () => {
        expect(isScrolledToBottom(metrics(1000, 600 - STICKY_BOTTOM_THRESHOLD_PX, 400))).toBe(false);
    });

    it('is false when scrolled well up', () => {
        expect(isScrolledToBottom(metrics(1000, 0, 400))).toBe(false);
    });

    it('is true when content fits without scrolling', () => {
        expect(isScrolledToBottom(metrics(300, 0, 400))).toBe(true);
    });

    it('honors a custom threshold', () => {
        expect(isScrolledToBottom(metrics(1000, 500, 400), 101)).toBe(true);
        expect(isScrolledToBottom(metrics(1000, 500, 400), 100)).toBe(false);
    });
});

describe('nextScrollAction', () => {
    const none = { sessionChanged: false, newMessage: false, openingOntoMessages: false };

    it('does nothing when nothing changed', () => {
        expect(nextScrollAction(none)).toBe('none');
    });

    it('jumps on a new message mid-conversation', () => {
        expect(nextScrollAction({ ...none, newMessage: true })).toBe('jump');
    });

    it('settles when opening onto messages', () => {
        expect(nextScrollAction({ ...none, openingOntoMessages: true })).toBe('settle');
    });

    it('settles on a session switch', () => {
        expect(nextScrollAction({ ...none, sessionChanged: true })).toBe('settle');
    });

    it('prefers settle over jump when a switch also adds messages', () => {
        expect(nextScrollAction({ sessionChanged: true, newMessage: true, openingOntoMessages: false })).toBe('settle');
    });
});

describe('createScrollTracker', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };

    it('does nothing while the panel is empty', () => {
        const t = createScrollTracker();
        expect(t.observe(undefined, 0)).toEqual({ action: 'none', sessionChanged: false });
        expect(t.observe(a, 0)).toEqual({ action: 'none', sessionChanged: false });
    });

    it('settles once when the conversation first arrives, then jumps for new messages', () => {
        const t = createScrollTracker();
        t.observe(a, 0);
        expect(t.observe(a, 3).action).toBe('settle');
        expect(t.observe(a, 4).action).toBe('jump');
        expect(t.observe(a, 4).action).toBe('none');
    });

    it('settles when mounted directly onto an existing conversation', () => {
        const t = createScrollTracker();
        expect(t.observe(a, 5).action).toBe('settle');
        expect(t.observe(a, 5).action).toBe('none');
    });

    it('settles and reports a session change on switch', () => {
        const t = createScrollTracker();
        t.observe(a, 5);
        expect(t.observe(b, 2)).toEqual({ action: 'settle', sessionChanged: true });
    });

    it('does not jump when messages are removed', () => {
        const t = createScrollTracker();
        t.observe(a, 5);
        expect(t.observe(a, 3).action).toBe('none');
    });

    it('does not treat the first defined session as a switch', () => {
        const t = createScrollTracker();
        t.observe(undefined, 0);
        expect(t.observe(a, 0).sessionChanged).toBe(false);
    });
});
