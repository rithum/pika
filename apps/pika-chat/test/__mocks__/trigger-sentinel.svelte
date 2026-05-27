<!--
    Test sentinel component: renders identifiable text so chat-nav.test.ts can verify presence
    or absence of a sidebarSlot.trigger render branch. Plain noop components render no DOM and
    can produce false-positive "trigger absent" assertions.
-->
<span data-testid="trigger-sentinel">[TRIGGER]</span>
