import { describe, it, expect, beforeEach } from '@jest/globals';
import { isUnrecoverableAnalysisError } from '../../src/lambda/session-insights-runner/analysis-error';
import { buildUpdateRequest } from '../../src/lib/chat-admin-ddb';

describe('isUnrecoverableAnalysisError', () => {
    it('is true for a ValidationException', () => {
        const e = new Error('bad input');
        e.name = 'ValidationException';
        expect(isUnrecoverableAnalysisError(e)).toBe(true);
    });

    it('is true for an input-too-long message', () => {
        expect(isUnrecoverableAnalysisError(new Error('Input is too long for requested model'))).toBe(true);
    });

    it('is false for a throttling error', () => {
        const e = new Error('slow down');
        e.name = 'ThrottlingException';
        expect(isUnrecoverableAnalysisError(e)).toBe(false);
    });

    it('is false for a non-Error value', () => {
        expect(isUnrecoverableAnalysisError('boom')).toBe(false);
    });
});

describe('buildUpdateRequest', () => {
    beforeEach(() => {
        process.env.CHAT_SESSION_TABLE = 'chat-session-table';
    });

    it('sets INSIGHTS_FAILED as the insight status', () => {
        const req = buildUpdateRequest({
            userId: 'u',
            sessionId: 's',
            lastAnalyzedMessageId: undefined,
            insightStatus: 'INSIGHTS_FAILED',
            insightsS3Url: undefined
        });
        expect(req?.updateParams.UpdateExpression).toContain('#insightStatus = :insightStatus');
        expect(req?.updateParams.ExpressionAttributeValues[':insightStatus']).toBe('INSIGHTS_FAILED');
    });
});
