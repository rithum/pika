import { MODEL_ID_TO_MODEL, MODELS } from '../../src/lib/model-types-utils';

describe('MODEL_ID_TO_MODEL', () => {
    it('includes all model IDs from MODELS', () => {
        const allModels = Object.values(MODELS)
            .map((provider) => Object.values(provider))
            .flat();
        for (const model of allModels) {
            expect(MODEL_ID_TO_MODEL[model.id]).toBeDefined();
        }
    });

    it('includes base model IDs (without us. prefix) for cross-region models', () => {
        const crossRegionModels = Object.values(MODELS)
            .map((provider) => Object.values(provider))
            .flat()
            .filter((m) => m.id.startsWith('us.'));

        expect(crossRegionModels.length).toBeGreaterThan(0);
        for (const model of crossRegionModels) {
            const baseId = model.id.replace(/^us\./, '');
            expect(MODEL_ID_TO_MODEL[baseId]).toBeDefined();
            expect(MODEL_ID_TO_MODEL[baseId].name).toBe(model.name);
        }
    });

    it('accepts anthropic.claude-sonnet-4-5-20250929-v1:0 (ES-2696 regression)', () => {
        expect(MODEL_ID_TO_MODEL['anthropic.claude-sonnet-4-5-20250929-v1:0']).toBeDefined();
    });

    it('still accepts the us. prefixed version', () => {
        expect(MODEL_ID_TO_MODEL['us.anthropic.claude-sonnet-4-5-20250929-v1:0']).toBeDefined();
    });

    it('does not create spurious aliases for models without us. prefix', () => {
        expect(MODEL_ID_TO_MODEL['anthropic.claude-3-haiku-20240307-v1:0']).toBeDefined();
        expect(MODEL_ID_TO_MODEL['us.anthropic.claude-3-haiku-20240307-v1:0']).toBeUndefined();
    });
});
