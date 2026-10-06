import { describe, it, expect } from '@jest/globals';
import { BadRequestError } from 'pika-shared/util/bad-request-error';
import { decodePathParameter } from '../../src/api/chatbot/path-params';

describe('decodePathParameter', () => {
    it('percent-decodes a message id', () => {
        expect(decodePathParameter('messageId', 's1%3A123')).toBe('s1:123');
    });

    it('throws BadRequestError naming the parameter on malformed input', () => {
        let thrown: unknown;
        try {
            decodePathParameter('messageId', '%E0%A4%A');
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBeInstanceOf(BadRequestError);
        expect((thrown as Error).message).toContain('messageId');
    });
});
