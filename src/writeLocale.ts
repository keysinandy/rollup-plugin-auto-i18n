// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import scanner from 'i18next-scanner';
import { language, nsMap, nsWord, Obj } from './types';
import vfs from 'vinyl-fs';
import fs from 'fs';

import {
  flattenObjectKeys,
  isStringArrayEqual,
  log,
  omitEmptyObject,
  invert,
  differenceWith,
  deleteObjPath,
  isPlainObjectEqual,
} from './utils';

let zhSource: nsWord = {};
let nsSourceMap: nsMap = {};
let localePath = '';
let targetVariable: string;
let defaultLng: language;
let defaultNs: string;
let defaultNotTransValue: string;

// See options at https://github.com/i18next/i18next-scanner#options
const getOptions = (ns: string[], customProps: Obj) => {
  const { defaultValue } = customProps || {};
  defaultNotTransValue = defaultValue || '__NOT_TRANSLATED__';
  return {
    removeUnusedKeys: true,
    sort: true,
    func: {
      // 此配置不能改变
      list: ['i18next.t', 'i18n.t'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    defaultValue: defaultNotTransValue,
    resource: {
      jsonIndent: 2,
      lineEnding: '\n',
    },
    ...customProps,
    lngs: ['en', 'zh'], // 此配置不能改变
    ns,
    defaultLng,
    trans: false,
    keySeparator: false, // key separator if working with a flat json, it's recommended to set keySeparator to false
    nsSeparator: ':', // namespace separator 此配置不能改变
    defaultNs,
  };
};

function sortObject(unordered: Obj) {
  const ordered: Obj = {};
  Object.keys(unordered)
    .sort()
    .forEach((key) => {
      ordered[key] = typeof unordered[key] === 'object' ? sortObject(unordered[key]) : unordered[key];
    });
  return ordered;
}

function customFlush(this: any, done: () => void) {
  const { resStore } = this.parser;
  const { resource, removeUnusedKeys, sort, defaultValue } = this.parser.options;

  for (let index = 0; index < Object.keys(resStore).length; index++) {
    const lng = Object.keys(resStore)[index];
    const namespaces = resStore[lng]; // 所有被抠出来的英文key，对应的都是__not_translated，需要跟后面的source合并
    // 未翻译的英文的value和key保持一致
    if (lng === defaultLng) {
      Object.keys(namespaces).forEach((_ns) => {
        const obj = namespaces[_ns];
        Object.keys(obj).forEach((k) => {
          if (obj[k] === defaultValue) {
            obj[k] = k.replace('&#58;', ':'); // 转义冒号，免得和分割符冲突
          }
        });
      });
    }

    const oldContentBuffer = fs.readFileSync(lng === 'en' ? `${localePath}/en.json` : `${localePath}/zh.json`, {
      encoding: 'utf-8',
    });
    let oldContent = oldContentBuffer.length === 0 ? {} : JSON.parse(oldContentBuffer);

    // 移除废弃的key
    if (removeUnusedKeys) {
      const namespaceKeys = flattenObjectKeys(namespaces);
      const oldContentKeys = flattenObjectKeys(oldContent);
      const unusedKeys = differenceWith(oldContentKeys, namespaceKeys, isStringArrayEqual);
      for (let i = 0; i < unusedKeys.length; ++i) {
        deleteObjPath(oldContent, unusedKeys[i]);
      }
      oldContent = omitEmptyObject(oldContent);
    }
    console.log(namespaces, oldContent, 'namespaces oldContent');
    // 合并旧的内容
    let output = Object.assign({}, namespaces, oldContent);
    if (sort) {
      output = sortObject(output);
    }

    // 已有翻译就替换
    if (lng !== defaultLng) {
      const enToZhWords = defaultLng === 'en' ? invert(zhSource) : zhSource;
      Object.keys(output).forEach((_ns) => {
        const obj = output[_ns];
        Object.keys(obj).forEach((k) => {
          if (obj[k] === defaultValue) {
            const zh = enToZhWords![k] || enToZhWords![`${_ns}:${k}`];
            if (zh) {
              obj[k] = zh;
            }
          }
        });
      });
    }
    if (isPlainObjectEqual(oldContent, output) && index + 1 === Object.keys(resStore).length) {
      log('locale内容无改动...');
      done();
      return;
    }
    fs.writeFileSync(
      lng === 'en' ? `${localePath}/en.json` : `${localePath}/zh.json`,
      JSON.stringify(output, null, resource.jsonIndent),
      'utf8',
    );
  }
  log('完成写入locale文件...');

  done();
}

function customTransform(
  this: any,
  file: { path: string },
  enc: {
    encoding?: null | undefined;
    flag?: string | undefined;
  },
  done: () => void,
) {
  const { parser } = this;
  const content = fs.readFileSync(file.path, enc);

  parser.parseFuncFromString(
    content,
    { list: [`${targetVariable}.s`] },
    (zhWord: string, defaultValue: { defaultValue: string }) => {
      // 所有i18n.s，都要扣出来
      const namespace = defaultValue.defaultValue || defaultNs;
      const nsResource = nsSourceMap[namespace]; // 老的资源
      const enValue = zhSource[zhWord] || nsResource[zhWord];
      if (enValue) {
        // enValue 存在说明这个中文的翻译存在于老的资源或者这次翻译的结果， 否则这就是一段被注释的代码， 不需要加入
        const keyWord = defaultLng === 'en' ? enValue : zhWord;
        parser.set(namespace ? `${namespace}:${keyWord}` : keyWord, defaultNotTransValue);
      }
    },
  );
  done();
}

const FILE_EXTENSION = '/**/*.{js,jsx,ts,tsx}';

interface LocaleOPtions {
  localePath: string;
  ns: string[];
  callTarget: string;
  defaultLng: language;
  defaultNs: string;
  customProps: Obj;
}

export const writeLocale = async (translatedSource: nsWord, sourceMap: nsMap, options: LocaleOPtions) => {
  const { localePath: sourcePath, ns, callTarget: tv, customProps, defaultLng: dl, defaultNs: dn } = options;
  targetVariable = tv;
  const paths = [`${process.cwd()}${FILE_EXTENSION}`];

  zhSource = translatedSource || {};
  localePath = sourcePath || '';
  nsSourceMap = sourceMap;
  defaultLng = dl;
  defaultNs = dn;
  const promise = new Promise((resolve) => {
    vfs
      .src(paths)
      .pipe(scanner(getOptions(ns, customProps), customTransform, customFlush))
      .pipe(vfs.dest('./'))
      .on('end', () => {
        resolve(1);
      });
  });
  await promise;
};
