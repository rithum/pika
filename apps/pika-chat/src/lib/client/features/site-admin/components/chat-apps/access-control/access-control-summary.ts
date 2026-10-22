/**
 * Pure, framework-free logic for describing and validating chat app access control overrides in plain language.
 * It mirrors the server's evaluation ladder in `services/pika/src/lib/get-matching-chat-apps.ts` so the UI summary cannot drift from it.
 */
import type { ApplyRulesAs, UserChatAppRule, UserRole, UserType } from 'pika-shared/types/chatbot/chatbot-types';
import { describeRole, resolveAccessControlConfig, type ResolvedAccessControlConfig } from './access-control-config';

export { describeRole };

/** Superset of the fields we need from either a `ChatApp` (base) or a `ChatAppOverride`. */
export interface AccessControlSummaryInput {
    enabled?: boolean;
    userTypes?: UserType[];
    userRoles?: UserRole[];
    applyRulesAs?: ApplyRulesAs;
    exclusiveUserIdAccessControl?: string[];
    exclusiveInternalAccessControl?: string[];
    exclusiveExternalAccessControl?: string[];
    additionalExternalAccessControl?: string[];
}

export type AccessSummaryTone = 'default' | 'warning' | 'danger';

export interface AccessSummaryLine {
    text: string;
    tone: AccessSummaryTone;
}

export interface AccessControlSummary {
    /** One clause per population/grant-path that currently has access. Always accurate for the whole ladder. */
    lines: AccessSummaryLine[];
    /** True if at least one line grants access to somebody. */
    grantsAnyAccess: boolean;
    /** Surprising-but-valid combinations worth calling out (yellow), never a save-blocker on their own. */
    warnings: string[];
}

export interface AccessControlValidation {
    /** Only genuinely broken states land here (enabled app nobody can access). Never a coherent-but-unusual config. */
    errors: string[];
    warnings: string[];
}

export function describeRoles(roles: string[], config: ResolvedAccessControlConfig = resolveAccessControlConfig(undefined)): string {
    return roles.map((role) => describeRole(role, config.roleLabels)).join(' or ');
}

type GeneralAccessResult = { access: 'none' } | { access: 'all' } | { access: 'role-gated'; roles: UserRole[] };

/**
 * Evaluates what the general rules (userTypes/userRoles/applyRulesAs) grant for a single population
 * (internal or external), replicating `checkUserAccessToChatAppUsingGeneralAccessRules` exactly —
 * including its empty-array normalization and the "OR with no user types" wide-open behavior.
 */
export function evaluateGeneralAccessForPopulation(
    population: UserType,
    rawUserTypes: UserType[] | undefined,
    rawUserRoles: UserRole[] | undefined,
    rawApplyRulesAs: ApplyRulesAs | undefined
): GeneralAccessResult {
    let userTypes = rawUserTypes && rawUserTypes.length > 0 ? rawUserTypes : undefined;
    let userRoles = rawUserRoles && rawUserRoles.length > 0 ? rawUserRoles : undefined;
    const applyRulesAs: ApplyRulesAs = rawApplyRulesAs ?? 'and';

    if (!userTypes && !userRoles) {
        return { access: 'none' };
    }

    const typeMatches = userTypes ? userTypes.includes(population) : true;

    if (!userRoles) {
        if (applyRulesAs === 'or') {
            return { access: 'all' };
        }
        return typeMatches ? { access: 'all' } : { access: 'none' };
    }

    if (applyRulesAs === 'and') {
        return typeMatches ? { access: 'role-gated', roles: userRoles } : { access: 'none' };
    }

    return typeMatches ? { access: 'all' } : { access: 'role-gated', roles: userRoles };
}

/**
 * Produces an accurate, plain-language description of exactly who can access the chat app for the
 * given override/base-access fields, following the same precedence ladder as the server.
 */
