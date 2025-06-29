# User Data Override Feature

The User Data Override feature allows authorized users to override user values set by the authentication provider in `ChatUser.customData`. This is particularly useful for internal users who need to act on behalf of different accounts, companies, or roles without requiring separate authentication sessions. For example, an admin may need to be able to act as though he was a member of a specific account.

## Overview

When enabled, this feature provides:

- **Dynamic User Data**: Users can override their authentication-provided `ChatUser.customData` for specific chat apps
- **Account Switching**: Internal users can act on behalf of different customers or accounts
- **Role-based Access**: Only authorized user types can use this feature
- **Persistent Overrides**: Override data persists until logout or manual clearing via UI
- **Custom UI**: Fully customizable interface for data selection
- **Auto-complete Support**: Built-in support for searchable dropdowns and pickers

## Use Cases

Common scenarios where this feature is valuable:

- **Customer Support**: Internal support agents acting on behalf of different customer accounts
- **Multi-tenant Applications**: Users switching between different company contexts
- **Testing & QA**: Testing chat behavior for different user profiles
- **Account Management**: Managers overriding data to access different organizational contexts

## Configuration

### 1. Enable the Feature

In your `pika-config.ts`, enable the user data override feature:

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        userDataOverrides: {
            enabled: true,

            // Optional: Specify which user types can use this feature (defaults to ['internal-user'])
            userTypesAllowed: ['internal-user'],

            // Optional: Customize UI text

            // The name of the menu item that will appear to authorized users underneath the settings button
            menuItemTitle: 'Switch Account Context',

            // The title of the Dialog that opens to allow users to override data
            dialogTitle: 'Account Override',

            // A description that appears in the dialog explaining to users what the dialog is for
            dialogDescription: 'Select the account context to use for this chat app.',

            // Optional: Force users to provide overrides if missing required data
            promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing: ['accountId', 'accountType']
        }
    }
};
```

### 2. Configuration Options

| Property                                                   | Type     | Default                     | Description                                           |
| ---------------------------------------------------------- | -------- | --------------------------- | ----------------------------------------------------- |
| `enabled`                                                  | boolean  | -                           | **Required.** Whether to enable the feature           |
| `userTypesAllowed`                                         | string[] | `['internal-user']`         | User types that can use this feature                  |
| `menuItemTitle`                                            | string   | `'Override User Data'`      | Menu item text in the chat interface                  |
| `dialogTitle`                                              | string   | `'Override User Data'`      | Title of the override dialog                          |
| `dialogDescription`                                        | string   | Default message             | Description shown in the dialog                       |
| `dialogDescriptionWhenUserNeedsToProvideDataOverrides`     | string   | Same as `dialogDescription` | Special message when overrides are required           |
| `promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing` | string[] | `[]`                        | Force override dialog if these attributes are missing |

### 3. Required Attributes

The `promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing` option uses dot notation to check for missing data:

```typescript
// Example: Force override if these are missing from user.customData
promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing: [
    'accountId', // Checks user.customData.accountId
    'accountType', // Checks user.customData.accountType
    'company.name', // Checks user.customData.company.name
    'permissions.level' // Checks user.customData.permissions.level
];
```

## Implementation

### 1. Server-side Logic

Implement the required methods in `apps/pika-chat/src/routes/(auth)/api/user-data-override/custom-user-data.ts`:

```typescript
import type { AuthenticatedUser, ChatApp, RecordOrUndef } from '@pika/shared/types/chatbot/chatbot-types';

/**
 * Get initial data for the override dialog
 */
export async function getInitialDataForUserDataOverrideDialog(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>, chatApp: ChatApp): Promise<unknown | undefined> {
    // Return existing override data if available
    if (user.overrideData && user.overrideData[chatApp.chatAppId]) {
        const overrideData = user.overrideData[chatApp.chatAppId];

        // Transform stored data back to UI format
        return {
            accountId: overrideData.accountId,
            accountName: overrideData.accountName,
            accountType: overrideData.accountType
        };
    }

    return undefined;
}

/**
 * Get values for auto-complete inputs
 */
export async function getValuesForAutoComplete(
    componentName: string,
    valueProvidedByUser: string,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatApp: ChatApp
): Promise<unknown[] | undefined> {
    // Example: Return filtered account list based on search
    if (componentName === 'accountSelector') {
        if (!valueProvidedByUser || valueProvidedByUser.trim() === '') {
            // Return first 20 accounts
            return getAccounts()
                .slice(0, 20)
                .map((account) => ({
                    value: account.id,
                    label: account.name,
                    secondaryLabel: account.type
                }));
        }

        // Return filtered results
        const searchTerm = valueProvidedByUser.toLowerCase();
        return getAccounts()
            .filter((account) => account.id.toLowerCase().includes(searchTerm) || account.name.toLowerCase().includes(searchTerm))
            .slice(0, 20)
            .map((account) => ({
                value: account.id,
                label: account.name,
                secondaryLabel: account.type
            }));
    }

    return undefined;
}

