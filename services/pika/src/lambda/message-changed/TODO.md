# Message Replication TODOs

## High Priority

### 1. CloudWatch Alarm on Replication Failures

- **Pattern**: Search for `FAILED_REPLICATION` in Lambda logs
- **Threshold**: > 10 failures in 5 minutes
- **Action**: SNS notification to ops team
- **CloudWatch Insights Query**:

```
fields @timestamp, messageId, sessionId, error
| filter @message like /FAILED_REPLICATION/
| sort @timestamp desc
```

### 2. Dead Letter Queue (DLQ)

- Add DLQ to message-changed Lambda in CDK/CloudFormation
- Capture failed events for manual retry
- Create retry Lambda that processes DLQ messages

### 3. Replication Dashboard

Create CloudWatch dashboard showing:

- Replication success rate (%)
- Failed replications by error type
- Replication lag (DynamoDB event time to OpenSearch index time)
- messages_summary array size distribution (alert if >1000)

## Medium Priority

### 4. Replay Mechanism

Build tool to replay failed replications:

- Query CloudWatch logs for FAILED_REPLICATION entries
- Extract full message payload
- Re-execute replication logic
- Track successes/failures

### 5. Monitoring: Session Document Size

- Track messages_summary array size per session
- Alert if any session exceeds 1000 messages
- Consider archival strategy for very long sessions

### 6. Message Deletion Handling

Currently, REMOVE events don't delete from OpenSearch. Consider:

- Delete from message index when message is deleted from DynamoDB
- Update messages_summary to remove entry (or mark as deleted)
- Recalculate messages_analysis (expensive - may want to skip)

## Low Priority

### 7. Optimization: Batch Updates

If many messages arrive rapidly for same session, batch the updates instead of individual operations.

### 8. Compression: messages_summary

If array size becomes issue, consider storing compressed version for very old messages.

### 9. MODIFY Event Optimization

Currently, MODIFY events replicate the entire message. Consider:

- Only replicate if specific fields changed (message text, usage metrics)
- Skip replication for metadata-only changes
