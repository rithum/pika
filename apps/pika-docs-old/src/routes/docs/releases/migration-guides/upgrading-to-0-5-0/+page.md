# Upgrading to 0.5.0

**Version:** 0.4.x → 0.5.0  
**Status:** Upcoming Breaking Change

This guide covers **two breaking changes** in version 0.5.0:

1. Tag system refactor (`chatAppId` → `usageMode`)
2. Chat session GSI update (sorting fix)

## Breaking Change 1: Tag System Refactor

The tag system has been refactored to use a more intuitive model:

**Old System:**

- Tags had a `chatAppId` field
- `'chat-app-global'` meant available to all apps
- Specific chatAppId meant available only to that app

**New System:**

- Tags have a `usageMode` field: `'global'` or `'chat-app'`
- Global tags are automatically available (can be disabled per app)
- Chat-app tags must be explicitly enabled per app
- Chat apps declare which tags they want via configuration

## Breaking Change 2: Chat Session GSI Update

The `user-chat-app-index` GSI on the chat session table has been updated to fix sorting issues and support filtering by session source:

**Old GSI:**

- Partition key: `user_id`
- Sort key: `chat_app_id`

**New GSI:**

- Partition key: `user_id`
- Sort key: `chat_app_sk` (composite: `chatAppId#source#lastUpdate`)

This change enables:

- Correct chronological sorting when querying user sessions by chat app
- Filtering between user-initiated sessions and component-initiated sessions
- Support for the new `source` field on chat sessions (`user`, `component-as-user`, or `component`)

## Manual Upgrade Steps Overview

This upgrade requires **data migration and two separate two-stage deployments**:

1. **Tag Definitions Table**: Manually update records, then replace `chatappid-status-index` with `scope-status-index`
2. **Chat Session Table**: Run migration tool to add composite keys and source field, then update `user-chat-app-index` sort key
3. **OpenSearch Index**: Update index mappings to include new `source` field

:::warning[Important]

- Tag migration follows: manual data update → comment out → deploy → wait → uncomment → deploy
- Chat session migration follows: run migration tool → comment out → deploy → wait → uncomment → deploy
  :::

---

## Part A: Tag System GSI Migration

### Tag Definitions Table Schema Change

**Old GSI:** `chatappid-status-index` (partition: `chat_app_id`, sort: `status`)  
**New GSI:** `scope-status-index` (partition: `usage_mode`, sort: `status`)

### Manual Upgrade Steps for Tag System

:::warning[Important]
AWS DynamoDB does not allow replacing a GSI in a single deployment. You must remove the old GSI first, wait for deletion to complete, then add the new GSI.
:::

### Step A1: Comment Out New Tag GSI

Navigate to `services/pika/lib/constructs/pika-construct.ts` and locate the `createTagDefinitionsTable()` method.

Comment out the new `scope-status-index` GSI:

```js
chatSessionTable.addGlobalSecondaryIndex({
    indexName: 'user-chat-app-index',
    partitionKey: {
        name: 'user_id',
        type: dynamodb.AttributeType.STRING
    },
    sortKey: {
        name: 'chat_app_sk',
        type: dynamodb.AttributeType.STRING
    },
    projectionType: dynamodb.ProjectionType.ALL
});
```

### Step A2: First Backend Deployment (Remove Old Tag GSI)

Deploy the backend stack to remove the old GSI:

```
cd services/pika
pnpm cdk:deploy
```

This deployment will:

- Remove the old `chatappid-status-index` GSI
- Keep the primary table structure intact

### Step A3: Wait for Tag GSI Deletion

**Critical:** You must wait for the GSI deletion to complete before proceeding.

1. Open AWS Console
2. Navigate to DynamoDB
3. Find your tag definitions table (e.g., `pika-tag-def-YourStackName`)
4. Go to the "Indexes" tab
5. Wait until the `chatappid-status-index` is completely gone

This typically takes 5-10 minutes but can vary.

### Step A4: Update Existing Tag Definitions in DynamoDB

**Critical:** Before deploying the new GSI, you must manually update your existing tag definition records in DynamoDB.

#### Using AWS Console

1. **Open DynamoDB Console**

    - Navigate to DynamoDB in the AWS Console
    - Find your tag definitions table (e.g., `pika-tag-def-YourStackName`)

