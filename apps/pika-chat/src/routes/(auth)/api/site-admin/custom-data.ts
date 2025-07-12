import type { AuthenticatedUser, ChatApp, RecordOrUndef, SimpleOption, UserOverrideData } from '@pika/shared/types/chatbot/chatbot-types';

/**
 * Get the values for an auto complete input component in the admin UI.  This is used if you have turned on
 * the siteAdmin feature and within it the supportUserEntityAccessControl feature in the site features (@see pika-config.ts).
 *
 * When you turn that on, the admin UI will show a new section in the chat app configuration called "Entity Access Control" that
 * can be set for internal and external users separately.  The admin user can then search for entities whose users are
 * to be given exclusive access to the chat app, meaning that only users associated with those entities will be able to
 * access the chat app.
 *
 * This would let you do a query using the `valueProvidedByUser` to get the values for the auto complete input.
 *
 * @param type The type of user to get the values for: "internal-user" or "external-user"
 * @param valueProvidedByUser The value provided by the user (the value typed by the user in the picker to query on)
 * @param user The logged in user
 * @param chatAppId The chat app whose entity access control is being configured
 * @returns
 */
export async function getValuesForEntityAutoComplete(
    _type: 'internal-user' | 'external-user',
    valueProvidedByUser: string,
    _user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    _chatAppId: string
): Promise<SimpleOption[] | undefined> {
    /*
        Replace everything in this function with your own implementation.  You may use fetch to reach out to an API.
        If you are going to call a resource in AWS, be sure you add permissions to the ECS webapp task role so the
        webapp has permissions to call the resource.  Do it in apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts
        in the addStackResoucesBeforeWeCreateThePikaChatConstruct method.

        Here's an example that adds the ability to invoke an API Gateway API by its api ID:

            this.stack.webapp.taskRole.addToPolicy(new iam.PolicyStatement({
                actions: ['execute-api:Invoke'],
                resources: ['arn:aws:execute-api:us-east-1:111111111111:api-id/stage/GET/']
        }));

    */

    // If no search value provided, return first 20 companies sorted alphabetically
    if (!valueProvidedByUser || valueProvidedByUser.trim() === '') {
        return mockAccounts
            .sort((a, b) => a.details.accountName.localeCompare(b.details.accountName))
            .slice(0, 20)
            .map((company) => ({
                value: company.accountId,
                label: company.details.accountName
            }));
    }

    const searchValue = valueProvidedByUser.toLowerCase().trim();

    return mockAccounts
        .filter((account) => account.accountId.toLowerCase().startsWith(searchValue) || account.details.accountName.toLowerCase().startsWith(searchValue))
        .sort((a, b) => a.details.accountName.localeCompare(b.details.accountName))
        .map((account) => ({
            value: account.accountId,
            label: account.details.accountName
        }))
        .slice(0, 20);
}

interface Account {
    accountId: string;
    details: {
        accountName: string;
        accountType: 'standard' | 'premium';
    };
}

