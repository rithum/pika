import type { AccessControlSiteConfig, SiteFeatures } from 'pika-shared/types/chatbot/chatbot-types';

export const BUILTIN_ROLE_LABELS: Readonly<Record<string, string>> = { 'pika:content-admin': 'Content Admin', 'pika:site-admin': 'Site Admin' };
export const BUILTIN_PREDEFINED_ROLES: readonly string[] = ['pika:content-admin', 'pika:site-admin'];

const DEFAULT_INTERNAL_USERS_LABEL = 'All internal users';

export interface ResolvedAccessControlConfig {
    roleLabels: Record<string, string>;
    predefinedRoles: string[];
    internalUsersLabel: string;
    accountIdRegex: RegExp | undefined;
    accountIdPatternDescription: string | undefined;
}

const warnedPatterns = new Set<string>();

function compileAccountIdPattern(pattern: string | undefined): RegExp | undefined {
    if (!pattern) {
        return undefined;
    }
    try {
        return new RegExp(`^(?:${pattern})$`);
    } catch (error) {
        if (!warnedPatterns.has(pattern)) {
            warnedPatterns.add(pattern);
            console.warn(`Ignoring invalid accessControl.accountIdPattern "${pattern}":`, error);
        }
        return undefined;
    }
}

export function resolveAccessControlConfig(config: AccessControlSiteConfig | undefined): ResolvedAccessControlConfig {
    return {
        roleLabels: { ...BUILTIN_ROLE_LABELS, ...config?.roleLabels },
        predefinedRoles: Array.from(new Set([...BUILTIN_PREDEFINED_ROLES, ...(config?.predefinedRoles ?? [])])),
        internalUsersLabel: config?.internalUsersLabel || DEFAULT_INTERNAL_USERS_LABEL,
        accountIdRegex: compileAccountIdPattern(config?.accountIdPattern),
        accountIdPatternDescription: config?.accountIdPatternDescription
    };
}

export function accessControlConfigFromSiteFeatures(siteFeatures: SiteFeatures | undefined): ResolvedAccessControlConfig {
    return resolveAccessControlConfig(siteFeatures?.siteAdmin?.accessControl);
}

export function describeRole(role: string, labels: Record<string, string> = BUILTIN_ROLE_LABELS): string {
    return labels[role] ?? role;
}
