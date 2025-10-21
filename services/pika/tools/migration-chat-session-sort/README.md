# Chat Session Composite Key Migration Tool

This tool migrates existing chat session records in DynamoDB to include the new composite sort key required for version 0.5.0.

## Purpose

In version 0.5.0, the chat session table's `user-chat-app-index` GSI was updated to use a composite sort key (`chat_app_sk`) that combines the chat app ID, source, and last update timestamp. This enables proper chronological sorting of sessions per chat app and filtering by session source.

This migration tool:

- Scans all records in your chat session table
- Adds/updates the `chat_app_sk` attribute with format: `chatAppId#source#lastUpdate`
- Sets the `source` field to `'user'` for existing sessions that don't have it
- Is idempotent - can be run multiple times safely

## Prerequisites

- AWS credentials configured with read/write access to DynamoDB
- `.env.local` file in `services/pika/` directory with:
    - `stage` - Your deployment stage (e.g., `dev`, `prod`)
    - `PIKA_SERVICE_PROJ_NAME_KEBAB_CASE` - Your project name in kebab-case

## Usage

1. Create or verify `.env.local` file in `services/pika/`:

```bash
cd services/pika
cat > .env.local << EOF
stage=dev
PIKA_SERVICE_PROJ_NAME_KEBAB_CASE=pika
EOF
```

2. Run the migration:

```bash
pnpm exec tsx tools/migration-chat-session-sort/migrate-chat-sessions.ts
```

## Output

The tool provides real-time progress indicators:

- `.` - Session updated successfully
- `s` - Session skipped (already has correct composite key)
- `E` - Error updating session

Final summary includes:

- Total sessions scanned
- Sessions updated
- Sessions skipped
- Errors encountered
- Total duration

## When to Run

Run this migration **before** removing and re-adding the chat session GSI in your CDK deployment. See the [Upgrading to 0.5.0](/docs/releases/migration-guides/upgrading-to-0-5-0) guide for complete upgrade instructions.

## Table Name Format

The tool constructs the table name as:

```
chat-session-${PIKA_SERVICE_PROJ_NAME_KEBAB_CASE}-${stage}
```

Ensure your `.env.local` values match your actual deployment.

## Error Handling

If errors occur:

- Check AWS credentials are valid
- Verify DynamoDB table permissions
- Ensure table name matches your deployment
- Review error messages in console output

The tool will exit with code 1 if any errors occur during migration.
