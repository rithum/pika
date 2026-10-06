/**
 * Inside a cross-origin iframe `navigator.clipboard.writeText` is blocked and an `await`ed fallback
 * has lost the click's user activation, so iframes take the synchronous `execCommand` path.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    if (!text) return false;

    let inIframe = false;
    try {
        inIframe = typeof window !== 'undefined' && window.self !== window.top;
    } catch {
        inIframe = true;
    }

    const canUseAsyncApi = !inIframe && typeof window !== 'undefined' && window.isSecureContext && typeof navigator !== 'undefined' && !!navigator.clipboard;

    if (!canUseAsyncApi) return legacyCopy(text);

    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return legacyCopy(text);
    }
}

/** A selection-based textarea breaks in focus-trapping containers (bits-ui DropdownMenu) yet execCommand still returns true. */
function legacyCopy(text: string): boolean {
    let success = false;
    const handler = (e: ClipboardEvent) => {
        e.preventDefault();
        if (!e.clipboardData) return;
        e.clipboardData.setData('text/plain', text);
        success = true;
    };
    try {
        document.addEventListener('copy', handler, { once: true });
        document.execCommand('copy');
        return success;
    } catch (err) {
        console.error('Copy failed:', err);
        return false;
    } finally {
        document.removeEventListener('copy', handler);
    }
}