2. **Update Each Tag Definition Record**

For each tag definition record, you need to:

**a) Remove the old field:**

- Delete the `chat_app_id` attribute

**b) Add the new field:**

- Add a `usage_mode` attribute (String type)
- Set the value based on the tag:

**Built-in Global Tags** (set `usage_mode` to `global`):

- `scope = 'pika'` AND `tag = 'chart'`
- `scope = 'pika'` AND `tag = 'image'`
- `scope = 'pika'` AND `tag = 'prompt'`

**All Other Tags** (set `usage_mode` to `chat-app`):

- Any tag with `scope != 'pika'`
- OR any pika tag not listed above (like `download`)

#### Example Transformations

**Before (Global Tag):**

```json
{
  "scope": "pika",
  "tag": "chart",
  "chat_app_id": "chat-app-global",
  "status": "enabled",
  ...
}
```

**After (Global Tag):**

```json
{
  "scope": "pika",
  "tag": "chart",
  "usage_mode": "global",
  "status": "enabled",
  ...
}
```

**Before (Chat-App Tag):**

```json
{
  "scope": "weather",
  "tag": "dashboard",
  "chat_app_id": "weather",
  "status": "enabled",
  ...
}
```

**After (Chat-App Tag):**

```json
{
  "scope": "weather",
  "tag": "dashboard",
  "usage_mode": "chat-app",
  "status": "enabled",
  ...
}
```

#### Using AWS CLI

Alternatively, you can use the AWS CLI to update records programmatically:

```
# Example: Update a tag definition
aws dynamodb update-item \
    --table-name pika-tag-def-YourStackName \
    --key '{"scope": {"S": "pika"}, "tag": {"S": "chart"}}' \
    --update-expression "REMOVE chat_app_id SET usage_mode = :mode" \
    --expression-attribute-values '{":mode": {"S": "global"}}' \
    --region us-east-1
```

**Important:** Make sure to update ALL tag definition records before proceeding to the next step.

### Step A5: Uncomment New Tag GSI

Go back to `services/pika/lib/constructs/pika-construct.ts` and uncomment the new GSI:

```js
// Add GSI for querying by usage_mode (scope field) and status
// This enables efficient queries for global tags (usage_mode='global')
tagDefinitionsTable.addGlobalSecondaryIndex({
    indexName: 'scope-status-index',
    partitionKey: {
        name: 'usage_mode',
        type: dynamodb.AttributeType.STRING
    },
    sortKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING
    },
    projectionType: dynamodb.ProjectionType.ALL
});
```

### Step A6: Second Backend Deployment (Add New Tag GSI)

Deploy the backend again to add the new GSI:

```
cd services/pika
pnpm cdk:deploy
```

This deployment will:

- Add the new `scope-status-index` GSI
- Enable the new query patterns

---

## Part B: Chat Session GSI Migration

### Chat Session Table Schema Change

**Old GSI:**

- Partition key: `user_id`
- Sort key: `chat_app_id`

**New GSI:**

- Partition key: `user_id`
- Sort key: `chat_app_sk` (composite key: `chatAppId#source#lastUpdate`)

**New Session Field:**

- `source`: `'user'`, `'component-as-user'`, or `'component'` (defaults to `'user'` for existing sessions)

### Manual Upgrade Steps for Chat Session GSI

### Step B1: Run Chat Session Migration Tool

**Critical:** Before making any GSI changes, you must migrate all existing chat session records to include the new composite key field and source attribute.

The migration tool will scan all records in your chat session table and:

- Add/update the `chat_app_sk` attribute with the composite key format: `chatAppId#source#lastUpdate`
- Set the `source` field to `'user'` for existing sessions that don't have it (sessions initiated by users vs components)

#### Setup Environment

1. Navigate to the services directory:

```
cd services/pika
```

2. Create a `.env.local` file if it doesn't exist:

```
stage=your-stage-name
PIKA_SERVICE_PROJ_NAME_KEBAB_CASE=your-project-name
```

Example:

```
stage=test
PIKA_SERVICE_PROJ_NAME_KEBAB_CASE=pika
```

#### Run the Migration

Execute the migration tool using `tsx`:

```
pnpm exec tsx tools/migration-chat-session-sort/migrate-chat-sessions.ts
```

The tool will:

