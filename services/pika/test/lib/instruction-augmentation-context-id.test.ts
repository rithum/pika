import type { ChatSession, LLMContextItem, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import { contextItemId, filterLLMContextItems } from '../../src/lib/instruction-augmentation';

describe('contextItemId', () => {
    it('stringifies a numeric id', () => {
        expect(contextItemId({ id: 7 }, 1)).toBe('7');
    });

    it('stringifies 0', () => {
        expect(contextItemId({ id: 0 }, 1)).toBe('0');
    });

    it('falls back to ctx-N for undefined, null and empty ids', () => {
        expect(contextItemId({}, 3)).toBe('ctx-3');
        expect(contextItemId({ id: undefined }, 3)).toBe('ctx-3');
        expect(contextItemId({ id: null }, 3)).toBe('ctx-3');
        expect(contextItemId({ id: '' }, 3)).toBe('ctx-3');
    });

    it('keeps a non-empty string id', () => {
        expect(contextItemId({ id: 'abc' }, 2)).toBe('abc');
    });

    it('keeps ctx-2 for the second item when an earlier item is filtered out', async () => {
        const raw = [
            { id: 'a', origin: 'auto', contentHash: 'h1', description: 'd', context: 'x' },
            { origin: 'user', contentHash: 'h2', description: 'd', context: 'y' }
        ] as unknown as LLMContextItem[];
        const normalized = raw.map((c, i) => ({ ...c, id: contextItemId(c, i + 1) }));
        const session = {
            sentContexts: { a: { sourceId: 'a', contentHash: 'h1', lastSentAt: new Date().toISOString(), messageIds: [], origin: 'auto' } }
        } as unknown as ChatSession<RecordOrUndef>;

        const filtered = await filterLLMContextItems(normalized, 'hello', session);

        expect(filtered.map((c) => c.id)).toEqual(['ctx-2']);
    });
});
