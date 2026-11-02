export const STICKY_BOTTOM_THRESHOLD_PX = 40;

export type ScrollMetrics = Pick<Element, 'scrollHeight' | 'scrollTop' | 'clientHeight'>;

export function isScrolledToBottom(element: ScrollMetrics, threshold = STICKY_BOTTOM_THRESHOLD_PX): boolean {
    return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
}

export interface ScrollSnapshot {
    scrollTop: number;
    maxScroll: number;
}

export function snapshotScroll(element: ScrollMetrics): ScrollSnapshot {
    return { scrollTop: element.scrollTop, maxScroll: element.scrollHeight - element.clientHeight };
}

/** Growth never lowers scrollTop, and a clamp lowers it together with maxScroll, so any other upward move is the user's. */
export function stickinessAfterScroll(wasSticky: boolean, element: ScrollMetrics, previous: ScrollSnapshot): boolean {
    const now = snapshotScroll(element);
    const drop = previous.scrollTop - now.scrollTop;
    if (drop > 0 && previous.maxScroll - now.maxScroll < drop) return false;
    if (isScrolledToBottom(element) && drop <= 0) return true;
    return wasSticky;
}

const isElement = (target: EventTarget | null): target is Element =>
    target !== null && (target as Node).nodeType === 1;

/** True when the gesture would scroll a nested scroller (such as a code block) instead of the chat. */
export function isInsideScrollableAncestor(target: EventTarget | null, root: Element, deltaY: number): boolean {
    let node = isElement(target) ? target : null;
    while (node && node !== root) {
        const view = node.ownerDocument.defaultView;
        const overflowY = view?.getComputedStyle(node).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
            if (deltaY < 0 && node.scrollTop > 0) return true;
            if (deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) return true;
        }
        node = node.parentElement;
    }
    return false;
}

export function isFileInput(target: EventTarget | null): boolean {
    return isElement(target) && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'file';
}

/** An upward wheel is the user leaving the bottom even when the move is smaller than the threshold. */
export function stickinessAfterWheel(wasSticky: boolean, deltaY: number): boolean {
    return deltaY < 0 ? false : wasSticky;
}

/** settle: re-assert bottom over several frames while restored content lays out; jump: one rAF; none: leave it to the sticky ResizeObserver. */
export type ScrollAction = 'settle' | 'jump' | 'none';

export interface ScrollTriggers {
    sessionChanged: boolean;
    newMessage: boolean;
    openingOntoMessages: boolean;
}

export function nextScrollAction({ sessionChanged, newMessage, openingOntoMessages }: ScrollTriggers): ScrollAction {
    if (openingOntoMessages || sessionChanged) return 'settle';
    if (newMessage) return 'jump';
    return 'none';
}

export interface ScrollObservation {
    action: ScrollAction;
    sessionChanged: boolean;
}

/** The panel mounts empty and the conversation arrives a tick later, so "opened" is the first observation that has messages. */
export function createScrollTracker() {
    let prevMessageCount = -1;
    let prevSession: unknown = undefined;
    let hasPositionedOnOpen = false;

    return {
        observe(session: unknown, messageCount: number): ScrollObservation {
            const sessionChanged = prevSession !== undefined && prevSession !== session;
            const newMessage = prevMessageCount !== -1 && messageCount > prevMessageCount;
            const openingOntoMessages = !hasPositionedOnOpen && messageCount > 0;
            prevSession = session;
            prevMessageCount = messageCount;
            const action = nextScrollAction({ sessionChanged, newMessage, openingOntoMessages });
            if (action === 'settle') hasPositionedOnOpen = true;
            return { action, sessionChanged };
        },
    };
}

export interface SettleOptions {
    frames: number;
    schedule: (step: () => void) => void;
    isSticky: () => boolean;
    /** Returns false when there is nothing to pin (element unmounted), which ends the run. */
    pin: () => boolean;
}

/** The first frame pins unconditionally: stickiness left over from the previous session must not veto the switch. */
export function settleToBottom({ frames, schedule, isSticky, pin }: SettleOptions): void {
    let framesLeft = frames;
    let first = true;
    const step = () => {
        if (!first && !isSticky()) return;
        first = false;
        if (!pin()) return;
        if (--framesLeft > 0) schedule(step);
    };
    schedule(step);
}
