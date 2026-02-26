import {
    objectEqualsOrderIndependent,
    sanitizeOptionalModelField
} from '../../src/lib/chat-admin-utils';

describe('sanitizeOptionalModelField', () => {
    it('returns undefined for undefined (no change on update; omit on create)', () => {
        expect(sanitizeOptionalModelField(undefined)).toBeUndefined();
    });

    it('returns null for null (explicit remove)', () => {
        expect(sanitizeOptionalModelField(null)).toBeNull();
    });

    it('returns undefined for empty string (no-op on update; omit on create)', () => {
        expect(sanitizeOptionalModelField('')).toBeUndefined();
    });

    it('returns undefined for whitespace-only string', () => {
        expect(sanitizeOptionalModelField('   ')).toBeUndefined();
        expect(sanitizeOptionalModelField('\t\n')).toBeUndefined();
    });

    it('returns trimmed string for non-empty string', () => {
        expect(sanitizeOptionalModelField('  us.anthropic.claude-3-5-sonnet-20241022-v2:0  ')).toBe(
            'us.anthropic.claude-3-5-sonnet-20241022-v2:0'
        );
        expect(sanitizeOptionalModelField('anthropic.claude-3-haiku-20240307-v1:0')).toBe(
            'anthropic.claude-3-haiku-20240307-v1:0'
        );
    });
});

describe('objectEqualsOrderIndependent', () => {
    it('returns true for same reference', () => {
        const o = { a: 1 };
        expect(objectEqualsOrderIndependent(o, o)).toBe(true);
    });

    it('returns true for identical primitives', () => {
        expect(objectEqualsOrderIndependent(1, 1)).toBe(true);
        expect(objectEqualsOrderIndependent('x', 'x')).toBe(true);
        expect(objectEqualsOrderIndependent(null, null)).toBe(true);
    });

    it('returns false for different primitives', () => {
        expect(objectEqualsOrderIndependent(1, 2)).toBe(false);
        expect(objectEqualsOrderIndependent(null, undefined)).toBe(false);
    });

    it('returns true for objects with same keys and values in different order', () => {
        expect(
            objectEqualsOrderIndependent({ a: 1, b: 2 }, { b: 2, a: 1 })
        ).toBe(true);
        expect(
            objectEqualsOrderIndependent({ custom: { x: 1, y: 2 } }, { custom: { y: 2, x: 1 } })
        ).toBe(true);
    });

    it('returns false for objects with different values', () => {
        expect(objectEqualsOrderIndependent({ a: 1 }, { a: 2 })).toBe(false);
        expect(objectEqualsOrderIndependent({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    });

    it('returns false for objects with different keys', () => {
        expect(objectEqualsOrderIndependent({ a: 1 }, { b: 1 })).toBe(false);
    });
});
