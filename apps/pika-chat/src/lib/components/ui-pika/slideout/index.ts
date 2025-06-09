import Root from './slideout.svelte';
import Content from './slideout-content.svelte';
import Panel from './slideout-panel.svelte';
import Provider from './slideout-provider.svelte';
import { useSlideout } from './context.svelte.js';

export {
    Root,
    Content,
    Panel,
    Provider,
    // Aliased exports
    Root as Slideout,
    Content as SlideoutContent,
    Panel as SlideoutPanel,
    Provider as SlideoutProvider,
    // Hooks
    useSlideout,
};
