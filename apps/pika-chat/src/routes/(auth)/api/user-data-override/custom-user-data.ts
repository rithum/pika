import type { AuthenticatedUser, ChatApp, RecordOrUndef, UserOverrideData } from '@pika/shared/types/chatbot/chatbot-types';
/**
 * Get the initial data for the user data override dialog.  This is the data that will be displayed in the dialog when the user
 * clicks the user data override button.  Lets say you want to have a company picker in the user data override dialog.  You would
 * return the list of companies from your database here and then in your custom UI component you would display a picker.
 *
 * Note that any existing override data is on the user object passed in on the `overrideData` field (key is chatAppId, value is
 * the override data for that chat app).
 *
 * @param user The currently logged in user
 * @param chatApp The chat app that the user is overriding the user for
 * @returns The initial data for the user data override dialog to render your custom UI component, if any
 */
export function getInitialDataForUserDataOverrideDialog(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>, chatApp: ChatApp): unknown | undefined {
    /*
        Replace everything in this function with your own implementation.  It's here as a working example.
        You may use fetch to reach out to an API. If you are going to call a resource in AWS, be sure you add permissions 
        to the ECS webapp task role so the webapp has permissions to call the resource.  Do it 
        in apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts in the addStackResoucesBeforeWeCreateThePikaChatConstruct method.

        Here's an example that adds the ability to invoke an API Gateway API by its api ID:

            this.stack.webapp.taskRole.addToPolicy(new iam.PolicyStatement({
                actions: ['execute-api:Invoke'],
                resources: ['arn:aws:execute-api:us-east-1:111111111111:api-id/stage/GET/']
        }));

    */

    let account: Account | undefined;
    if (user.overrideData && user.overrideData[chatApp.chatAppId]) {
        const overrideData = user.overrideData[chatApp.chatAppId];
        if (overrideData) {
            account = {
                accountId: overrideData.accountId!,
                details: {
                    accountName: overrideData.accountName!,
                    accountType: overrideData.accountType as 'standard' | 'premium'
                }
            };
        }
    }

    return account;
}

/**
 * Get the values for an auto complete input component.  Perhaps you have a company picker auto complete input in
 * the user data override dialog and you want to let the internal user select a company from a list of companies.
 * This would let you do a query using the `valueProvidedByUser` to get the values for the auto complete input.
 *
 * You can have multiple auto complete inputs in the same dialog, so you will need to pass the component name to
 * this method so you can return the correct values for the correct auto complete input.
 *
 * Note that any existing override data is on the user object passed in on the `overrideData` field (key is chatAppId, value is
 * the override data for that chat app).
 *
 * @param componentName The component to get the values for (this allows you to have multiple pickers in the same dialog)
 * @param valueProvidedByUser The value provided by the user (the value typed by the user in the picker to query on)
 * @param user The logged in user
 * @param chatApp The chat app that the user is overriding the user for
 * @returns
 */
export function getValuesForAutoComplete(
    _componentName: string,
    valueProvidedByUser: string,
    _user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    _chatApp: ChatApp
): unknown[] | undefined {
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
        .slice(0, 20);
}

/**
 * Set the override data into the chat user before we use it when calling the chat API or when invoking the agent.
 * Note, we don't save the override data in the database, we only use it when calling the chat API or when invoking the agent, storing
 * it in a cookie. Remember that we send the user object all over the place, so if it gets too big, it could cause a problem.
 * All of your custom user data should be stored in `AuthenticatedUser.customData` and should not be more than 1 kilobyte in size.
 *
 * Note that any existing override data is on the user object passed in on the `overrideData` field (key is chatAppId, value is
 * the override data for that chat app).
 *
 * @param user The user we are acting on behalf of.
 * @param chatApp The chat app that the user is overriding the user for
 * @param overrideData The override data posted from the user data override dialog from your custom UI component.
 *                     You will have to turn this into a bag of string keys and string values or undefined to return and use as the override data.
 * @returns The complete bag of ChatUser.customData that we will use when calling the chat API or when invoking the agent. If you
 *          pass undefined then we remove any override data associated with this user and chat app.
 */
export function userOverrideDataPostedFromDialog(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>, chatApp: ChatApp, overrideData: unknown | undefined): RecordOrUndef {
    /*
        Replace everything in this function with your own implementation.  Your job is to take the data posted from the user data override dialog
        that you chose to send and turn it into a bag of string keys and string values or undefined to return and use as the override data.
    */

    let result: RecordOrUndef;
    const account = overrideData ? (overrideData as Account) : undefined;
    if (account) {
        // Must return Record<string, string | undefined>
        result = {
            accountId: account.accountId,
            accountName: account.details.accountName,
            accountType: account.details.accountType
        };
    }

    return result;
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
