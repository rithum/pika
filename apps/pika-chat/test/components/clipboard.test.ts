/**
 * jsdom's `execCommand` doesn't dispatch a `copy` event and jsdom 25 lacks `DataTransfer` and
 * `ClipboardEvent`, so the tests stub `execCommand` to dispatch a hand-rolled event synchronously.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyToClipboard } from 'pika-ux/pika/copy-button/clipboard';

/** The only `clipboardData` surface the production handler touches. */
interface ClipboardDataStub {
    setData(type: string, value: string): void;
    getData(type: string): string;
}

function createClipboardDataStub(): ClipboardDataStub {
    const data = new Map<string, string>();
    return {
        setData: (type, value) => {
            data.set(type, value);
        },
        getData: (type) => data.get(type) ?? '',
    };
}

/** Returns the stub carried by the dispatched event so callers can read it after copyToClipboard resolves. */
function stubExecCommandToDispatchCopy(): ClipboardDataStub {
    const clipboardData = createClipboardDataStub();
    document.execCommand = vi.fn((cmd: string) => {
        if (cmd === 'copy') {
            const event = new Event('copy', { cancelable: true });
            Object.defineProperty(event, 'clipboardData', { value: clipboardData });
            document.dispatchEvent(event);
        }
        return true;
    }) as typeof document.execCommand;
    return clipboardData;
}

describe('legacyCopy (via copyToClipboard in an iframe context)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    function forceIframeContext() {
        // copyToClipboard routes to legacyCopy whenever window.self !== window.top.
        vi.stubGlobal('top', {});
    }

    it('writes the correct payload when execCommand fires the copy event', async () => {
        forceIframeContext();
        const clipboardData = stubExecCommandToDispatchCopy();

        const result = await copyToClipboard('hello');

        expect(result).toBe(true);
        expect(clipboardData.getData('text/plain')).toBe('hello');
    });

    it('regression: succeeds even with no focused element or selection', async () => {
        forceIframeContext();
        const clipboardData = stubExecCommandToDispatchCopy();

        // Simulate focus stolen by a focus-trapping container: nothing is focused,
        // and there is no text selection anywhere in the document.
        (document.activeElement as HTMLElement | null)?.blur?.();
        window.getSelection()?.removeAllRanges();

        const result = await copyToClipboard('session-id-value');

        expect(result).toBe(true);
        // Asserting the payload, not just the return value, is what makes this catch the
        // bug: the old selection-based path also returned true here, but copied nothing.
        expect(clipboardData.getData('text/plain')).toBe('session-id-value');
    });

    it('returns false if execCommand throws', async () => {
        forceIframeContext();
        document.execCommand = vi.fn(() => {
            throw new Error('not supported');
        }) as typeof document.execCommand;
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await copyToClipboard('x');

        expect(result).toBe(false);
        expect(errorSpy).toHaveBeenCalled();
    });

    it('returns false if the copy event never fires', async () => {
        forceIframeContext();
        // execCommand "succeeds" but silently no-ops, as some unsupported environments do.
        document.execCommand = vi.fn(() => true) as typeof document.execCommand;

        const result = await copyToClipboard('x');

        expect(result).toBe(false);
    });
});

describe('copyToClipboard', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('returns false for empty text without touching either path', async () => {
        const writeText = vi.fn();
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

        const result = await copyToClipboard('');

        expect(result).toBe(false);
        expect(writeText).not.toHaveBeenCalled();
    });

    it('uses the async Clipboard API at top level when available, skipping legacyCopy', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        // jsdom leaves isSecureContext undefined, which would send this down the legacy path.
        vi.stubGlobal('isSecureContext', true);
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
        const execCommandSpy = vi.spyOn(document, 'execCommand');

        const result = await copyToClipboard('top-level-value');

        expect(result).toBe(true);
        expect(writeText).toHaveBeenCalledWith('top-level-value');
        expect(execCommandSpy).not.toHaveBeenCalled();
    });
});
