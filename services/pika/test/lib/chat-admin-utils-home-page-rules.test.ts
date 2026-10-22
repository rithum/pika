import { handleArrayFieldUpdate } from '../../src/lib/chat-admin-utils';

type Rule = { userTypes?: string[]; chatAppUserTypes?: string[] };
type Fields = { homePageFilterRules: Rule[]; userRoles: string[] };

function run<K extends keyof Fields>(newValue: Fields[K] | null | undefined, existing: Fields[K] | undefined, field: K) {
    const fieldsToUpdate: Partial<Fields> = {};
    const fieldsToRemove: K[] = [];
    handleArrayFieldUpdate<Fields, K>(newValue, existing, field, fieldsToUpdate, fieldsToRemove, true);
    return { fieldsToUpdate, fieldsToRemove };
}

describe('handleArrayFieldUpdate homePageFilterRules', () => {
    it('queues no update for deep-equal rules held in distinct arrays and objects', () => {
        const existing: Rule[] = [{ userTypes: ['internal-user'], chatAppUserTypes: ['external-user'] }];
        const incoming: Rule[] = [{ userTypes: ['internal-user'], chatAppUserTypes: ['external-user'] }];

        const { fieldsToUpdate, fieldsToRemove } = run(incoming, existing, 'homePageFilterRules');

        expect(fieldsToUpdate).toEqual({});
        expect(fieldsToRemove).toEqual([]);
    });

    it('queues one update when a rule changes', () => {
        const existing: Rule[] = [{ userTypes: ['internal-user'] }];
        const incoming: Rule[] = [{ userTypes: ['external-user'] }];

        const { fieldsToUpdate } = run(incoming, existing, 'homePageFilterRules');

        expect(fieldsToUpdate).toEqual({ homePageFilterRules: incoming });
    });

    it('queues an update when a rule is added', () => {
        const existing: Rule[] = [{ userTypes: ['internal-user'] }];
        const incoming: Rule[] = [{ userTypes: ['internal-user'] }, { userTypes: ['external-user'] }];

        const { fieldsToUpdate } = run(incoming, existing, 'homePageFilterRules');

        expect(fieldsToUpdate).toEqual({ homePageFilterRules: incoming });
    });

    it('keeps order-independent comparison for string arrays', () => {
        expect(run(['b', 'a'], ['a', 'b'], 'userRoles').fieldsToUpdate).toEqual({});
        expect(run(['a', 'c'], ['a', 'b'], 'userRoles').fieldsToUpdate).toEqual({ userRoles: ['a', 'c'] });
    });
});