// Feel free to remove this, it's just here to demonstrate the feature and allow us to test it in the default case.
const mockAccounts: Account[] = [
    { accountId: 'acct-001', details: { accountName: 'Acme Corp', accountType: 'standard' } },
    { accountId: 'acct-002', details: { accountName: 'Beta Industries', accountType: 'premium' } },
    { accountId: 'acct-003', details: { accountName: 'Gamma Solutions', accountType: 'standard' } },
    { accountId: 'acct-004', details: { accountName: 'Delta Innovations', accountType: 'premium' } },
    { accountId: 'acct-005', details: { accountName: 'Epsilon LLC', accountType: 'standard' } },
    { accountId: 'acct-006', details: { accountName: 'Zeta Works', accountType: 'premium' } },
    { accountId: 'acct-007', details: { accountName: 'Eta Group', accountType: 'standard' } },
    { accountId: 'acct-008', details: { accountName: 'Theta Enterprises', accountType: 'premium' } },
    { accountId: 'acct-009', details: { accountName: 'Iota Systems', accountType: 'standard' } },
    { accountId: 'acct-010', details: { accountName: 'Kappa Ventures', accountType: 'premium' } },
    { accountId: 'acct-011', details: { accountName: 'Lambda Dynamics', accountType: 'standard' } },
    { accountId: 'acct-012', details: { accountName: 'Mu Corporation', accountType: 'premium' } },
    { accountId: 'acct-013', details: { accountName: 'Nu Services', accountType: 'standard' } },
    { accountId: 'acct-014', details: { accountName: 'Xi Technologies', accountType: 'premium' } },
    { accountId: 'acct-015', details: { accountName: 'Omicron Global', accountType: 'standard' } },
    { accountId: 'acct-016', details: { accountName: 'Pi Solutions', accountType: 'premium' } },
    { accountId: 'acct-017', details: { accountName: 'Rho Partners', accountType: 'standard' } },
    { accountId: 'acct-018', details: { accountName: 'Sigma Holdings', accountType: 'premium' } },
    { accountId: 'acct-019', details: { accountName: 'Tau Innovations', accountType: 'standard' } },
    { accountId: 'acct-020', details: { accountName: 'Upsilon Group', accountType: 'premium' } },
    { accountId: 'acct-021', details: { accountName: 'Phi Corp', accountType: 'standard' } },
    { accountId: 'acct-022', details: { accountName: 'Chi Technologies', accountType: 'premium' } },
    { accountId: 'acct-023', details: { accountName: 'Psi Industries', accountType: 'standard' } },
    { accountId: 'acct-024', details: { accountName: 'Omega Systems', accountType: 'premium' } },
    { accountId: 'acct-025', details: { accountName: 'Northwind Inc', accountType: 'standard' } },
    { accountId: 'acct-026', details: { accountName: 'Southridge Solutions', accountType: 'premium' } },
    { accountId: 'acct-027', details: { accountName: 'Eastbay Holdings', accountType: 'standard' } },
    { accountId: 'acct-028', details: { accountName: 'Westfield Technologies', accountType: 'premium' } },
    { accountId: 'acct-029', details: { accountName: 'Brightside Corp', accountType: 'standard' } },
    { accountId: 'acct-030', details: { accountName: 'Clearwater Ventures', accountType: 'premium' } },
    { accountId: 'acct-031', details: { accountName: 'Evergreen LLC', accountType: 'standard' } },
    { accountId: 'acct-032', details: { accountName: 'Riverstone Ltd', accountType: 'premium' } },
    { accountId: 'acct-033', details: { accountName: 'Mountain Peak Inc', accountType: 'standard' } },
    { accountId: 'acct-034', details: { accountName: 'Sunrise Enterprises', accountType: 'premium' } },
    { accountId: 'acct-035', details: { accountName: 'Twilight Solutions', accountType: 'standard' } },
    { accountId: 'acct-036', details: { accountName: 'Blue Sky Holdings', accountType: 'premium' } },
    { accountId: 'acct-037', details: { accountName: 'Oceanic Group', accountType: 'standard' } },
    { accountId: 'acct-038', details: { accountName: 'Seabreeze Technologies', accountType: 'premium' } },
    { accountId: 'acct-039', details: { accountName: 'Rainfall Inc', accountType: 'standard' } },
    { accountId: 'acct-040', details: { accountName: 'Snowcap Ventures', accountType: 'premium' } },
    { accountId: 'acct-041', details: { accountName: 'Windstream LLC', accountType: 'standard' } },
    { accountId: 'acct-042', details: { accountName: 'Thunderbolt Corp', accountType: 'premium' } },
    { accountId: 'acct-043', details: { accountName: 'Lightning Ltd', accountType: 'standard' } },
    { accountId: 'acct-044', details: { accountName: 'Firefly Enterprises', accountType: 'premium' } },
    { accountId: 'acct-045', details: { accountName: 'Nova Partners', accountType: 'standard' } },
    { accountId: 'acct-046', details: { accountName: 'Cosmos Holdings', accountType: 'premium' } },
    { accountId: 'acct-047', details: { accountName: 'Galaxy Group', accountType: 'standard' } },
    { accountId: 'acct-048', details: { accountName: 'Nebula Technologies', accountType: 'premium' } },
    { accountId: 'acct-049', details: { accountName: 'Starlight Inc', accountType: 'standard' } },
    { accountId: 'acct-050', details: { accountName: 'Orbit Solutions', accountType: 'premium' } },
    { accountId: 'acct-051', details: { accountName: 'Astro Corp', accountType: 'standard' } },
    { accountId: 'acct-052', details: { accountName: 'Meteor Ventures', accountType: 'premium' } },
    { accountId: 'acct-053', details: { accountName: 'Comet Enterprises', accountType: 'standard' } },
    { accountId: 'acct-054', details: { accountName: 'Pulsar LLC', accountType: 'premium' } },
    { accountId: 'acct-055', details: { accountName: 'Quasar Ltd', accountType: 'standard' } },
    { accountId: 'acct-056', details: { accountName: 'Blackhole Inc', accountType: 'premium' } },
    { accountId: 'acct-057', details: { accountName: 'Wormhole Systems', accountType: 'standard' } },
    { accountId: 'acct-058', details: { accountName: 'DarkMatter Holdings', accountType: 'premium' } },
    { accountId: 'acct-059', details: { accountName: 'Photon Corp', accountType: 'standard' } },
    { accountId: 'acct-060', details: { accountName: 'Neutrino Ventures', accountType: 'premium' } },
    { accountId: 'acct-061', details: { accountName: 'Proton Group', accountType: 'standard' } },
    { accountId: 'acct-062', details: { accountName: 'Electron Dynamics', accountType: 'premium' } },
    { accountId: 'acct-063', details: { accountName: 'Ion Services', accountType: 'standard' } },
    { accountId: 'acct-064', details: { accountName: 'Nucleus Technologies', accountType: 'premium' } },
    { accountId: 'acct-065', details: { accountName: 'Fusion LLC', accountType: 'standard' } },
    { accountId: 'acct-066', details: { accountName: 'Fission Holdings', accountType: 'premium' } },
    { accountId: 'acct-067', details: { accountName: 'Radiant Corp', accountType: 'standard' } },
    { accountId: 'acct-068', details: { accountName: 'Glow Ventures', accountType: 'premium' } },
    { accountId: 'acct-069', details: { accountName: 'Aurora Group', accountType: 'standard' } },
    { accountId: 'acct-070', details: { accountName: 'Polaris Solutions', accountType: 'premium' } },
    { accountId: 'acct-071', details: { accountName: 'Solaris Enterprises', accountType: 'standard' } },
    { accountId: 'acct-072', details: { accountName: 'Lunar LLC', accountType: 'premium' } },
    { accountId: 'acct-073', details: { accountName: 'Eclipse Ltd', accountType: 'standard' } },
    { accountId: 'acct-074', details: { accountName: 'Zenith Corp', accountType: 'premium' } },
    { accountId: 'acct-075', details: { accountName: 'Apex Innovations', accountType: 'standard' } },
    { accountId: 'acct-076', details: { accountName: 'Vertex Group', accountType: 'premium' } },
    { accountId: 'acct-077', details: { accountName: 'Summit Systems', accountType: 'standard' } },
    { accountId: 'acct-078', details: { accountName: 'Crest Holdings', accountType: 'premium' } },
    { accountId: 'acct-079', details: { accountName: 'Basecamp Inc', accountType: 'standard' } },
    { accountId: 'acct-080', details: { accountName: 'Trailblazer Ventures', accountType: 'premium' } },
    { accountId: 'acct-081', details: { accountName: 'Pathfinder LLC', accountType: 'standard' } },
    { accountId: 'acct-082', details: { accountName: 'Explorer Corp', accountType: 'premium' } },
    { accountId: 'acct-083', details: { accountName: 'Pioneer Technologies', accountType: 'standard' } },
    { accountId: 'acct-084', details: { accountName: 'Voyager Solutions', accountType: 'premium' } },
    { accountId: 'acct-085', details: { accountName: 'Seeker Systems', accountType: 'standard' } },
    { accountId: 'acct-086', details: { accountName: 'Nomad Enterprises', accountType: 'premium' } },
    { accountId: 'acct-087', details: { accountName: 'Wanderer Group', accountType: 'standard' } },
    { accountId: 'acct-088', details: { accountName: 'Pilgrim LLC', accountType: 'premium' } },
    { accountId: 'acct-089', details: { accountName: 'Crusader Ltd', accountType: 'standard' } },
    { accountId: 'acct-090', details: { accountName: 'Knight Corp', accountType: 'premium' } },
    { accountId: 'acct-091', details: { accountName: 'Squire Holdings', accountType: 'standard' } },
    { accountId: 'acct-092', details: { accountName: 'Herald Ventures', accountType: 'premium' } },
    { accountId: 'acct-093', details: { accountName: 'Sentinel Inc', accountType: 'standard' } },
    { accountId: 'acct-094', details: { accountName: 'Guardian Technologies', accountType: 'premium' } },
    { accountId: 'acct-095', details: { accountName: 'Protector Group', accountType: 'standard' } },
    { accountId: 'acct-096', details: { accountName: 'Defender LLC', accountType: 'premium' } },
    { accountId: 'acct-097', details: { accountName: 'Champion Systems', accountType: 'standard' } },
    { accountId: 'acct-098', details: { accountName: 'Victor Ventures', accountType: 'premium' } },
    { accountId: 'acct-099', details: { accountName: 'Conqueror Ltd', accountType: 'standard' } },
    { accountId: 'acct-100', details: { accountName: 'Legendary Corp', accountType: 'premium' } }
];