- Scan all records in your chat session table
- Add the `chat_app_sk` composite key to each record
- Set the `source` field to `'user'` for records that don't have it
- Show progress indicators (`.` = updated, `s` = skipped, `E` = error)
- Display a summary with counts and duration

**Example output:**

```
Chat Session Composite Key Migration Tool
==========================================

Configuration:
  Stage: dev
  Project Name: pika
  Table Name: chat-session-pika-dev

Starting migration...
Progress: . = updated, s = skipped (already migrated), E = error

Scanning page 1...
  Found 150 sessions on this page
..................................................

==========================================
Migration Complete!
==========================================
Total sessions scanned: 150
Sessions updated: 150
Sessions skipped: 0
Errors: 0
Duration: 12.45s

✓ Migration completed successfully!
```

:::warning[Important]

- Ensure you have AWS credentials configured with permissions to read/write to the DynamoDB table
- The migration is idempotent - you can run it multiple times safely
- Sessions that already have the correct composite key will be skipped
- Complete this step before proceeding to remove the old GSI
  :::

### Step B2: Comment Out Chat Session GSI

Navigate to `services/pika/lib/constructs/pika-construct.ts` and locate the `createChatSessionTable()` method.

Comment out the `user-chat-app-index` GSI:

```js
// TEMPORARILY COMMENTED OUT FOR DEPLOYMENT
// chatSessionTable.addGlobalSecondaryIndex({
//     indexName: 'user-chat-app-index',
//     partitionKey: {
//         name: 'user_id',
//         type: dynamodb.AttributeType.STRING
//     },
//     sortKey: {
//         name: 'chat_app_sk',
//         type: dynamodb.AttributeType.STRING
//     },
//     projectionType: dynamodb.ProjectionType.ALL
// });
```

### Step B3: Third Backend Deployment (Remove Old Chat Session GSI)

Deploy the backend stack:

```
cd services/pika
pnpm cdk:deploy
```

This will remove the old `user-chat-app-index` GSI.

### Step B4: Wait for Chat Session GSI Deletion

Wait for the old GSI to be completely deleted:

1. Open AWS Console
2. Navigate to DynamoDB
3. Find your chat session table (e.g., `pika-chat-session-YourStackName`)
4. Go to the "Indexes" tab
5. Wait until the `user-chat-app-index` is completely gone

This typically takes 5-10 minutes.

### Step B5: Uncomment New Chat Session GSI

Go back to `services/pika/lib/constructs/pika-construct.ts` and uncomment with the **updated definition**:

```js
// Add GSI for querying sessions by user and chat app with chronological sorting
// Sort key format: chatAppId#source#lastUpdate (source is 'user' or 'component')
chatSessionTable.addGlobalSecondaryIndex({
    indexName: 'user-chat-app-index',
    partitionKey: {
        name: 'user_id',
        type: dynamodb.AttributeType.STRING
    },
    sortKey: {
        name: 'chat_app_sk', // Composite key
        type: dynamodb.AttributeType.STRING
    },
    projectionType: dynamodb.ProjectionType.ALL
});
```

### Step B6: Fourth Backend Deployment (Add New Chat Session GSI)

Deploy the backend again:

```
cd services/pika
pnpm cdk:deploy
```

This will add the new `user-chat-app-index` GSI with the composite sort key.

:::warning[Important]
Wait for the new GSI to become ACTIVE before deploying the frontend or running queries. Check the AWS Console DynamoDB "Indexes" tab.
:::

---

## Final Steps

### Deploy Frontend

Deploy the frontend application:

```
cd apps/pika-chat
pnpm build
# Deploy via your deployment method
```

### Update Chat App Configurations

If you have chat apps that were using specific tags, update their configuration to explicitly enable those tags:

**For Chat-App Specific Tags:**

```js
// In your chat app configuration
features: {
    tags: {
        enabled: true,
        tagsEnabled: [
            { scope: 'mycompany', tag: 'custom-widget' },
            { scope: 'weather', tag: 'dashboard' }
        ]
    }
}
```

**Note:** Global tags (chart, image, prompt) are now automatically available to all chat apps unless explicitly disabled via `tagsDisabled`.

## Chat App Configuration

Update your chat app configurations to use the new tag system:

### Enable Chat-App Tags

