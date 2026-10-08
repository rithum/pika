/** Guards AdminActionDialog's save flow: error toast without the success screen, success screen on resolve, and no double dispatch. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { toast } from 'svelte-sonner';
import AdminActionDialog from '../../src/lib/client/features/chat/admin-action-dialog/admin-action-dialog.svelte';

vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('pika-ux/shadcn/button', () => import('../../../../packages/pika-ux/src/shadcn/button/index.ts'));

const SAVE_ERROR = 'Could not save the thing';

const description = createRawSnippet(() => ({ render: () => '<span>desc</span>' }));
const children = createRawSnippet(() => ({ render: () => '<p>dialog body</p>' }));

function mount(onSave: () => Promise<void>) {
    return render(AdminActionDialog, {
        open: true,
        title: 'Admin dialog',
        description,
        children,
        onSave,
        saveErrorMessage: SAVE_ERROR,
        secondaryLabel: 'Secondary',
        onSecondary: vi.fn(async () => {}),
        secondaryErrorMessage: 'secondary failed',
        onReset: vi.fn()
    });
}

describe('AdminActionDialog save', () => {
    beforeEach(() => {
        vi.mocked(toast.error).mockClear();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('shows one error toast and keeps the form open when onSave rejects', async () => {
        mount(vi.fn().mockRejectedValue(new Error('boom')));
        await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
        expect(toast.error).toHaveBeenCalledWith(SAVE_ERROR);
        expect(screen.queryByText('Success')).toBeNull();
        expect(screen.getByText('Admin dialog')).toBeInTheDocument();
    });

    it('shows the success screen when onSave resolves', async () => {
        mount(vi.fn().mockResolvedValue(undefined));
        await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText('Success')).toBeInTheDocument();
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('does not call onSave twice when clicked again while the first save is pending', async () => {
        let finish!: () => void;
        const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
        mount(onSave);
        const save = screen.getByRole('button', { name: 'Save' });

        await fireEvent.click(save);
        await fireEvent.click(save);
        expect(onSave).toHaveBeenCalledTimes(1);

        finish();
        expect(await screen.findByText('Success')).toBeInTheDocument();
    });
});
