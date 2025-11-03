# Backfill Messages to OpenSearch

This tool performs a one-time migration to populate the message index and add `messages_summary` and `messages_analysis` fields to existing session documents in OpenSearch.

## Performance Optimizations

The tool is optimized for speed using:

1. **Parallel Session Processing**: Processes multiple sessions concurrently (default: 10)
2. **Bulk Message Indexing**: Batches message index operations (default: 100 messages per bulk request)
3. **Bulk Session Updates**: Batches session updates (default: 50 sessions per bulk request)
4. **Efficient DynamoDB Scanning**: Larger page sizes to reduce round trips

### Performance Characteristics

On a typical deployment:

- **~50-100 sessions/second** (depending on message count per session)
- **~500-1000 messages/second** indexed to OpenSearch
- Minimal impact on OpenSearch cluster (bulk operations are efficient)

## Usage

### Basic Usage

```bash
# Dry run to preview what will be migrated
npx tsx tools/backfill-messages-to-opensearch/index.ts --dry-run

# Full backfill
npx tsx tools/backfill-messages-to-opensearch/index.ts
```

### Options

```bash
--dry-run                    Preview changes without applying them
--start-date YYYY-MM-DD      Only process sessions created after this date
--end-date YYYY-MM-DD        Only process sessions created before this date
--session-id ID              Process only this specific session
--skip-message-index         Skip indexing to message index (only update sessions)
--skip-session-update        Skip updating session documents (only index messages)
--concurrency N              Number of sessions to process in parallel (default: 10)
--message-batch-size N       Number of messages to index in one bulk operation (default: 100)
--session-batch-size N       Number of sessions to update in one bulk operation (default: 50)
```

### Examples

```bash
# Conservative settings for small clusters
npx tsx tools/backfill-messages-to-opensearch/index.ts \
  --concurrency 5 \
  --message-batch-size 50 \
  --session-batch-size 25

# Aggressive settings for large clusters
npx tsx tools/backfill-messages-to-opensearch/index.ts \
  --concurrency 20 \
  --message-batch-size 200 \
  --session-batch-size 100

# Process only sessions from a specific date range
npx tsx tools/backfill-messages-to-opensearch/index.ts \
  --start-date 2025-01-01 \
  --end-date 2025-03-31

# Process only messages (skip session updates)
npx tsx tools/backfill-messages-to-opensearch/index.ts \
  --skip-session-update

# Process a single session for testing
npx tsx tools/backfill-messages-to-opensearch/index.ts \
  --session-id 019a404c-2b12-77dd-a13c-ce3cdf7e7f6f
```

## How It Works

1. **Scan Sessions**: Scans all sessions from DynamoDB
2. **Filter**: Applies date filters and skips certain invocation modes
3. **Query Messages**: For each session, queries all messages from DynamoDB
4. **Sort Messages**: Sorts by timestamp (important for chronological calculations)
5. **Build Batches**: Accumulates messages and session updates into batches
6. **Bulk Index**: Uses OpenSearch bulk API to index messages
7. **Bulk Update**: Uses OpenSearch bulk API to update sessions
8. **Flush**: At the end, flushes any remaining partial batches

### Message Analysis Calculation

The tool calculates `messages_analysis` with the following metrics:

- **Message Counts**: Total messages, user messages, assistant messages
- **Timing Stats**: Response times, think times, conversation duration
- **Gap Analysis**: Average gaps, long gaps (>1h, >1d, >1w)
- **First/Last Tracking**: First and last message timestamps

**Important**: Messages are sorted by timestamp before calculation, ensuring chronological accuracy regardless of insertion order.

## Error Handling

- **Partial Batch Failures**: Individual item failures don't fail the entire batch
- **Session-Level Errors**: Errors in one session don't stop processing of other sessions
- **Resume Capability**: Sessions with existing `messages_summary` are skipped (can re-run safely)
- **Error Reporting**: All errors are collected and reported at the end

## Monitoring

The tool provides progress updates:

```
Progress: 1000 sessions processed, 25000 messages
Progress: 2000 sessions processed, 50000 messages
...
```

Final summary includes:

- Total duration and throughput (sessions/sec, messages/sec)
- Sessions processed, updated, and skipped
- Messages processed and indexed
- Error count and details

## Environment Variables

Required environment variables (loaded from `.env.local`):

- `CHAT_SESSION_TABLE_NAME`: DynamoDB table name for sessions
- `CHAT_MESSAGE_TABLE_NAME`: DynamoDB table name for messages
- `PIKA_DOMAIN_ENDPOINT`: OpenSearch domain endpoint
- `AWS_REGION`: AWS region
- `stage`: Stage name (e.g., test, prod)

## Tuning Recommendations

### Small OpenSearch Clusters (< 3 nodes)

```bash
--concurrency 5 \
--message-batch-size 50 \
--session-batch-size 25
```

### Medium OpenSearch Clusters (3-10 nodes)

```bash
--concurrency 10 \
--message-batch-size 100 \
--session-batch-size 50
```

### Large OpenSearch Clusters (> 10 nodes)

```bash
--concurrency 20 \
--message-batch-size 200 \
--session-batch-size 100
```

### Monitoring OpenSearch Health

Watch for:

- OpenSearch CPU < 80%
- Indexing queue not building up
- Bulk queue size staying low

If you see issues, reduce concurrency and batch sizes.

## Limitations

- Only processes sessions with `invocationMode` of `chat-app` (skips `direct-agent-invoke` and `chat-app-component`)
- Requires sessions to exist in OpenSearch (doesn't create new session documents)
- Skips sessions already having `messages_summary` (no re-processing)
