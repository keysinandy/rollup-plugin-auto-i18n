import fs from 'fs';
import path from 'path';
import { language, nsMap, nsWord, Obj } from './types';

/**
 * 初始化资源，载入zh.json，将所有翻译资源准备成{ namespaceName: { "中文": "Chinese" } }的形式供运行时查找
 */
export const prepareLocaleSource = (localePath: string, defaultLng: language) => {
  const nsSourceMap: nsMap = {};
  const isEnDefault = defaultLng === 'en';
  const resource = fs.readFileSync(path.resolve(localePath, isEnDefault ? 'zh.json' : 'en.json'), {
    encoding: 'utf-8',
  });
  if (resource.length === 0) {
    return nsSourceMap;
  }
  const zhResource = JSON.parse(resource); // 不能用直接require因为要动态读
  Object.keys(zhResource).forEach((namespaceKey) => {
    // 当前namespace下所有翻译
    const namespaceWords: nsWord = zhResource[namespaceKey];
    let nsResources = namespaceWords;
    if (isEnDefault) {
      // 在英文为defaultLng的情况下
      // key-value 位置对换 变成 { '中文': 'Chinese' }的形式  前提假设在一个命名空间下，同一个中文只会对应一种英文
      nsResources = invert(namespaceWords)!;
    }

    nsSourceMap[namespaceKey] = nsResources;
  });
  return nsSourceMap;
};

const objectCtorString = Object.prototype.constructor.toString();

export const isPlainObject = (value: unknown): value is Obj => {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null) {
    return true;
  }
  const Ctor = Object.hasOwnProperty.call(proto, 'constructor') && proto.constructor;

  if (Ctor === Object) return true;

  return typeof Ctor == 'function' && Function.toString.call(Ctor) === objectCtorString;
};

const isObject = (value: unknown): value is Obj => {
  return Object.prototype.toString.call(value).slice(8, -1) === 'Object';
};

export const flattenObjectKeys = (obj: Obj, baseKeys?: string[]): string[][] => {
  const keys = baseKeys ?? [];
  return Object.keys(obj).reduce(function (acc: string[][], key) {
    const o =
      (isPlainObject(obj[key]) && Object.keys(obj[key]).length > 0) || (Array.isArray(obj[key]) && obj[key].length > 0)
        ? flattenObjectKeys(obj[key], keys.concat(key))
        : [keys.concat(key)];
    return acc.concat(o);
  }, []);
};

const unsetEmptyObject = (obj: Obj, newObj: Obj) => {
  Object.keys(obj).forEach(function (key) {
    if (isPlainObject(obj[key])) {
      return;
    }
    newObj[key] ?? (newObj[key] = {});
    unsetEmptyObject(obj[key], newObj[key]);

    if (isPlainObject(obj[key]) && Object.keys(obj[key]).length === 0) {
      delete newObj[key];
      return;
    }
    newObj[key] = obj[key];
  });
  return obj;
};

export const omitEmptyObject = (obj: Obj) => {
  return unsetEmptyObject(obj, {});
};

export const log = (...args: unknown[]) => {
  console.log('===== rollup-plugin-auto-i18n =====', ...args);
};

export const get = (target: unknown, property: unknown) => {
  if (!isObject(target)) return null;

  if (typeof property !== 'number' && typeof property !== 'string') {
    return target[Object.prototype.toString.call(property)];
  }
  return target[property];
};

export const invert = (obj: Record<string, string>) => {
  if (!isObject(obj)) return undefined;
  const o: Record<string, string> = {};
  Object.keys(obj).forEach((key) => {
    const v = obj[key];
    o[v] = key;
  });
  return o;
};

const isMatchObj = (target: unknown, obj: unknown) => {
  if (!isPlainObject(target) || !isPlainObject(obj)) return false;
  const keys = Object.keys(obj);
  return (
    keys.filter((key) => {
      return obj[key] === target[key];
    }).length === keys.length
  );
};

export const findObjInList = (list: Obj[], obj: Obj): null | Obj => {
  for (const value of list) {
    if (isMatchObj(value, obj)) {
      return value;
    }
  }
  return null;
};

export const differenceWith = <T>(
  baseArr: T[],
  targetArr: T[],
  isEqual: (a: T, b: T) => boolean = (a, b) => a === b,
): T[] => {
  const result: T[] = [];
  for (const targetVal of targetArr) {
    const isMatch = baseArr.some((baseVal) => isEqual(targetVal, baseVal));
    if (!isMatch) {
      result.push(targetVal);
    }
  }
  return result;
};

export const isStringArrayEqual = (arr1: string[], arr2: string[]) => {
  if (arr1.length !== arr2.length) return false;
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
};

export const deleteObjPath = (obj: Obj, path: string[]) => {
  let currentObj = obj;
  for (let i = 0; i < path.length; i++) {
    if (i === path.length - 1) {
      delete currentObj[path[i]];
      return;
    }
    const next = currentObj[path[i]];
    if (!isObject(next)) return;
    currentObj = currentObj[path[i]];
  }
};
export const isPlainObjectEqual = (obj1: Obj, obj2: Obj) => {
  // TODO: deal with  loop reference
  const compare = (o1: unknown, o2: unknown): boolean => {
    if (isPlainObject(o1) && isPlainObject(o2)) {
      const keys1 = Object.keys(o1);
      const keys2 = Object.keys(o2);
      if (keys1.length !== keys2.length) {
        return false;
      }
      return keys1.every((val, i) => {
        return compare(val, keys2[i]);
      });
    } else if (!isPlainObject(o1) && !isPlainObject(o2)) {
      return o1 === o2;
    } else {
      return false;
    }
  };
  return compare(obj1, obj2);
};
