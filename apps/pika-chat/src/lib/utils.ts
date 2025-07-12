import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HotKey, HotKeyBase } from './client/app/types';
// import { formatDistanceToNow, isPast } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

function getOS(): string | undefined {
    if (!navigator) return undefined;
    const userAgent = navigator.userAgent.toLowerCase();

    if (userAgent.includes('win')) {
        return 'Windows';
    } else if (userAgent.includes('mac')) {
        return 'macOS';
    } else if (userAgent.includes('android')) {
        return 'Android';
    } else if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ipod')) {
        return 'iOS';
    } else if (userAgent.includes('linux')) {
        return 'Linux';
    } else {
        return 'Unknown';
    }
}

export function isWindows(): boolean {
    const os = getOS();
    return os === 'Windows';
}

export function isMac(): boolean {
    const os = getOS();
    return os === 'macOS';
}

export function isLinux(): boolean {
    const os = getOS();
    return os === 'Linux';
}

export function isMobileDevice(): boolean {
    const os = getOS();
    return os === 'iOS' || os === 'Android';
}

export function createHotKey(h: HotKeyBase): HotKey {
    // If useCtrlForMetaOnWindows is true, then meta must also be true since the whole point
    // of useCtrlForMetaOnWindows is to use Ctrl instead of Meta for Windows.
    if (h.useCtrlForMetaOnWindows && !h.meta) {
        throw new Error('useCtrlForMetaOnWindows is true but meta is not true');
    }

    // You can't have both ctrl and useCtrlForMetaOnWindows set to true since setting
    // useCtrlForMetaOnWindows to true will cause ctrl to be set to true anyway
    // which feels like a bug so fail early.
    if (h.useCtrlForMetaOnWindows && h.ctrl) {
        throw new Error('useCtrlForMetaOnWindows is true but ctrl is also true');
    }

    return {
        ...h,
        display: getHotKeyForDisplay(h.alt, h.ctrl, h.shift, h.meta, h.key),
        htmlDisplay: getHotKeyAsHtml(h.alt, h.ctrl, h.shift, h.meta, h.key),
        ...(isWindows() && h.useCtrlForMetaOnWindows
            ? {
                  displayWindows: getHotKeyForDisplay(h.alt, true, h.shift, false, h.key),
                  htmlDisplayWindows: getHotKeyAsHtml(h.alt, true, h.shift, false, h.key),
              }
            : {}),
    };
}

function getHotKeyAsHtml(
    alt: boolean | undefined,
    ctrl: boolean | undefined,
    shift: boolean | undefined,
    meta: boolean | undefined,
    key: string | undefined
): string {
    const hotKeyStr = getHotKeyForDisplay(alt, ctrl, shift, meta, key);
    if (!hotKeyStr) return '';

    return `<span class="bg-white text-black px-1 rounded-md font-bold">${hotKeyStr}</span>`;
}

export function getHotKeyForDisplay(
    alt: boolean | undefined,
    ctrl: boolean | undefined,
    shift: boolean | undefined,
    meta: boolean | undefined,
    key: string | undefined
) {
    const mobile = isMobileDevice();

    if (mobile) {
        return '';
    }

    const keys = [];
    const mac = isMac();
    const linux = isLinux();
    if (alt) keys.push(mac ? '⌥' : 'Alt');
    if (ctrl) keys.push(mac ? '⌃' : 'Ctrl');
    if (shift) keys.push(mac ? '⇧' : 'Shift');
    if (meta) keys.push(mac ? '⌘' : linux ? 'Super' : 'Win');
    if (key) keys.push(key);

    return keys.join('+');
}

/**
 * Get the character from a code string which comes from a browser keyboard event
 * @param code - The code string to get the character from
 * @returns The character from the code string, lowercased if it's a letter
 */
export function getCodeChar(code: string): string | undefined {
    const keyMatch = code.match(/^Key([A-Z])$/);
    if (keyMatch) return keyMatch[1].toLowerCase();

    const digitMatch = code.match(/^Digit(\d)$/);
    if (digitMatch) return digitMatch[1];

    return undefined;
}

export function getHotKeyDisplay(hotKey: HotKey): string {
    return isWindows() && hotKey.displayWindows ? hotKey.displayWindows : hotKey.display;
}

export function getHotKeyHtmlDisplay(hotKey: HotKey): string {
    return isWindows() && hotKey.htmlDisplayWindows ? hotKey.htmlDisplayWindows : hotKey.htmlDisplay;
}

/**
 * Asserts that a condition is true, throwing an error with an optional message if it fails
 * @param condition - The condition to check
 * @param message - Optional error message to display if the condition is false
 * @throws Error if the condition is false
 */
export function assert(condition: any, message?: string): asserts condition {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

/**
 * Format an expiration date string or date object into a human readable string
 * @param expirationDate - The expiration date string or date object
 * @returns A human readable string indicating whether the date is expired or expires in the future
 */
// export function formatExpiration(expirationDate: Date | string) {
//     const dateObj: Date = typeof expirationDate === 'string' ? new Date(expirationDate) : expirationDate;

//     if (isPast(dateObj)) {
//         return `Expired ${formatDistanceToNow(dateObj, { addSuffix: true })}`;
//     } else {
//         return `Expires ${formatDistanceToNow(dateObj, { addSuffix: true })}`;
//     }
// }

/**
 * Format a date to a human friendly string
 * @param dateToFormat
 * @returns
 */
export function formatDateTime(dateToFormat: string | Date | number): string {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (typeof dateToFormat === 'string' || typeof dateToFormat === 'number') {
        dateToFormat = new Date(dateToFormat);
    }

    // Format date as "Today", "Yesterday", or the actual date
    if (dateToFormat.toDateString() === today.toDateString()) {
        return 'Today at ' + dateToFormat.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (dateToFormat.toDateString() === yesterday.toDateString()) {
        return 'Yesterday at ' + dateToFormat.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        return (
            dateToFormat.toLocaleDateString() +
            ' at ' +
            dateToFormat.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
    }
}
