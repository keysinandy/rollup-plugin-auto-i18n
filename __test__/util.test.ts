import { deleteObjPath, isPlainObjectEqual } from '../src/utils';

describe('test for deleteObjPath', () => {
  test('should not delete object by empty path', () => {
    const obj = { a: 1 };
    deleteObjPath(obj, []);
    expect({ a: 1 }).toEqual(expect.objectContaining(obj));
  });
  test('should not delete object by length 1 path', () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 1, b: 2 };
    deleteObjPath(obj1, ['a']);
    deleteObjPath(obj2, ['a']);
    expect({}).toEqual(expect.objectContaining(obj1));
    expect({ b: 2 }).toEqual(expect.objectContaining(obj1));
  });
  test('should not delete object by more than 1 path', () => {
    const obj1 = {
      a: {
        b: { c: 1 },
      },
    };
    const obj2 = {
      b: { c: 1 },
      d: {
        e: 2,
      },
    };
    deleteObjPath(obj1, ['a', 'b', 'c']);
    deleteObjPath(obj2, ['d', 'e']);
    expect({ a: { b: {} } }).toEqual(expect.objectContaining(obj1));
    expect({ b: { c: 1 }, d: {} }).toEqual(expect.objectContaining(obj2));
  });
});

describe('test for isPlainObjectEqual', () => {
  test('should not delete object by empty path', () => {
    const obj1 = {};
    const obj2 = {};
    const obj3 = { a: 1 };

    expect(isPlainObjectEqual(obj1, obj2)).toBe(true);
    expect(isPlainObjectEqual(obj1, obj3)).toBe(false);
  });
  test('should not delete object by length 1 path', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: 1, b: 2 };
    const obj3 = { a: 1, b: 2, c: { d: 3 } };
    const obj4 = { a: 1, b: 2, c: { d: 3 } };
    expect(isPlainObjectEqual(obj1, obj2)).toBe(true);
    expect(isPlainObjectEqual(obj3, obj4)).toBe(true);
    expect(isPlainObjectEqual(obj2, obj3)).toBe(false);
  });
});
