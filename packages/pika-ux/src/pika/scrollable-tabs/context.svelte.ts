import { getContext, setContext } from 'svelte';

const SCROLLABLE_TABS_CONTEXT_KEY = Symbol('SCROLLABLE_TABS_CONTEXT');

export interface ScrollableTabsContext {
    getValue: () => string;
    onValueChange: (value: string) => void;
    onClose?: (value: string) => void;
    onPin?: (value: string) => void;
    onUnpin?: (value: string) => void;
}

export function setScrollableTabsContext(context: ScrollableTabsContext) {
    setContext(SCROLLABLE_TABS_CONTEXT_KEY, context);
}

export function getScrollableTabsContext(): ScrollableTabsContext {
    const context = getContext<ScrollableTabsContext>(SCROLLABLE_TABS_CONTEXT_KEY);
    if (!context) {
        throw new Error('ScrollableTabs context not found. Make sure components are used within ScrollableTabs.Root');
    }
    return context;
}