```js
{
    chatAppId: 'sales-chat',
    features: {
        tags: {
            enabled: true,
            tagsEnabled: [
                { scope: 'pika', tag: 'download' },
                { scope: 'acme', tag: 'order-status' }
            ]
        }
    }
}
```

### Disable Global Tags

```js
{
    chatAppId: 'minimal-chat',
    features: {
        tags: {
            enabled: true,
            tagsDisabled: [
                { scope: 'pika', tag: 'chart' },
                { scope: 'pika', tag: 'image' }
            ]
        }
    }
}
```

## Verification

After completing the upgrade:

1. **Check AWS Console - Tag Definitions Table:**

    - Verify the new `scope-status-index` GSI exists and is ACTIVE
    - Old `chatappid-status-index` GSI is completely removed

2. **Check AWS Console - Chat Session Table:**

    - Verify the new `user-chat-app-index` GSI exists and is ACTIVE
    - Sort key is `chat_app_sk`
    - Old GSI with `chat_app_id` sort key is completely removed

3. **Test Tag Queries:** Ensure tag definitions load correctly in your chat apps

4. **Test Session Queries:** Verify chat sessions are sorted chronologically by chat app

5. **Test Admin UI:** Verify the site admin interface shows tags correctly with the new two-list layout

6. **Test LLM Generation:** Confirm that tags can be generated by the LLM in chat responses

## Rollback

If you need to rollback:

1. The old code is still available in your git history
2. You'll need to reverse **both** GSI changes:
    - **Tag Definitions Table**: Remove `scope-status-index`, add back `chatappid-status-index`
    - **Chat Session Table**: Remove new `user-chat-app-index`, add back old version
3. Follow the same two-deployment process for each GSI in reverse
4. Revert any data migrations (tag definitions, chat sessions)

## Common Issues

### GSI Still Deleting (Either Table)

**Problem:** Deployment fails because old GSI hasn't finished deleting

**Solution:** Wait longer. Check AWS Console to confirm deletion is complete. GSI deletion typically takes 5-10 minutes.

### Forgot to Update DynamoDB Records

**Problem:** Errors appear after second deployment because records still have `chat_app_id` field

**Solution:**

- This is **Step 4** - critical and easy to miss
- Go back and manually update ALL tag definition records in DynamoDB
- Remove `chat_app_id` attribute from each record
- Add `usage_mode` attribute with correct value ('global' or 'chat-app')
- See Step 4 for detailed instructions

### Tags Not Appearing

**Problem:** Tags don't show up in chat apps after upgrade

**Solution:**

- Verify tag definitions have `usageMode` set correctly in DynamoDB
- Check chat app configuration has appropriate `tagsEnabled` or `tagsDisabled`
- Global tags should appear automatically unless disabled
- Chat-app tags must be explicitly enabled in `features.tags.tagsEnabled`

### Chat Session Sorting Not Working

**Problem:** Sessions aren't sorted chronologically after GSI update

**Solution:**

- Verify the new GSI is ACTIVE in AWS Console
- Check that `chat_app_sk` composite key is being populated correctly with format `chatAppId#source#lastUpdate`
- Verify the `source` field is set correctly on sessions (`'user'` for existing sessions, `'component'` for component-initiated ones)
- Ensure you ran the migration tool (Step B1) before the GSI changes
- Frontend must be deployed after backend deployment completes
- You can re-run the migration tool if needed - it's idempotent and will skip already-migrated records

### Admin UI Errors

**Problem:** Site admin tag configuration shows errors

**Solution:**

- Clear browser cache
- Verify frontend was deployed after backend
- Check browser console for specific errors

### Deployment Conflicts

**Problem:** CDK deployment fails with "Resource is being updated" error

**Solution:**

- Wait for any in-progress CloudFormation stack updates to complete
- Don't try to deploy both GSI changes simultaneously
- Complete Part A (Tag System) fully before starting Part B (Chat Session)

## Support

For issues during upgrade:

- Check CDK deployment logs for errors
- Review DynamoDB table structure in AWS Console
- Verify GSI status (CREATING, ACTIVE, DELETING) in AWS Console
- Consult the [Tags Feature documentation](/docs/developer/tags-feature) for configuration details
- See [Migration Guides](/docs/releases/migration-guides) for other upgrade paths
