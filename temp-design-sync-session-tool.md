### Sync Session Backfill Tool — Concise Design

Goal: Backfill and synchronize historical chat data so OpenSearch reflects DynamoDB truth and insights exist where expected.

- **Scope**: Chat sessions, session insights, and feedback.
- **Mechanism**: Touch DynamoDB items to emit stream events that drive existing Lambdas to (re)index OpenSearch and populate insights.

### Components used

- DynamoDB tables: `CHAT_SESSION_TABLE`, `CHAT_SESSION_FEEDBACK_TABLE`
- OpenSearch index: `session`
- Lambdas (already deployed):
    - `session-changed` (replicates sessions to OpenSearch; reads S3 insights if URL present)
    - `session-feedback-changed` (replicates feedback arrays into the session document in OpenSearch)
    - `session-changed-insights` (marks sessions as needing insights when messages change)
    - `session-insights-runner` (runs every minute to compute insights and write to S3, then clears status)

### Commands and mapping to tasks

- `syncSessionInsights`
    - Performs Task 1 then Task 2, in order.
- `syncFeedback`
    - Performs Task 3 (after verifying Task 1 was completed for targeted sessions).

### Task 1: Synchronize missing chat sessions (DDB → OpenSearch)

- **Detect missing**
    - Enumerate sessions from DynamoDB in pages (scan or index-iterate with projection: `userId`, `sessionId`, `chatAppId`, `lastMessageId`, `lastAnalyzedMessageId`, `insightsS3Url`).
    - For each page, build `ids = session.sessionId[]` and check OpenSearch presence via batched mget (`getExistingDocumentsByIds('session', ids)` or equivalent from `services/pika/src/lib/opensearch/opensearch.ts`).
    - Identify `missingIds = ids - existingIds`.
- **Trigger re-indexing (no new attributes)**
    - For each missing session, call `touchChatSession({ userId, sessionId })` which performs a no-op re-write of `last_update` to its current value, emitting a DynamoDB MODIFY event without changing business data.
    - Result: `session-changed` Lambda receives MODIFY, checks existence in OpenSearch and inserts full document (and reads S3 insights if `insightsS3Url` is set).
- **Batching/limits**
    - Page size: 200-500 DDB items; OS mget in chunks of 100-500.
    - Concurrency: 4-8 parallel mget/update batches.
    - Retries: 3 with backoff on throttling.

### Task 2: Ensure insights have been generated (drive runner)

- **Settling period (runner enforcement)**
    - Runner computes `cutoffDate = now - WAIT_TO_COMPUTE_INSIGHTS_MS` (default: 1 hour) and queries GSI `insight-status-index` with:
        - `insight_status = 'NEEDS_INSIGHTS_ANALYSIS' AND last_message_id <= cutoffDate`
    - Only sessions older than the cutoff are processed on each minute tick; newer sessions remain pending until they pass the settling period.
- **Detect needs-insights**
    - For each session from Task 1 (or all sessions), decide eligibility based on fields:
        - If `lastMessageId` exists and `lastAnalyzedMessageId` is missing → mark as needing insights.
        - If both exist and differ → mark as needing recompute (also clear analyzed id).
    - Note: We may mark sessions regardless of age; the runner will only pick up those with `lastMessageId <= cutoffDate`. Optionally restrict marking to already-eligible sessions (see flags).
- **Mark for analysis**
    - Preferred (explicit) update per session:
        - Set `insightStatus = 'NEEDS_INSIGHTS_ANALYSIS'`.
        - If `lastAnalyzedMessageId` differs from `lastMessageId`, set `lastAnalyzedMessageId = null`.
    - Alternative (implicit) path: touch the record and let `session-changed-insights` compute the status. We will use the explicit path for determinism and fewer passes.
- **Safety/idempotency**
    - Updates are conditional and idempotent; writing same values repeatedly is safe.
    - Avoid modifying unrelated attributes.

### Task 3: Backfill missing feedback into OpenSearch

- **Precondition**: Session exists in OpenSearch (Task 1 done for those sessions).
- **Detect missing feedback**
    - For a target session set (all or filtered):
        - Read the OpenSearch session doc’s `feedback` array (IDs present).
        - Query `CHAT_SESSION_FEEDBACK_TABLE` by `sessionId` to list canonical feedback records and IDs.
        - Compute `missingFeedback = ddbFeedbackIds - osFeedbackIds`.
- **Trigger replication for missing-only (no new attributes)**
    - For each missing feedback item, perform a no-op update (e.g., re-write `updated_on` to its current value via existing `updateFeedback` path) to emit a stream MODIFY without adding attributes.
    - Result: `session-feedback-changed` Lambda updates the session’s feedback array in OpenSearch.
- **Batching/limits**
    - Process sessions in pages; within each page, diff and touch missing items only.
    - Concurrency: 4-8 sessions in parallel; per-session DDB ops batched where possible.

### Execution order

1. `syncSessionInsights` (includes Task 1 → Task 2)
2. Wait a short period for runner cycle(s) if needed (or run multiple passes)
3. `syncFeedback` (Task 3)

### CLI behaviors

- Env loading from `services/pika/.env.local` (already implemented in `services/pika/tools/os/ddb-tools.ts`).
- Required env: `AWS_REGION`, `stage`, `PIKA_SERVICE_PROJ_NAME_KEBAB_CASE`, `PIKA_CHAT_PROJ_NAME_KEBAB_CASE`, `PIKA_DOMAIN_ENDPOINT`, and DDB table names derivable from these.
- Flags: `--dry-run` (log planned actions, no writes), `--concurrency`, `--limit <n>` (optional scoping), `--sessions <csv>` (optional focus by sessionId), `--eligible-only` (only mark sessions whose `lastMessageId <= cutoffDate`).

### Idempotency and safety

- Only touch DDB to trigger streams; business fields unchanged except explicit insights-status updates in Task 2.
- All operations can be re-run safely; duplicate touches cause no harm.
- Errors are logged per item and do not abort whole run; final summary printed.

### Observability

- Counts per stage: scanned sessions, missing sessions, sessions marked for insights, feedback compared, feedback touched.
- Error counts and sample IDs.
- Optional `--verbose` for per-item logs.

### References

- `services/pika/src/lambda/session-changed/index.ts`
- `services/pika/src/lambda/session-changed-insights/index.ts`
- `services/pika/src/lambda/session-feedback-changed/index.ts`
- `services/pika/src/lambda/session-insights-runner/index.ts`
- `services/pika/src/lambda/session-insights-runner/insights-analyzer.ts`
- `services/pika/tools/os/os-tools.ts` (OpenSearch helpers and patterns)
