import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
import { getContext, setContext } from 'svelte';

type Getter<T> = () => T;

export type SlideoutStateProps = {
    /**
     * A getter function that returns the current open state of the slideout.
     * We use a getter function here to support `bind:open` on the provider component.
     */
    open: Getter<boolean>;

    /**
     * A function that sets the open state of the slideout.
     */
    setOpen: (open: boolean) => void;

    /**
     * The side that the slideout appears on
     */
    side?: 'left' | 'right';

    initialWidth?: number; // Allow setting initial width
};

export class SlideoutState {
    readonly props: SlideoutStateProps;
    open = $derived.by(() => this.props.open());
    openMobile = $state(false);
    setOpen: SlideoutStateProps['setOpen'];
    side = $state<'left' | 'right'>('right');
    panelWidth = $state(320);
    isDragging = $state(false);
    #isMobile: IsMobile;
    state = $derived.by(() => (this.open ? 'expanded' : 'collapsed'));
    widthBeforeMaximized: number | undefined = $state(undefined);
    isMaximized = $state(false);
    isAnimating = $state(false);

    constructor(props: SlideoutStateProps) {
        this.setOpen = props.setOpen;
        this.#isMobile = new IsMobile();
        this.props = props;
        this.side = props.side || 'right';
        this.panelWidth = props.initialWidth || 320;

        $effect(() => {
            this.openMobile = this.open;
        });
    }

    // Convenience getter for checking if mobile
    get isMobile() {
        return this.#isMobile.current;
    }

    toggleMaximize = () => {
        if (this.isMobile) return;

        this.isMaximized = !this.isMaximized;
        if (this.isMaximized) {
            this.widthBeforeMaximized = this.panelWidth;
        } else {
            this.panelWidth = this.widthBeforeMaximized || 320;
        }
    };

    setPanelWidth = (width: number) => {
        // Apply constraints
        this.panelWidth = Math.max(200, Math.min(window.innerWidth * 0.8, width)); // Example: max 80% viewport
    };

    setIsDragging = (dragging: boolean) => {
        this.isDragging = dragging;
    };

    // Event handler for keyboard shortcuts
    handleShortcutKeydown = (e: KeyboardEvent) => {
        // Add keyboard shortcut handling here if needed
    };

    setOpenMobile = (value: boolean) => {
        this.openMobile = value;
        this.setOpen(value);
    };

    toggle = () => {
        return this.#isMobile.current ? (this.openMobile = !this.openMobile) : this.setOpen(!this.open);
    };
}

const SYMBOL_KEY = 'scn-slideout';

/**
 * Instantiates a new `SlideoutState` instance and sets it in the context.
 *
 * @param props The constructor props for the `SlideoutState` class.
 * @returns The `SlideoutState` instance.
 */
export function setSlideout(props: SlideoutStateProps): SlideoutState {
    return setContext(Symbol.for(SYMBOL_KEY), new SlideoutState(props));
}

/**
 * Retrieves the `SlideoutState` instance from the context.
 * @returns The `SlideoutState` instance.
 */
export function useSlideout(): SlideoutState {
    return getContext(Symbol.for(SYMBOL_KEY));
}
