/**
 * Sync-protected extension point: NavItems appended to the Site Admin nav after the built-in
 * pages and rendered by the /admin/[page] route. Default: [] (the stock admin nav).
 */
import type { NavItem } from '$lib/client/app/types';

export const customAdminPages: NavItem[] = [];
