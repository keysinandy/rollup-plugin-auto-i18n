import { deleteObjPath, differenceWith, isPlainObjectEqual, mergeObject } from '../src/utils';

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
  test('should delete object by length 1 path', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: 1, b: 2 };
    const obj3 = { a: 1, b: 2, c: { d: 3 } };
    const obj4 = { a: 1, b: 2, c: { d: 3 } };
    const obj5 = { a: 1, b: 2, c: { d: 5 } };
    const obj6 = { a: 1, b: 2, c: { d: 3, e: 4 } };
    expect(isPlainObjectEqual(obj1, obj2)).toBe(true);
    expect(isPlainObjectEqual(obj3, obj4)).toBe(true);
    expect(isPlainObjectEqual(obj2, obj3)).toBe(false);
    expect(isPlainObjectEqual(obj3, obj5)).toBe(false);
    expect(isPlainObjectEqual(obj3, obj6)).toBe(false);
  });
});

describe('test for mergeObject', () => {
  test('merge empty object', () => {
    const obj1 = {};
    const obj2 = {};
    const obj3 = { a: 1 };
    const obj4 = { a: 1, b: { c: 1 } };
    expect(mergeObject(obj1, obj2)).toEqual(expect.objectContaining({}));
    expect(mergeObject(obj1, obj3)).toEqual(expect.objectContaining({ a: 1 }));
    expect(mergeObject(obj1, obj4)).toEqual(expect.objectContaining({ a: 1, b: { c: 1 } }));
  });
  test('merge object', () => {
    const obj1 = { a: 1, b: 2, d: 4 };
    const obj2 = { a: 1, b: 2, c: 3 };
    const obj3 = { a: 1, b: 2, c: { d: 3 } };
    expect(mergeObject(obj1, obj2)).toEqual(expect.objectContaining({ a: 1, b: 2, c: 3, d: 4 }));
    expect(mergeObject(obj1, obj3)).toEqual(expect.objectContaining({ a: 1, b: 2, c: { d: 3 }, d: 4 }));
  });
});

describe('test for differenceWith', () => {
  test('me', () => {
    const obj1 = ['a'];
    const obj2 = ['a'];
    const obj3 = ['b'];
    const obj4 = ['a', 'b'];
    const obj5 = ['a', 'b', 'c', 'd'];
    const obj6 = ['g', 'h', 'i'];
    const obj7 = ['d', 'f'];
    expect(differenceWith(obj1, obj2)).toEqual(expect.arrayContaining([]));
    expect(differenceWith(obj1, obj3)).toEqual(expect.arrayContaining(['a']));
    expect(differenceWith(obj1, obj4)).toEqual(expect.arrayContaining([]));
    expect(differenceWith(obj5, obj6)).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd']));
    expect(differenceWith(obj5, obj7)).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });
});
