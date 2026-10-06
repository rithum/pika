import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { jest } from '@jest/globals';

process.env.CHAT_MESSAGES_TABLE = 'test-messages-table';

import { getChatMessagesInSession } from '../../src/lib/chat-ddb';

// Spy on the prototype method so the module-level DynamoDBDocument instance uses our mock
const querySpy = jest.spyOn(DynamoDBDocument.prototype, 'query');

describe('getChatMessagesInSession pagination', () => {
    beforeEach(() => {
        querySpy.mockReset();
    });

    afterAll(() => {
        querySpy.mockRestore();
    });

    it('follows LastEvaluatedKey so messages past the 1 MB query cap are not dropped', async () => {
        const page1Items = Array.from({ length: 28 }, (_, i) => ({ message_id: `s1:${i}`, message: `m${i}` }));
        const page2Items = Array.from({ length: 26 }, (_, i) => ({ message_id: `s1:${i + 28}`, message: `m${i + 28}` }));
        querySpy
            .mockResolvedValueOnce({
                Items: page1Items,
                LastEvaluatedKey: { user_id: 'u1', message_id: 's1:27' }
            } as never)
            .mockResolvedValueOnce({ Items: page2Items } as never);

        const messages = await getChatMessagesInSession('u1', 's1');

        expect(messages).toHaveLength(54);
        expect(messages[53].messageId).toBe('s1:53');
        expect(querySpy).toHaveBeenCalledTimes(2);
        const secondCall = querySpy.mock.calls[1][0] as any;
        expect(secondCall.ExclusiveStartKey).toEqual({ user_id: 'u1', message_id: 's1:27' });
    });

    it('makes a single query when there is no LastEvaluatedKey', async () => {
        querySpy.mockResolvedValueOnce({ Items: [{ message_id: 's1:1', message: 'hi' }] } as never);

        const messages = await getChatMessagesInSession('u1', 's1');

        expect(messages).toHaveLength(1);
        expect(querySpy).toHaveBeenCalledTimes(1);
        const firstCall = querySpy.mock.calls[0][0] as any;
        expect(firstCall.ExclusiveStartKey).toBeUndefined();
    });
});
