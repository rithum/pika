import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_VERIFICATION_MODEL, MODEL_ID_TO_MODEL, MODELS } from '../../src/lib/model-types-utils';

describe('default models', () => {
    it('DEFAULT_ANTHROPIC_MODEL is resolvable in the model registry', () => {
        expect(MODEL_ID_TO_MODEL[DEFAULT_ANTHROPIC_MODEL]).toBeDefined();
    });

    it('defaults to Claude Sonnet 5.5', () => {
        expect(DEFAULT_ANTHROPIC_MODEL).toBe('us.anthropic.claude-sonnet-5-5');
    });

    it('DEFAULT_VERIFICATION_MODEL is resolvable in the model registry', () => {
        expect(MODEL_ID_TO_MODEL[DEFAULT_VERIFICATION_MODEL]).toBeDefined();
    });
});

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

    it('accepts the Sonnet 5 inference profile', () => {
        expect(MODEL_ID_TO_MODEL['us.anthropic.claude-sonnet-5']).toBeDefined();
    });

    it('accepts the Sonnet 5.5 inference profile', () => {
        expect(MODEL_ID_TO_MODEL['us.anthropic.claude-sonnet-5-5']).toBeDefined();
    });

    it('does not create spurious aliases for models without us. prefix', () => {
        expect(MODEL_ID_TO_MODEL['anthropic.claude-3-haiku-20240307-v1:0']).toBeDefined();
        expect(MODEL_ID_TO_MODEL['us.anthropic.claude-3-haiku-20240307-v1:0']).toBeUndefined();
    });
});

describe('Anthropic invoke bodies', () => {
    const args = { temperature: 0.5, topP: 0.9, topK: 5, maxTokens: 10, messages: [] } as any;

    it('sends no sampling params for 5.x models', () => {
        const body: any = MODELS.ANTHROPIC.Claude5_5Sonnet.argsConstructor!(args);
        expect(body).not.toHaveProperty('temperature');
        expect(body).not.toHaveProperty('top_p');
        expect(body).not.toHaveProperty('top_k');
        expect(body.max_tokens).toBe(10);
    });

    it('keeps temperature and drops top_p for Haiku 4.5', () => {
        const body: any = MODELS.ANTHROPIC.Claude4_5Haiku.argsConstructor!(args);
        expect(body.temperature).toBe(0.5);
        expect(body).not.toHaveProperty('top_p');
    });
});

describe('legacy registry entries', () => {
    it.each([
        'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'us.anthropic.claude-sonnet-4-20250514-v1:0',
        'us.anthropic.claude-opus-4-1-20250805-v1:0'
    ])('still resolves %s', (id) => {
        expect(MODEL_ID_TO_MODEL[id]).toBeDefined();
    });
});