/**
 * Process posted override data
 */
export async function userOverrideDataPostedFromDialog(
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatApp: ChatApp,
    overrideData: unknown | undefined
): Promise<RecordOrUndef> {
    if (!overrideData) {
        return undefined; // Clear overrides
    }

    const data = overrideData as any;

    // Transform UI data to storage format
    // MUST return Record<string, string | undefined>
    return {
        accountId: data.accountId,
        accountName: data.accountName,
        accountType: data.accountType
        // Add any other fields your application needs
    };
}

// Helper function - replace with your actual data source
function getAccounts() {
    // In real implementation, fetch from your database/API
    return [
        { id: 'acct-001', name: 'Acme Corp', type: 'enterprise' },
        { id: 'acct-002', name: 'Beta Industries', type: 'standard' }
        // ... more accounts
    ];
}
```

### 2. Custom UI Component

Create your UI component in `apps/pika-chat/src/lib/client/features/chat/user-data-overrides/custom-data-overrides-ui.svelte`:

```svelte
<script lang="ts">
    import Combobox from '$lib/components/ui-pika/combobox/combobox.svelte';
    import type { UserOverrideDataCommand } from '@pika/shared/types/chatbot/chatbot-types';

    // Required props interface
    interface Props {
        isValid: boolean | string;
        initialDataFromServer: unknown | undefined;
        disabled: boolean;
        getValuesForAutoComplete: (componentName: string, valueProvidedByUser: string) => Promise<void>;
        valuesForAutoComplete: Record<string, unknown[] | undefined>;
        userDataOverrideOperationInProgress: Record<UserOverrideDataCommand, boolean>;
        dataChanged: boolean;
    }

    let {
        isValid = $bindable(),
        dataChanged = $bindable(),
        initialDataFromServer,
        getValuesForAutoComplete,
        valuesForAutoComplete,
        userDataOverrideOperationInProgress,
        disabled,
    }: Props = $props();

    // Component state
    let selectedAccount = $state(initialDataFromServer as Account | undefined);
    let loading = $derived(userDataOverrideOperationInProgress['getValuesForAutoComplete']);

    const accountOptions = $derived.by(() => {
        return (valuesForAutoComplete?.['accountSelector'] ?? []) as Account[];
    });

    // Required methods
    export function reset() {
        selectedAccount = initialDataFromServer as Account | undefined;
        dataChanged = false;
        isValid = false;
    }

    export async function getDataToPostToServer(): Promise<unknown | undefined> {
        return selectedAccount;
    }

    // Event handlers
    function valueChanged(value: Account) {
        selectedAccount = value;

        // Check if data has changed
        const initialAccount = initialDataFromServer as Account | undefined;
        const hasChanged = !areAccountsEqual(initialAccount, selectedAccount);

        dataChanged = hasChanged;
        isValid = selectedAccount ? true : 'Please select an account';
    }

    async function onSearchValueChanged(value: string) {
        await getValuesForAutoComplete('accountSelector', value);
    }

    function areAccountsEqual(a: Account | undefined, b: Account | undefined): boolean {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return a.accountId === b.accountId &&
               a.accountName === b.accountName &&
               a.accountType === b.accountType;
    }

    interface Account {
        accountId: string;
        accountName: string;
        accountType: string;
    }
</script>

