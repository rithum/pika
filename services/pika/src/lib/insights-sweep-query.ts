import { INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS } from 'pika-shared/types/chatbot/chatbot-types';

export interface InsightsSweepQueryInput {
    TableName: string;
    IndexName: string;
    KeyConditionExpression: string;
    FilterExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
}

/**
 * Builds the GSI query for the session-insights sweep.
 * - KeyCondition is the `insight_status` partition only: `last_message_id` is `${sessionId}:${num}`, not a timestamp.
 * - `settleCutoff` skips conversations still in progress.
 * - `startFloor` is optional and lets a caller skip historical backlog.
 */
export function buildInsightsSweepQueryInput(
    tableName: string,
    settleCutoffIso: string,
    startFloorIso?: string
): InsightsSweepQueryInput {
    const filters = ['last_update <= :settleCutoff'];
    const values: Record<string, unknown> = {
        ':insightStatus': INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS,
        ':settleCutoff': settleCutoffIso
    };
    if (startFloorIso) {
        filters.push('last_update >= :startFloor');
        values[':startFloor'] = startFloorIso;
    }
    return {
        TableName: tableName,
        IndexName: 'insight-status-index',
        KeyConditionExpression: 'insight_status = :insightStatus',
        FilterExpression: filters.join(' AND '),
        ExpressionAttributeValues: values
    };
}
