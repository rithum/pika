import { areSame } from '../src/lib/same';

describe('areSame', () => {
  // --- Scalar Values ---
  describe('Scalar Values', () => {
    it('should return true for identical numbers', () => {
      expect(areSame(1, 1)).toBe(true);
    });
    it('should return false for different numbers', () => {
      expect(areSame(1, 2)).toBe(false);
    });
    it('should return false for a number and a string representation', () => {
      expect(areSame(1, '1')).toBe(false);
    });
    it('should return true for identical strings', () => {
      expect(areSame('hello', 'hello')).toBe(true);
    });
    it('should return false for different strings', () => {
      expect(areSame('hello', 'world')).toBe(false);
    });
    it('should return true for NaN === NaN', () => {
      expect(areSame(NaN, NaN)).toBe(true);
    });
    it('should return false for a number and NaN', () => {
      expect(areSame(1, NaN)).toBe(false);
    });
    it('should return true for 0 and -0', () => {
      expect(areSame(0, -0)).toBe(true);
      expect(areSame(-0, 0)).toBe(true);
    });
    it('should return true for identical booleans (true)', () => {
      expect(areSame(true, true)).toBe(true);
    });
    it('should return true for identical booleans (false)', () => {
      expect(areSame(false, false)).toBe(true);
    });
    it('should return false for different booleans', () => {
      expect(areSame(true, false)).toBe(false);
    });
    it('should return true for null === null', () => {
      expect(areSame(null, null)).toBe(true);
    });
    it('should return true for undefined === undefined', () => {
      expect(areSame(undefined, undefined)).toBe(true);
    });
    it('should return false for null and undefined', () => {
      expect(areSame(null, undefined)).toBe(false);
    });
    it('should return false for null and 0', () => {
      expect(areSame(null, 0)).toBe(false);
    });
    it('should return false for undefined and empty string', () => {
      expect(areSame(undefined, '')).toBe(false);
    });
  });

  // --- Objects ---
  describe('Objects', () => {
    it('should return true for empty objects', () => {
      expect(areSame({}, {})).toBe(true);
    });
    it('should return true for identical simple objects', () => {
      expect(areSame({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    });
    it('should return true for simple objects with different key order', () => {
      expect(areSame({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    });
    it('should return false for objects with a different value for a key', () => {
      expect(areSame({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    });
    it('should return false if one object has an extra key', () => {
      expect(areSame({ a: 1, b: 2, c: 3 }, { a: 1, b: 2 })).toBe(false);
    });
    it('should return false if the other object has an extra key', () => {
      expect(areSame({ a: 1, b: 2 }, { a: 1, b: 2, c: 3 })).toBe(false);
    });
    it('should return false for objects with different keys', () => {
      expect(areSame({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
    });
    it('should return true for identical nested objects', () => {
      expect(areSame({ a: 1, b: { c: 3 } }, { a: 1, b: { c: 3 } })).toBe(true);
    });
    it('should return false for different nested objects', () => {
      expect(areSame({ a: 1, b: { c: 3 } }, { a: 1, b: { c: 4 } })).toBe(false);
    });
    it('should return true for objects with null values', () => {
      expect(areSame({ a: null }, { a: null })).toBe(true);
    });
    it('should return false for an object with a null value and one with a different value', () => {
      expect(areSame({ a: null }, { a: 1 })).toBe(false);
    });
    it('should return true for objects with undefined values', () => {
      expect(areSame({ a: undefined }, { a: undefined })).toBe(true);
    });
    it('should return false when one object has an explicit undefined property and the other misses it', () => {
      expect(areSame({ a: undefined, b: 1 }, { b: 1 })).toBe(false);
    });
    it('should distinguish between a missing property and a property with value undefined', () => {
        const obj1 = { foo: undefined };
        const obj2 = {};
        expect(areSame(obj1, obj2)).toBe(false);
    });
    it('should handle objects with Date objects (same)', () => {
        const date = new Date();
        expect(areSame({d: date}, {d: new Date(date.getTime())})).toBe(true);
    });
    it('should handle objects with Date objects (different)', () => {
        expect(areSame({d: new Date()}, {d: new Date(Date.now() + 1000)})).toBe(false);
    });
    it('should handle objects with RegExp objects (same)', () => {
        expect(areSame({r: /abc/gi}, {r: new RegExp('abc', 'gi')})).toBe(true);
    });
    it('should handle objects with RegExp objects (different pattern)', () => {
        expect(areSame({r: /abc/gi}, {r: /def/gi})).toBe(false);
    });
    it('should handle objects with RegExp objects (different flags)', () => {
        expect(areSame({r: /abc/gi}, {r: /abc/g})).toBe(false);
    });
  });

  // --- Arrays (Order-Agnostic) ---
  describe('Arrays (Order-Agnostic)', () => {
    it('should return true for empty arrays', () => {
      expect(areSame([], [])).toBe(true);
    });
    it('should return true for identical arrays (same order)', () => {
      expect(areSame([1, 2, 3], [1, 2, 3])).toBe(true);
    });
    it('should return true for arrays with same elements in different order', () => {
      expect(areSame([1, 2, 3], [3, 1, 2])).toBe(true);
      expect(areSame(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
    });
    it('should return false for arrays of different lengths', () => {
      expect(areSame([1, 2], [1, 2, 3])).toBe(false);
      expect(areSame([1, 2, 3], [1, 2])).toBe(false);
    });
    it('should return false for arrays with different elements', () => {
      expect(areSame([1, 2, 3], [1, 2, 4])).toBe(false);
    });
    it('should return true for arrays with duplicate elements (same, different order)', () => {
      expect(areSame([1, 2, 2, 3], [2, 3, 1, 2])).toBe(true);
    });
    it('should return false for arrays with duplicate elements but different counts', () => {
      expect(areSame([1, 1, 2], [1, 2, 2])).toBe(false);
    });
    it('should return true for arrays of objects (same, different order)', () => {
      const obj1 = { id: 1, name: 'foo' };
      const obj2 = { id: 2, name: 'bar' };
      expect(areSame([obj1, obj2], [obj2, obj1])).toBe(true);
    });
    it('should return false for arrays of objects where one object differs', () => {
      const obj1 = { id: 1, name: 'foo' };
      const obj2 = { id: 2, name: 'bar' };
      const obj3 = { id: 2, name: 'baz' };
      expect(areSame([obj1, obj2], [obj1, obj3])).toBe(false);
    });
    it('should return true for arrays of nested arrays (same, order-agnostic for inner and outer)', () => {
      expect(areSame([[1, 2], [3, 4]], [[4, 3], [2, 1]])).toBe(true);
    });
    it('should return false for arrays of nested arrays where an inner array differs', () => {
      expect(areSame([[1, 2], [3, 4]], [[1, 2], [3, 5]])).toBe(false);
    });
    it('should return true for arrays with mixed primitive types (same, different order)', () => {
      expect(areSame([1, 'a', true, null, undefined], [undefined, 'a', null, 1, true])).toBe(true);
    });
     it('should handle arrays containing NaN correctly', () => {
      expect(areSame([1, NaN, 2], [NaN, 2, 1])).toBe(true);
      expect(areSame([1, NaN], [1, 1])).toBe(false);
    });
  });

  // --- Mixed Types ---
  describe('Mixed Types', () => {
    it('should return false for an object and an array', () => {
      expect(areSame({ a: 1 }, [1])).toBe(false);
      expect(areSame([1], { a: 1 })).toBe(false);
    });
    it('should return false for a scalar and an object', () => {
      expect(areSame(1, { a: 1 })).toBe(false);
    });
    it('should return false for a scalar and an array', () => {
      expect(areSame(1, [1])).toBe(false);
    });
    it('should return false for null and an empty object', () => {
      expect(areSame(null, {})).toBe(false);
    });
    it('should return false for undefined and an empty array', () => {
      expect(areSame(undefined, [])).toBe(false);
    });
  });

  // --- Circular References ---
  describe('Circular References', () => {
    it('should return true for two identical simple circular objects', () => {
      const circObj1: any = { name: 'obj1' };
      circObj1.self = circObj1;
      const circObj2: any = { name: 'obj1' };
      circObj2.self = circObj2;
      expect(areSame(circObj1, circObj2)).toBe(true);
    });

    it('should return false for two different circular objects', () => {
      const circObj1: any = { name: 'obj1' };
      circObj1.self = circObj1;
      const circObj3: any = { name: 'obj3' }; // Different name
      circObj3.self = circObj3;
      expect(areSame(circObj1, circObj3)).toBe(false);
    });

    it('should return true for two identical simple circular arrays', () => {
      const circArr1: any[] = [];
      circArr1.push(circArr1);
      const circArr2: any[] = [];
      circArr2.push(circArr2);
      expect(areSame(circArr1, circArr2)).toBe(true);
    });

    it('should return false for two different circular arrays', () => {
      const circArr1: any[] = [];
      circArr1.push(circArr1);
      const circArr3: any[] = [1]; // Different content before cycle
      circArr3.push(circArr3);
      expect(areSame(circArr1, circArr3)).toBe(false);
    });

    it('should return true for identical arrays containing circular objects (order-agnostic)', () => {
      const objA: any = { type: 'A' };
      objA.link = objA;
      const objB: any = { type: 'B' };
      objB.link = objB;
      const arr1 = [objA, objB];
      const arr2 = [objB, objA];
      expect(areSame(arr1, arr2)).toBe(true);
    });
    
    it('should return false for different arrays containing circular objects', () => {
      const objA: any = { type: 'A' };
      objA.link = objA;
      const objB: any = { type: 'B' };
      objB.link = objB;
      const objC: any = { type: 'C' }; // Different object
      objC.link = objC;
      const arr1 = [objA, objB];
      const arr2 = [objA, objC];
      expect(areSame(arr1, arr2)).toBe(false);
    });

    it('should return true for objects containing identical circular arrays', () => {
      const cArr1: any[] = [1];
      cArr1.push(cArr1);
      const cArr2: any[] = [1];
      cArr2.push(cArr2);
      const obj1 = { item: cArr1 };
      const obj2 = { item: cArr2 };
      expect(areSame(obj1, obj2)).toBe(true);
    });

    it('should return false for objects containing different circular arrays', () => {
      const cArr1: any[] = [1];
      cArr1.push(cArr1);
      const cArr3: any[] = [2]; // Different content
      cArr3.push(cArr3);
      const obj1 = { item: cArr1 };
      const obj3 = { item: cArr3 };
      expect(areSame(obj1, obj3)).toBe(false);
    });
    
    it('should compare complex structures with mutual circular references (identical)', () => {
        const a: any = { name: 'a' };
        const b: any = { name: 'b' };
        a.b = b;
        b.a = a;

        const x: any = { name: 'a' };
        const y: any = { name: 'b' };
        x.b = y;
        y.a = x;
        expect(areSame(a, x)).toBe(true);
    });

    it('should compare complex structures with mutual circular references (different)', () => {
        const a: any = { name: 'a' };
        const b: any = { name: 'b' };
        a.b = b;
        b.a = a;

        const x: any = { name: 'a' };
        const y: any = { name: 'c' }; // y is different
        x.b = y;
        y.a = x;
        expect(areSame(a, x)).toBe(false);
    });
  });
});