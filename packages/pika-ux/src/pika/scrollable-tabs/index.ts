import Root from './root.svelte';
import List from './list.svelte';
import PinnedSection from './pinned-section.svelte';
import ScrollableSection from './scrollable-section.svelte';
import Trigger from './trigger.svelte';
import PinnedTrigger from './pinned-trigger.svelte';
import AddButton from './add-button.svelte';
import Content from './content.svelte';
import OverflowMenu from './overflow-menu.svelte';

export {
    Root,
    List,
    PinnedSection,
    ScrollableSection,
    Trigger,
    PinnedTrigger,
    AddButton,
    Content,
    OverflowMenu,
    //
    Root as ScrollableTabs,
    List as ScrollableTabsList,
    PinnedSection as ScrollableTabsPinnedSection,
    ScrollableSection as ScrollableTabsScrollableSection,
    Trigger as ScrollableTabsTrigger,
    PinnedTrigger as ScrollableTabsPinnedTrigger,
    AddButton as ScrollableTabsAddButton,
    Content as ScrollableTabsContent,
    OverflowMenu as ScrollableTabsOverflowMenu
};
