import type { NavItem, NavSubItem } from '$client/app/types';
import type { Page } from '@sveltejs/kit';
import { Settings, Bot } from '$icons/lucide';
import GeneralSettings from '../pages/general-settings.svelte';
import ChatApps from '../pages/chat-apps.svelte';

const ITEMS: NavItem[] = [
    {
        title: 'General Settings',
        url: '/admin/general-settings',
        icon: Settings,
        pageComponent: GeneralSettings
    },
    {
        title: 'Chat Apps',
        url: '/admin/chat-apps',
        icon: Bot,
        pageComponent: ChatApps
    }
];

export class SiteAdminNavState {
    items = $derived.by(() => {
        // Ensure this.page is tracked even if it's not set initially
        const pageObj = this.page;

        if (!this.page) {
            return ITEMS;
        }

        return ITEMS.map((item: NavItem) => ({
            ...item,
            isActive: item.url === pageObj.url.pathname || (item.items?.some((subItem: NavSubItem) => subItem.url === pageObj.url.pathname) ?? false),
            items: item.items?.map((subItem: NavSubItem) => ({
                ...subItem,
                isActive: subItem.url === pageObj.url.pathname
            }))
        }));
    });

    currentPage = $derived.by(() => {
        if (!this.page) {
            return undefined;
        }

        const currentPath = this.page.url.pathname;

        // Check main items first
        const mainItem = ITEMS.find((item) => item.url === currentPath);
        if (mainItem) {
            return mainItem;
        }

        // Check sub-items if they exist
        for (const item of ITEMS) {
            if (item.items) {
                const subItem = item.items.find((subItem) => subItem.url === currentPath);
                if (subItem) {
                    return subItem;
                }
            }
        }
    });

    constructor(private readonly page: Page) {}
}
