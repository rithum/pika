# Chat Message Metadata Backfill Tool

This tool backfills `invocationMode` and `userType` fields to existing chat messages by looking up their associated session records.

## What It Does

For each message that's missing `invocation_mode` or `user_type`:

1. Looks up the corresponding session record
2. Copies `invocation_mode` and `user_type` from the session to the message
3. Uses defaults if session is not found:
    - `invocation_mode`: `'chat-app'`
    - `user_type`: `'internal-user'`

## Performance Optimizations

### Batch Writes

- Uses DynamoDB's `BatchWriteCommand` to write up to 25 messages per API call
- Dramatically reduces the number of API calls compared to individual updates
- Reduces write costs and improves throughput

### Parallel Processing

- Processes multiple batches in parallel (configurable concurrency)
- Default: 10 concurrent batch operations
- Further increases throughput while respecting API limits

### Session Caching

- Caches session lookups in memory to avoid redundant database queries
- Multiple messages from the same session only trigger one DB lookup
- Significantly reduces read operations and latency

### Efficient Scanning

- Scans 500 messages per page (configurable)
- Prepares all messages in a page in parallel
- Only writes batches for messages that actually need updates

## Configuration

Edit the constants at the top of `backfill-message-metadata.ts`:

```typescript
const BATCH_SIZE = 25; // DynamoDB BatchWrite limit
const CONCURRENCY = 10; // Number of parallel batch operations
const SCAN_LIMIT = 500; // Messages to scan per page
```

### Tuning Recommendations

- **Higher Concurrency**: If you have high DynamoDB provisioned capacity or on-demand mode
- **Lower Concurrency**: If you're hitting throttling errors
- **Larger Scan Limit**: For faster scanning with low latency, but higher memory usage
- **Smaller Scan Limit**: If you're concerned about memory usage

## Prerequisites

Ensure `.env.local` exists in `services/pika/` with:

```bash
stage=<your-stage>
PIKA_SERVICE_PROJ_NAME_KEBAB_CASE=<your-project-name>
```

## Usage

From the `services/pika` directory:

```bash
npx tsx tools/add-invocation-type-to-chat-message/backfill-message-metadata.ts
```

## Output

The tool provides real-time progress indicators:

- `.` = message updated
- `s` = message skipped (already has both fields)
- `E` = error

### Statistics Reported

```
📊 Statistics:
  Total messages scanned: 15234 (127.8/sec)
  Messages updated: 8456
  Messages skipped: 6778
  Errors: 0
  Batch write operations: 339
  Session cache hits: 12890
  Session DB lookups: 2344
  Duration: 119.2s
```

### Performance Metrics

- **Messages/sec**: Overall throughput
- **Batch write operations**: Number of batch API calls made
- **Session cache hits**: Number of times session metadata was retrieved from cache
- **Session DB lookups**: Number of actual database queries for sessions

## How It Works

### 1. Scan Phase

Scans the message table in pages, fetching multiple messages at once.

### 2. Preparation Phase

For each page of messages:

- Checks which messages need updates (in parallel)
- Looks up session metadata (with caching)
- Prepares updated message items

### 3. Batch Write Phase

- Groups messages into batches of 25
- Writes batches in parallel with concurrency control
- Uses DynamoDB's `BatchWriteCommand` for efficiency

### 4. Progress Tracking

Displays real-time statistics including:

- Cache hit ratio
- Batch operations count
- Throughput metrics

## Error Handling

- **Session Not Found**: Uses default values and logs a warning
- **Batch Write Failure**: Logs error and continues with next batch
- **Session Lookup Error**: Uses defaults and caches the result to avoid retry storms

## Comparison to Old Implementation

### Old Approach (1-by-1 updates)

```
Scanned 10000 messages:
- 10000 individual UpdateCommand calls
- ~60-120 seconds
- Higher cost per message
```

### New Approach (Batch + Parallel)

```
Scanned 10000 messages:
- ~400 batch write operations (25 messages each)
- 10 concurrent batches
- ~15-30 seconds
- 4-8x faster
- Lower cost per message
```

## Notes

- The tool uses `PutItem` (via `BatchWriteCommand`) to write the entire message item, not just update specific fields
- This ensures atomic writes and avoids issues with partial updates
- Session metadata is cached per page, so messages from the same session benefit from reduced lookups
- Progress indicators are written to stdout in real-time for monitoring

## DynamoDB Stream Replication

**Important**: After this tool updates messages in DynamoDB, the DynamoDB stream will automatically trigger the `message-changed` Lambda function, which will replicate these changes to OpenSearch. No additional steps are required.
