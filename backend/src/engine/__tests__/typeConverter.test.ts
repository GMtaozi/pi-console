import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TypeConverter } from '../TypeConverter';

describe('TypeConverter 7x6 matrix (V1-6)', () => {
  describe('string conversions', () => {
    it('string -> string', () => {
      assert.strictEqual(TypeConverter.convert('hello', 'string', 'string'), 'hello');
    });
    it('string -> number (valid)', () => {
      assert.strictEqual(TypeConverter.convert('42', 'string', 'number'), 42);
    });
    it('string -> number (NaN -> 0)', () => {
      assert.strictEqual(TypeConverter.convert('not-a-number', 'string', 'number'), 0);
    });
    it('string -> boolean', () => {
      assert.strictEqual(TypeConverter.convert('true', 'string', 'boolean'), true);
      assert.strictEqual(TypeConverter.convert('false', 'string', 'boolean'), false);
      assert.strictEqual(TypeConverter.convert('1', 'string', 'boolean'), true);
      assert.strictEqual(TypeConverter.convert('0', 'string', 'boolean'), false);
    });
    it('string -> json', () => {
      assert.deepStrictEqual(TypeConverter.convert('{"a":1}', 'string', 'json'), { a: 1 });
    });
    it('string -> array', () => {
      assert.deepStrictEqual(TypeConverter.convert('hello', 'string', 'array'), ['hello']);
    });
  });

  describe('number conversions', () => {
    it('number -> string', () => {
      assert.strictEqual(TypeConverter.convert(42, 'number', 'string'), '42');
    });
    it('number -> boolean', () => {
      assert.strictEqual(TypeConverter.convert(1, 'number', 'boolean'), true);
      assert.strictEqual(TypeConverter.convert(0, 'number', 'boolean'), false);
    });
    it('number -> json', () => {
      assert.strictEqual(TypeConverter.convert(42, 'number', 'json'), 42);
    });
    it('number -> array', () => {
      assert.deepStrictEqual(TypeConverter.convert(42, 'number', 'array'), [42]);
    });
  });

  describe('boolean conversions', () => {
    it('boolean -> string', () => {
      assert.strictEqual(TypeConverter.convert(true, 'boolean', 'string'), 'true');
      assert.strictEqual(TypeConverter.convert(false, 'boolean', 'string'), 'false');
    });
    it('boolean -> number', () => {
      assert.strictEqual(TypeConverter.convert(true, 'boolean', 'number'), 1);
      assert.strictEqual(TypeConverter.convert(false, 'boolean', 'number'), 0);
    });
    it('boolean -> array', () => {
      assert.deepStrictEqual(TypeConverter.convert(true, 'boolean', 'array'), [true]);
    });
  });

  describe('json conversions', () => {
    it('json -> string', () => {
      assert.strictEqual(TypeConverter.convert({ a: 1 }, 'json', 'string'), '{"a":1}');
    });
    it('json -> number (object key count)', () => {
      assert.strictEqual(TypeConverter.convert({ a: 1, b: 2 }, 'json', 'number'), 2);
    });
    it('json -> boolean (empty object = false)', () => {
      assert.strictEqual(TypeConverter.convert({}, 'json', 'boolean'), false);
      assert.strictEqual(TypeConverter.convert({ a: 1 }, 'json', 'boolean'), true);
    });
    it('json -> array (Object.values)', () => {
      assert.deepStrictEqual(TypeConverter.convert({ a: 1, b: 2 }, 'json', 'array'), [1, 2]);
    });
  });

  describe('null conversions', () => {
    it('null -> string', () => {
      assert.strictEqual(TypeConverter.convert(null, 'null', 'string'), '');
    });
    it('null -> number', () => {
      assert.strictEqual(TypeConverter.convert(null, 'null', 'number'), 0);
    });
    it('null -> boolean', () => {
      assert.strictEqual(TypeConverter.convert(null, 'null', 'boolean'), false);
    });
    it('null -> array', () => {
      assert.deepStrictEqual(TypeConverter.convert(null, 'null', 'array'), []);
    });
  });

  describe('inferType', () => {
    it('infers correct types', () => {
      assert.strictEqual(TypeConverter.inferType('hello'), 'string');
      assert.strictEqual(TypeConverter.inferType(42), 'number');
      assert.strictEqual(TypeConverter.inferType(true), 'boolean');
      assert.strictEqual(TypeConverter.inferType({ a: 1 }), 'json');
      assert.strictEqual(TypeConverter.inferType([1, 2]), 'array');
      assert.strictEqual(TypeConverter.inferType(null), 'null');
    });
  });

  describe('isCompatible', () => {
    it('same types are compatible', () => {
      assert.strictEqual(TypeConverter.isCompatible('string', 'string'), true);
    });
    it('any is compatible with everything', () => {
      assert.strictEqual(TypeConverter.isCompatible('string', 'any'), true);
      assert.strictEqual(TypeConverter.isCompatible('any', 'number'), true);
    });
    it('null is compatible with everything', () => {
      assert.strictEqual(TypeConverter.isCompatible('null', 'string'), true);
    });
  });
});
