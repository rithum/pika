export interface NavSubItem {
    title: string;
    url: string;
    isActive?: boolean;
}

export interface NavItem {
    title: string;
    url: string;
    // this should be `Component` after @lucide/svelte updates types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon?: any;
    isActive?: boolean;
    items?: NavSubItem[];
}

export interface User {
    userId: string;
    firstName: string;
    lastName: string;
    companyId: string;
    companyName: string;
    email: string;
}

export interface HotKeyBase {
    desc: string; // Used in dynamic help system to explain the purpose of the hotkey

    key?: string;
    alt?: boolean;
    ctrl?: boolean;
    shift?: boolean;
    meta?: boolean;

    /**
     * If true, use Ctrl instead of Meta for Windows.  If meta isn't true then this will throw
     * an error when creating the hotkey.
     */
    useCtrlForMetaOnWindows?: boolean;

    /** If set this is the function that will be called when the hotkey is pressed */
    fn: () => void;
}

export interface HotKey extends HotKeyBase {
    display: string; // Cmd+B kind of thing

    // If set, use this display string for Windows instead of the default
    displayWindows?: string;

    htmlDisplay: string; // <span class="bg-white text-black px-1 rounded-md font-bold">Ctrl+Shift+K</span> kind of thing

    // If set, use this html display string for Windows instead of the default
    htmlDisplayWindows?: string;
}

export interface AppSettings {
    hideTooltips?: boolean;
}

export interface ErrorResponse {
    success: false;
    error?: string;
}

export interface SuccessResponse {
    success: true;
}
