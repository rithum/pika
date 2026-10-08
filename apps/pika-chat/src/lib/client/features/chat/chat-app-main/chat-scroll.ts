export const STICKY_BOTTOM_THRESHOLD_PX = 40;

export type ScrollMetrics = Pick<Element, 'scrollHeight' | 'scrollTop' | 'clientHeight'>;

export function isScrolledToBottom(element: ScrollMetrics, threshold = STICKY_BOTTOM_THRESHOLD_PX): boolean {
    return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
}

/** Content growth fires scroll events before the ResizeObserver can re-pin, so only an upward move may unstick. */
export function stickinessAfterScroll(wasSticky: boolean, element: ScrollMetrics, previousScrollTop: number): boolean {
    return isScrolledToBottom(element) || (wasSticky && element.scrollTop >= previousScrollTop);
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
        }
    };
}
