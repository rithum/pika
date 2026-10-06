import { buildInsightsSweepQueryInput } from '../../src/lib/insights-sweep-query';
import { INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS } from 'pika-shared/types/chatbot/chatbot-types';

const SETTLE = '2026-06-19T03:00:00.000Z';
const FLOOR = '2026-06-18T00:00:00.000Z';

describe('buildInsightsSweepQueryInput', () => {
    it('keys on insight_status only — no last_message_id sort-key cutoff (the original bug)', () => {
        const q = buildInsightsSweepQueryInput('chat-session', SETTLE);
        expect(q.KeyConditionExpression).toBe('insight_status = :insightStatus');
        expect(q.KeyConditionExpression).not.toContain('last_message_id');
        expect(q.IndexName).toBe('insight-status-index');
        expect(q.ExpressionAttributeValues[':insightStatus']).toBe(INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS);
        // never compare the sessionId:num sort key against a date string anywhere in the query
        expect(JSON.stringify(q)).not.toContain('last_message_id');
    });

    it('filters by the settle cutoff on last_update (real timestamp attr)', () => {
        const q = buildInsightsSweepQueryInput('t', SETTLE);
        expect(q.FilterExpression).toBe('last_update <= :settleCutoff');
        expect(q.ExpressionAttributeValues[':settleCutoff']).toBe(SETTLE);
        expect(q.ExpressionAttributeValues[':startFloor']).toBeUndefined();
    });

    it('adds the start-date floor when provided (only post-launch sessions)', () => {
        const q = buildInsightsSweepQueryInput('t', SETTLE, FLOOR);
        expect(q.FilterExpression).toBe('last_update <= :settleCutoff AND last_update >= :startFloor');
        expect(q.ExpressionAttributeValues[':startFloor']).toBe(FLOOR);
        expect(q.ExpressionAttributeValues[':settleCutoff']).toBe(SETTLE);
    });

    it('omits the floor when startFloor is empty/undefined', () => {
        expect(buildInsightsSweepQueryInput('t', SETTLE, undefined).FilterExpression).toBe('last_update <= :settleCutoff');
        expect(buildInsightsSweepQueryInput('t', SETTLE, '').FilterExpression).toBe('last_update <= :settleCutoff');
    });
});
