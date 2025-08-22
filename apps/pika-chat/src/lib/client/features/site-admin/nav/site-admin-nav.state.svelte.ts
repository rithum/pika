import type { NavItem, NavSubItem } from '$client/app/types';
import { Bot, ChartBar, FileBox, Settings } from '$icons/lucide';
import type { Page } from '@sveltejs/kit';
import type { SiteFeatures } from 'pika-shared/types/chatbot/chatbot-types';
import Caches from '../pages/caches.svelte';
import ChatApps from '../pages/chat-apps.svelte';
import GeneralSettings from '../pages/general-settings.svelte';
import SessionInsights from '../pages/session-insights.svelte';

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
    },
    {
        title: 'Session Insights',
        url: '/admin/session-insights',
        icon: ChartBar,
        pageComponent: SessionInsights,
        enabled: (siteFeatures: SiteFeatures) => siteFeatures.sessionInsights?.enabled ?? false
    },
    {
        title: 'Caches',
        url: '/admin/caches',
        icon: FileBox,
        pageComponent: Caches
    }
];

export class SiteAdminNavState {
    items = $derived.by(() => {
        // Ensure this.page is tracked even if it's not set initially
        const pageObj = this.page;

        if (!this.page) {
            return ITEMS;
        }

        return ITEMS.filter((item) => {
            if (item.enabled) {
                return item.enabled(this.siteFeatures);
            }
            return true;
        }).map((item: NavItem) => ({
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

    constructor(
        private readonly page: Page,
        private readonly siteFeatures: SiteFeatures
    ) {}
}