<div class="space-y-4">
    <div class="text-sm text-muted-foreground">
        Select the account context for this chat session:
    </div>

    <Combobox
        value={selectedAccount}
        mapping={{
            value: (value) => value.accountId,
            label: (value) => value.accountName,
            secondaryLabel: (value) => value.accountType,
        }}
        options={accountOptions}
        onValueChanged={valueChanged}
        {onSearchValueChanged}
        {loading}
        optionTypeName="account"
        optionTypeNamePlural="accounts"
        widthClasses="w-full"
        showValueInListEntries={true}
        minCharactersForSearch={1}
        {disabled}
    />

    {#if typeof isValid === 'string'}
        <div class="text-sm text-red-500">{isValid}</div>
    {/if}
</div>
```

### 3. Required Component Props and Methods

Your UI component must implement:

#### Props

- `isValid`: Set to `true`/`false` for validation, or a string for error messages
- `dataChanged`: Bind this to track if user has modified data
- `initialDataFromServer`: Data returned from `getInitialDataForUserDataOverrideDialog`
- `disabled`: Disable inputs when operations are in progress
- `getValuesForAutoComplete`: Call this for auto-complete functionality
- `valuesForAutoComplete`: Results from auto-complete calls
- `userDataOverrideOperationInProgress`: Track operation states

#### Methods

- `reset()`: Reset component to initial state
- `getDataToPostToServer()`: Return data to be saved

## Advanced Features

### 1. Multiple Auto-complete Components

Support multiple auto-complete inputs in one dialog:

```typescript
export function getValuesForAutoComplete(
    componentName: string,
    valueProvidedByUser: string,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatApp: ChatApp
): unknown[] | undefined {
    switch (componentName) {
        case 'accountSelector':
            return getAccountOptions(valueProvidedByUser);
        case 'departmentSelector':
            return getDepartmentOptions(valueProvidedByUser);
        case 'regionSelector':
            return getRegionOptions(valueProvidedByUser);
        default:
            return undefined;
    }
}
```

### 2. Complex Data Structures

Handle nested or complex override data:

```typescript
export function userOverrideDataPostedFromDialog(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>, chatApp: ChatApp, overrideData: unknown | undefined): RecordOrUndef {
    if (!overrideData) return undefined;

    const data = overrideData as ComplexOverrideData;

    // Flatten complex data to string key-value pairs
    return {
        accountId: data.account.id,
        accountName: data.account.name,
        accountType: data.account.type,
        department: data.department,
        region: data.location.region,
        permissions: JSON.stringify(data.permissions) // Store complex data as JSON
    };
}
```

### 3. External API Integration

Fetch data from external APIs:

```typescript
export async function getValuesForAutoComplete(
    componentName: string,
    valueProvidedByUser: string,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatApp: ChatApp
): Promise<unknown[] | undefined> {
    if (componentName === 'customerSelector') {
        try {
            const response = await fetch(`/api/customers/search?q=${valueProvidedByUser}`, {
                headers: {
                    Authorization: `Bearer ${getApiToken()}`
                }
            });

            const customers = await response.json();
            return customers.map((customer) => ({
                value: customer.id,
                label: customer.name,
                secondaryLabel: customer.type
            }));
        } catch (error) {
            console.error('Failed to fetch customers:', error);
            return [];
        }
    }

    return undefined;
}
```

## AWS Permissions

If your implementation calls AWS services, add permissions to the ECS task role in `apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts`:

```typescript
export class PikaChatCustomStackDefs {
    public static addStackResourcesBeforeWeCreateThePikaChatConstruct(scope: PikaChatStack): void {
        // Add permissions for API Gateway calls
        scope.stack.webapp.taskRole.addToPolicy(
            new iam.PolicyStatement({
                actions: ['execute-api:Invoke'],
                resources: ['arn:aws:execute-api:us-east-1:123456789012:api-id/stage/GET/customers']
            })
        );

        // Add permissions for DynamoDB access
        scope.stack.webapp.taskRole.addToPolicy(
            new iam.PolicyStatement({
                actions: ['dynamodb:Query', 'dynamodb:GetItem'],
                resources: ['arn:aws:dynamodb:us-east-1:123456789012:table/customers']
            })
        );
    }
}
```

## Usage

### 1. User Experience

When enabled, authorized users will see:

1. **Menu Item**: A "Override User Data" menu item in the chat interface
2. **Dialog**: Clicking opens a dialog with your custom UI
3. **Validation**: Real-time validation and error messages
4. **Auto-complete**: Searchable dropdowns for data selection
5. **Persistence**: Overrides persist until logout or manual clearing

### 2. Required Prompts

If you configure `promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing`, users will be automatically prompted to provide overrides when:

- They open a chat app and required data is missing
- They try to send a message without providing required overrides

## Security Considerations

### 1. Access Control

- Only users with allowed user types can access the feature
- Override data is stored in secure cookies
- Users cannot override data while viewing content as another user (content admin mode)

### 2. Data Validation

- Always validate override data on the server side
- Implement proper error handling for external API calls
- Limit auto-complete results to prevent performance issues

## Troubleshooting

### Common Issues

1. **Override dialog not appearing**: Check that user type is in `userTypesAllowed`
2. **Auto-complete not working**: Verify `getValuesForAutoComplete` returns correct format
3. **Data not persisting**: Ensure `userOverrideDataPostedFromDialog` returns proper format
4. **Validation errors**: Check that UI component sets `isValid` correctly

## Example: Complete Implementation

See the included example implementation in:

- `apps/pika-chat/src/routes/(auth)/api/user-data-override/custom-user-data.ts`
- `apps/pika-chat/src/lib/client/features/chat/user-data-overrides/custom-data-overrides-ui.svelte`

The example demonstrates account selection with auto-complete functionality and can be used as a starting point for your implementation.