export function summarizeAccessControl(
    input: AccessControlSummaryInput | undefined,
    entityPluralLower = 'accounts',
    config: ResolvedAccessControlConfig = resolveAccessControlConfig(undefined)
): AccessControlSummary {
    if (!input || input.enabled === false) {
        return {
            lines: [{ text: 'Disabled — nobody can access this chat app.', tone: 'danger' }],
            grantsAnyAccess: false,
            warnings: []
        };
    }

    const exclusiveUserIds = input.exclusiveUserIdAccessControl ?? [];
    if (exclusiveUserIds.length > 0) {
        const count = exclusiveUserIds.length;
        return {
            lines: [
                {
                    text: `PILOT MODE: only ${count === 1 ? 'this user ID' : `these ${count} user IDs`} (internal or external — every other rule below is ignored): ${exclusiveUserIds.join(', ')}`,
                    tone: 'warning'
                }
            ],
            grantsAnyAccess: true,
            warnings: []
        };
    }

    const exclusiveInternal = input.exclusiveInternalAccessControl ?? [];
    const exclusiveExternal = input.exclusiveExternalAccessControl ?? [];
    const additionalExternal = input.additionalExternalAccessControl ?? [];
    const userTypes = input.userTypes ?? [];
    const userRoles = input.userRoles ?? [];
    const applyRulesAs: ApplyRulesAs = input.applyRulesAs ?? 'and';

    const lines: AccessSummaryLine[] = [];
    const warnings: string[] = [];
    let grantsAnyAccess = false;

    if (exclusiveInternal.length > 0) {
        lines.push({
            text: `PILOT MODE for internal users: only accounts ${exclusiveInternal.join(', ')} (role/type rules below do not apply to internal users)`,
            tone: 'warning'
        });
        grantsAnyAccess = true;
    } else {
        const result = evaluateGeneralAccessForPopulation('internal-user', input.userTypes, input.userRoles, input.applyRulesAs);
        if (result.access === 'all') {
            lines.push({ text: config.internalUsersLabel, tone: 'default' });
            grantsAnyAccess = true;
        } else if (result.access === 'role-gated') {
            lines.push({ text: `Internal users with role: ${describeRoles(result.roles, config)}`, tone: 'default' });
            grantsAnyAccess = true;
        }
    }

    if (exclusiveExternal.length > 0) {
        lines.push({
            text: `PILOT MODE for external users: only these ${entityPluralLower} (role/type rules below do not apply to external users): ${exclusiveExternal.join(', ')}`,
            tone: 'warning'
        });
        grantsAnyAccess = true;
    } else {
        const result = evaluateGeneralAccessForPopulation('external-user', input.userTypes, input.userRoles, input.applyRulesAs);
        if (result.access === 'all') {
            lines.push({ text: 'All external users', tone: 'default' });
            grantsAnyAccess = true;
        } else if (result.access === 'role-gated') {
            lines.push({ text: `External users with role: ${describeRoles(result.roles, config)}`, tone: 'default' });
            grantsAnyAccess = true;
        }
    }

    if (additionalExternal.length > 0) {
        lines.push({
            text: `Plus ${additionalExternal.length === 1 ? 'account' : 'accounts'} ${additionalExternal.join(', ')} (always allowed for external users, regardless of the rules above)`,
            tone: 'default'
        });
        grantsAnyAccess = true;
    }

    if (lines.length === 0) {
        lines.push({ text: 'No one — no user types, roles, or accounts are configured.', tone: 'danger' });
    }

    if (exclusiveExternal.length > 0 && (userTypes.includes('external-user') || userRoles.length > 0)) {
        warnings.push('The role/type rules are configured but ignored for external users because of the external-accounts restriction above.');
    }
    if (exclusiveInternal.length > 0 && userTypes.includes('internal-user')) {
        warnings.push('The role/type rules are configured but ignored for internal users because of the internal-accounts restriction above.');
    }
    if (exclusiveExternal.length > 0 && additionalExternal.length > 0) {
        warnings.push('The additional accounts list always grants access even for accounts not on the external-accounts restriction list.');
    }
    if (userRoles.length > 0 && userTypes.length === 0 && applyRulesAs === 'or') {
        warnings.push(
            '"OR" is selected with roles but no user types — this grants access to EVERYONE (internal and external), regardless of role, because there is no type restriction to combine with. Select "AND", or add a user type, to actually restrict by role.'
        );
    }

    return { lines, grantsAnyAccess, warnings };
}

/**
 * Whether a population has ANY access path under the given config — used to detect the
 * "has access but no home-page tile" mismatch.
 */
