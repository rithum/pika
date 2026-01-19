# Session Metadata Backfill Tool

This tool backfills `user_type` field to existing chat session records by looking up users in the `chat-user` table.

## What It Does

For each session that's missing `user_type`:

1. Looks up the user in the `chat-user` table
2. Copies the `user_type` from the user to the session
3. Defaults to `'external-user'` if user is not found

## When To Use This

This tool is part of the **0.11.0 migration**. Run it after upgrading to 0.11.0 to backfill existing session data.

See the [Upgrading to 0.11.0 Migration Guide](https://pika.tools/platform/releases/migration-guides/upgrading-to-0-11-0) for complete migration instructions.

## Prerequisites

Ensure `.env.local` exists in `services/pika/` with:

```bash
stage=<your-stage>
PIKA_SERVICE_PROJ_NAME_KEBAB_CASE=<your-project-name>
```

## Usage

From the `services/pika` directory:

```bash
npx tsx tools/backfill-session-metadata/index.ts
```

## Output

The tool provides real-time progress indicators:

- `.` = session updated with user_type
- `s` = session skipped (already has user_type)
- `E` = error

### Statistics Reported

```
Chat Session UserType Backfill Tool
====================================

Configuration:
  Stage: prod
  Project Name: my-project
  Session Table Name: my-project-prod-chat-session
  User Table Name: my-project-prod-chat-user

Starting backfill...
Progress: . = updated, s = skipped (already has userType), E = error

Scanning page 1...
  Found 250 sessions on this page
..................................
  Cache stats: 150 cache hits, 50 DB lookups

====================================
Backfill Complete!
====================================
Total sessions scanned: 15234
Sessions updated: 14500
Sessions skipped: 734
Errors: 0
User cache hits: 14500
User DB lookups: 342
Duration: 45.23s

✓ Backfill completed successfully!

Note: The DynamoDB stream will automatically replicate these changes to OpenSearch.
```

## Performance

- **User Caching**: The script caches user lookups, so users with multiple sessions are only queried once
- **Typical Runtime**: 5-15 minutes for 10,000 sessions
- **Safe to Re-run**: Idempotent - sessions that already have `user_type` are skipped

## Error Handling

- **User Not Found**: Defaults to `'external-user'` and logs a warning
- **User Lookup Error**: Defaults to `'external-user'`, caches the result to avoid retry storms

## Notes

- After this tool updates sessions in DynamoDB, the DynamoDB stream will automatically trigger replication to OpenSearch
- No additional steps are required for OpenSearch sync
