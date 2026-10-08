/** Guards ExpandableContainer's defaultExpanded prop: initial state only, user toggle wins, re-seeds on prop change. */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import ExpandableContainer from '../../../../packages/pika-ux/src/pika/expandable-container/expandable-container.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>inner content</p>' }));

describe('ExpandableContainer defaultExpanded', () => {
    it('does not render the content by default', () => {
        render(ExpandableContainer, { title: 'Box', children });
        expect(screen.queryByText('inner content')).toBeNull();
    });

    it('renders the content when defaultExpanded is true', () => {
        render(ExpandableContainer, { title: 'Box', defaultExpanded: true, children });
        expect(screen.getByText('inner content')).toBeInTheDocument();
    });

    it('collapses on header click and stays collapsed when re-rendered with the same prop value', async () => {
        const { rerender } = render(ExpandableContainer, { title: 'Box', defaultExpanded: true, children });
        await fireEvent.click(screen.getByRole('button'));
        expect(screen.queryByText('inner content')).toBeNull();

        await rerender({ title: 'Box', defaultExpanded: true, children });
        expect(screen.queryByText('inner content')).toBeNull();
    });

    it('expands when defaultExpanded changes from false to true', async () => {
        const { rerender } = render(ExpandableContainer, { title: 'Box', defaultExpanded: false, children });
        expect(screen.queryByText('inner content')).toBeNull();

        await rerender({ title: 'Box', defaultExpanded: true, children });
        expect(await screen.findByText('inner content')).toBeInTheDocument();
    });
});