export function populationHasAccess(input: AccessControlSummaryInput, population: UserType): boolean {
    if (input.enabled === false) {
        return false;
    }
    if ((input.exclusiveUserIdAccessControl ?? []).length > 0) {
        return true;
    }
    const exclusiveList = population === 'internal-user' ? input.exclusiveInternalAccessControl : input.exclusiveExternalAccessControl;
    if ((exclusiveList ?? []).length > 0) {
        return true;
    }
    if (population === 'external-user' && (input.additionalExternalAccessControl ?? []).length > 0) {
        return true;
    }
    return evaluateGeneralAccessForPopulation(population, input.userTypes, input.userRoles, input.applyRulesAs).access !== 'none';
}

/** Mirrors `checkUserAccessBasedOnRules` exactly, including its quirk that the LAST matching rule wins. */
export function evaluateHomeTileForPopulation(population: UserType, effectiveAppUserTypes: UserType[], rules: UserChatAppRule[]): boolean {
    let isAllowed = false;
    for (const rule of rules) {
        if (rule.userTypes && !rule.userTypes.includes(population)) {
            continue;
        }
        if (rule.chatAppUserTypes && rule.chatAppUserTypes.length > 0) {
            isAllowed = effectiveAppUserTypes.some((t) => rule.chatAppUserTypes!.includes(t));
        }
    }
    return isAllowed;
}

export interface HomeTileSummary {
    lines: AccessSummaryLine[];
    warnings: string[];
    /** Per-population tile visibility; undefined when following site defaults that we can't see. */
    internalVisible: boolean | undefined;
    externalVisible: boolean | undefined;
}

/**
 * Describes home-page tile visibility for the current config. `siteRules` are the site-wide
 * default rules (siteFeatures.homePage.linksToChatApps.userChatAppRules) used when the override
 * has none of its own.
 */
export function summarizeHomeTileVisibility(
    input: AccessControlSummaryInput & { homePageFilterRules?: UserChatAppRule[] },
    effectiveAppUserTypes: UserType[],
    siteRules: UserChatAppRule[] | undefined
): HomeTileSummary {
    const lines: AccessSummaryLine[] = [];
    const warnings: string[] = [];

    const usingSiteDefaults = input.homePageFilterRules === undefined;
    const rules = input.homePageFilterRules ?? siteRules;

    let internalVisible: boolean | undefined;
    let externalVisible: boolean | undefined;

    if (rules === undefined) {
        lines.push({ text: 'Follows the site default rules (not visible to this page).', tone: 'default' });
    } else {
        internalVisible = evaluateHomeTileForPopulation('internal-user', effectiveAppUserTypes, rules);
        externalVisible = evaluateHomeTileForPopulation('external-user', effectiveAppUserTypes, rules);

        const visibleTo = [internalVisible ? 'internal users' : undefined, externalVisible ? 'external users' : undefined].filter(Boolean);
        if (visibleTo.length === 0) {
            lines.push({ text: `Hidden from the home page for everyone${usingSiteDefaults ? ' (per site default rules)' : ''} — the chat stays reachable by direct link.`, tone: 'warning' });
        } else {
            lines.push({ text: `Tile shows for ${visibleTo.join(' and ')}${usingSiteDefaults ? ' (per site default rules)' : ''} — among users who have access.`, tone: 'default' });
        }

        if (internalVisible === false && populationHasAccess(input, 'internal-user')) {
            warnings.push('Internal users have chat access but will NOT see the home-page tile (direct links still work).');
        }
        if (externalVisible === false && populationHasAccess(input, 'external-user')) {
            warnings.push('External users have chat access but will NOT see the home-page tile (direct links still work).');
        }
    }

    return { lines, warnings, internalVisible, externalVisible };
}

/**
 * The only hard-block: an enabled chat app that truly nobody can access. Every other combination —
 * however surprising — is a coherent, saveable state (surfaced as a warning by `summarizeAccessControl`,
 * never an error).
 */
export function validateAccessControl(
    input: AccessControlSummaryInput | undefined,
    config: ResolvedAccessControlConfig = resolveAccessControlConfig(undefined)
): AccessControlValidation {
    if (!input || input.enabled === false) {
        return { errors: [], warnings: [] };
    }

    const summary = summarizeAccessControl(input, undefined, config);
    const errors = summary.grantsAnyAccess
        ? []
        : ['This chat app is enabled but no one will be able to access it. Add at least one user type, role, or account below (or disable the app).'];

    return { errors, warnings: summary.warnings };
}
