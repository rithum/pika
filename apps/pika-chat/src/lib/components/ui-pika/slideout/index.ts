import { useSlideout } from './context.svelte.js';
import Content from './slideout-content.svelte';
import Panel from './slideout-panel.svelte';
import Provider from './slideout-provider.svelte';
import Root from './slideout.svelte';

export {
    Content,
    Panel,
    Provider,
    Root,
    // Aliased exports
    Root as Slideout,
    Content as SlideoutContent,
    Panel as SlideoutPanel,
    Provider as SlideoutProvider,
    // Hooks
    useSlideout
};
