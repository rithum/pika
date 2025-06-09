import type { NavItem, NavSubItem } from '$client/app/types';
import type { Page } from '@sveltejs/kit';

const ITEMS: NavItem[] = [];

export class ChatNavState {
    items = $derived.by(() => {
        // Ensure this.page is tracked even if it's not set initially
        const pageObj = this.page;

        if (!this.page) {
            return ITEMS;
        }

        return ITEMS.map((item: NavItem) => ({
            ...item,
            isActive: item.items?.some((subItem: NavSubItem) => subItem.url === pageObj.url.pathname),
            items: item.items?.map((subItem: NavSubItem) => ({
                ...subItem,
                isActive: subItem.url === pageObj.url.pathname,
            })),
        }));
    });

    constructor(private readonly page: Page) {}
}
