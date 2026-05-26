// Server-side seam: replace this file with your own implementation.
// Called by:
//   - routes/(auth)/api/site-admin/custom-data.ts    (entity autocomplete / list for admin UI)
//   - routes/(auth)/api/user-data-override/custom-user-data.ts  (user override dialog)
//
// If you call any AWS resource here, grant permissions to the ECS webapp task role in
// apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts →
// addStackResoucesBeforeWeCreateThePikaChatConstruct()

import type { AuthenticatedUser, ChatApp, RecordOrUndef, SimpleOption } from 'pika-shared/types/chatbot/chatbot-types';

// ── Entity autocomplete (site-admin entity access control / session insights) ─

/**
 * Return SimpleOption rows for the admin entity-picker autocomplete.
 * Replace with a real API call — see the comment at the top of this file.
 */
export async function getValuesForEntityAutoComplete(
    valueProvidedByUser: string,
    _user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    _chatAppId?: string
): Promise<SimpleOption[] | undefined> {
    return filterMockAccounts(valueProvidedByUser).map((a) => ({
        value: a.accountId,
        label: a.details.accountName,
        secondaryLabel: a.details.accountType
    }));
}

/**
 * Return SimpleOption rows for a batch of entity IDs (used to enrich analytics data).
 * Replace with a real API call.
 */
export async function getValuesForEntityList(
    entityIds: string[],
    _user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    _chatAppId?: string
): Promise<SimpleOption[] | undefined> {
    return mockAccounts
        .filter((a) => entityIds.includes(a.accountId))
        .map((a) => ({ value: a.accountId, label: a.details.accountName }));
}

// ── User data override dialog ─────────────────────────────────────────────────

/**
 * Return the initial entity value for the user-data-override dialog.
 * Typically reads from user.overrideData — replace with your own shape.
 */
export async function getInitialDataForUserDataOverrideDialog(
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatApp: ChatApp
): Promise<unknown | undefined> {
    const overrideData = user.overrideData?.[chatApp.chatAppId];
    if (!overrideData) return undefined;
    return {
        accountId: overrideData.accountId,
        details: { accountName: overrideData.accountName, accountType: overrideData.accountType }
    } as MockAccount;
}

/**
 * Return autocomplete rows for the user-data-override dialog picker.
 * Replace with a real API call.
 */
export async function getValuesForUserDataAutoComplete(
    _componentName: string,
    valueProvidedByUser: string,
    _user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    _chatApp: ChatApp
): Promise<unknown[] | undefined> {
    return filterMockAccounts(valueProvidedByUser);
}

/**
 * Map the raw dialog payload to a Record<string, string | undefined> to store in the user cookie.
 * Return undefined to clear the override.
 */
export async function userOverrideDataPostedFromDialog(
    _user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    _chatApp: ChatApp,
    overrideData: unknown | undefined
): Promise<RecordOrUndef> {
    const account = overrideData as MockAccount | undefined;
    if (!account) return undefined;
    return {
        accountId: account.accountId,
        accountName: account.details.accountName,
        accountType: account.details.accountType
    };
}

// ── Mock data — remove when replacing with a real implementation ──────────────

interface MockAccount {
    accountId: string;
    details: { accountName: string; accountType: 'standard' | 'premium' };
}

function filterMockAccounts(searchValue: string): MockAccount[] {
    const sorted = [...mockAccounts].sort((a, b) => a.details.accountName.localeCompare(b.details.accountName));
    if (!searchValue?.trim()) return sorted.slice(0, 20);
    const q = searchValue.toLowerCase().trim();
    return sorted
        .filter((a) => a.accountId.toLowerCase().startsWith(q) || a.details.accountName.toLowerCase().startsWith(q))
        .slice(0, 20);
}

const mockAccounts: MockAccount[] = [
    { accountId: 'acct-001', details: { accountName: 'Acme Corp', accountType: 'standard' } },
    { accountId: 'acct-002', details: { accountName: 'Beta Industries', accountType: 'premium' } },
    { accountId: 'acct-003', details: { accountName: 'Gamma Solutions', accountType: 'standard' } },
    { accountId: 'acct-004', details: { accountName: 'Delta Innovations', accountType: 'premium' } },
    { accountId: 'acct-005', details: { accountName: 'Epsilon LLC', accountType: 'standard' } },
    { accountId: 'acct-006', details: { accountName: 'Zeta Works', accountType: 'premium' } },
    { accountId: 'acct-007', details: { accountName: 'Eta Group', accountType: 'standard' } },
    { accountId: 'acct-008', details: { accountName: 'Theta Enterprises', accountType: 'premium' } },
    { accountId: 'acct-009', details: { accountName: 'Iota Systems', accountType: 'standard' } },
    { accountId: 'acct-010', details: { accountName: 'Kappa Ventures', accountType: 'premium' } }
];
