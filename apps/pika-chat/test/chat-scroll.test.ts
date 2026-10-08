import { describe, expect, it } from '@jest/globals';
import {
    STICKY_BOTTOM_THRESHOLD_PX,
    createScrollTracker,
    isScrolledToBottom,
    nextScrollAction,
    settleToBottom,
    stickinessAfterScroll,
    stickinessAfterWheel,
} from '../src/lib/client/features/chat/chat-app-main/chat-scroll';

const metrics = (scrollHeight: number, scrollTop: number, clientHeight: number) => ({
    scrollHeight,
    scrollTop,
    clientHeight,
});

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

describe('stickinessAfterScroll', () => {
    it('stays sticky when content grows past the threshold without the user scrolling', () => {
        expect(stickinessAfterScroll(true, metrics(1200, 600, 400), 600)).toBe(true);
    });

    it('stays sticky when our own write moves the view down', () => {
        expect(stickinessAfterScroll(true, metrics(1200, 800, 400), 600)).toBe(true);
    });

    it('unsticks when the user scrolls up away from the bottom', () => {
        expect(stickinessAfterScroll(true, metrics(1200, 300, 400), 800)).toBe(false);
    });

    it('stays sticky on a small upward nudge that is still within the threshold', () => {
        expect(stickinessAfterScroll(true, metrics(1000, 590, 400), 600)).toBe(true);
    });

    it('re-sticks when the user scrolls back to the bottom', () => {
        expect(stickinessAfterScroll(false, metrics(1000, 600, 400), 300)).toBe(true);
    });

    it('stays unstuck when the user scrolls down but not to the bottom', () => {
        expect(stickinessAfterScroll(false, metrics(2000, 900, 400), 300)).toBe(false);
    });
});

describe('stickinessAfterWheel', () => {
    it('unsticks on an upward wheel, however small', () => {
        expect(stickinessAfterWheel(true, -1)).toBe(false);
    });

    it('leaves stickiness alone on a downward or zero wheel', () => {
        expect(stickinessAfterWheel(true, 5)).toBe(true);
        expect(stickinessAfterWheel(false, 5)).toBe(false);
        expect(stickinessAfterWheel(true, 0)).toBe(true);
    });
});

describe('settleToBottom', () => {
    const harness = (opts: { sticky: boolean; frames?: number; mounted?: () => boolean }) => {
        const queue: Array<() => void> = [];
        let sticky = opts.sticky;
        let pins = 0;
        settleToBottom({
            frames: opts.frames ?? 5,
            schedule: (step) => queue.push(step),
            isSticky: () => sticky,
            pin: () => {
                if (opts.mounted && !opts.mounted()) return false;
                pins++;
                sticky = true;
                return true;
            },
        });
        const flush = (max = 100) => {
            for (let i = 0; i < max && queue.length; i++) queue.shift()!();
        };
        return {
            flush,
            runFrame: () => queue.shift()?.(),
            unstick: () => (sticky = false),
            pins: () => pins,
        };
    };

    it('pins on the first frame even when stickiness was off before the run', () => {
        const h = harness({ sticky: false });
        h.runFrame();
        expect(h.pins()).toBe(1);
    });

    it('re-pins for the bounded number of frames while sticky', () => {
        const h = harness({ sticky: true, frames: 5 });
        h.flush();
        expect(h.pins()).toBe(5);
    });

    it('yields once the user scrolls away after the first frame', () => {
        const h = harness({ sticky: true, frames: 5 });
        h.runFrame();
        h.runFrame();
        h.unstick();
        h.flush();
        expect(h.pins()).toBe(2);
    });

    it('stops when there is nothing to pin', () => {
        const h = harness({ sticky: true, frames: 5, mounted: () => false });
        h.flush();
        expect(h.pins()).toBe(0);
    });
});
