import { transformAsync, PluginItem } from '@babel/core';
import t from '@babel/types';
import { Options } from './index';
import { prepareLocaleSource } from './utils';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import translate from 'translate';
import freeTranslate from '@vitalets/google-translate-api';
import fs from 'fs';
import { writeLocale } from './writeLocale';
import { language, nsMap, nsWord, WaitingTranslate } from './types';
import EventEmitter from 'events';
import { log, get, invert, findObjInList } from './utils';

const fileList: string[] = [];
const waitingTranslatePool: WaitingTranslate[] = [];
const eventHub = new EventEmitter();
const registerEvent = () => {
  eventHub.on('requireTranslate', (params) => {
    const { zhWord, ns, fileName } = params;
    if (!findObjInList(waitingTranslatePool, { zhWord, ns })) {
      waitingTranslatePool.push({ ns, zhWord });
    }
    if (!fileList.includes(fileName)) {
      fileList.push(fileName);
    }
  });
  eventHub.on('onLocaleFileChange', (sm) => {
    nsSourceMap = sm;
  });
};
registerEvent();
const paths = [`${process.cwd()}${'/**/*.{js,jsx,ts,tsx}'}`];
const ZH_PROPERTY_NAME = 's';
let translateTimeout = 5000;
let ns: string[] = ['default'];
let nsSourceMap: nsMap;
let defaultNs: string;
let callTarget = 'i18n';
let defaultLng: language = 'en';
let tid: NodeJS.Timeout;
let apiKey = '';
let lowerCaseFirstLetter = true;
let localePath: string;
let customProps = {};
let scannerPath = paths;

const travelPlugin: PluginItem = {
  visitor: {
    CallExpression(path, state) {
      const node = path.node;
      const { callee } = node;
      if (t.isMemberExpression(callee)) {
        if (
          t.isIdentifier(callee.object) &&
          callee.object.name === callTarget &&
          t.isIdentifier(callee.property) &&
          callee.property.name === ZH_PROPERTY_NAME
        ) {
          const argNodes = node.arguments;
          const isInvalid = argNodes.some((n) => !t.isStringLiteral(n));
          if (isInvalid) {
            log(`???????????????????????????${path.getSource()}`);
            return;
          }
          const params = argNodes.map((n) => (n as t.StringLiteral).value);
          const zhWord = params[0];
          if (!zhWord) {
            return node;
          }
          const ns = params[1] || defaultNs;
          const nsResources = nsSourceMap[ns] || {};
          const enWord = nsResources[zhWord];
          if (enWord) {
            let nsWordValue = defaultLng === 'en' ? enWord : zhWord;
            if (ns !== defaultNs) {
              nsWordValue = `${ns}:${defaultLng === 'en' ? enWord : zhWord}`;
            }
            const newNode = t.cloneNode(node);
            if (t.isMemberExpression(newNode.callee) && t.isIdentifier(newNode.callee.property)) {
              newNode.callee.property.name = 't';
            }
            if (t.isStringLiteral(newNode.arguments[0])) {
              newNode.arguments = [t.stringLiteral(nsWordValue)];
            }
            path.replaceWith(newNode);
          } else if (process.env.NODE_ENV === 'production') {
            // ????????????????????????????????????????????????????????????
            throw new Error(`????????????????????????${zhWord}`);
          } else {
            // ?????????????????????????????????????????????
            const fileName = state.filename;
            log('requireTranslate', zhWord);
            eventHub.emit('requireTranslate', { zhWord, ns, fileName });
          }
        }
      }
    },
  },
};
const doTranslate = async (waitingTranslateList: WaitingTranslate[]) => {
  const toTransSet = new Set<string>();
  waitingTranslateList.forEach(({ zhWord }) => toTransSet.add(zhWord));
  const toTransList = Array.from(toTransSet);

  const promises = toTransList.map(async (word) => {
    let result;
    if (apiKey) {
      result = await translateCall(word);
    } else {
      result = await freeTranslateCall(word);
    }
    return result;
  });
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      resolve('timeout');
    }, translateTimeout);
  });

  // ??????????????????????????????
  const translatedList = await Promise.race([timeoutPromise, Promise.allSettled(promises)]);
  if (translatedList === 'timeout') {
    log('????????????...???????????????????????????');
    return {};
  }

  const translatedWords: nsWord = {};
  // ???????????????????????????????????????
  (translatedList as any[])
    .filter((item) => item.status === 'fulfilled')
    .forEach(({ value }) => {
      const { zh, en } = value;
      let enWord = en;
      if (lowerCaseFirstLetter) {
        const [first, ...rest] = en;
        enWord = filterInvalidWord(`${first.toLowerCase()}${rest.join('')}`);
      }
      const target = findObjInList(waitingTranslateList, { zhWord: zh });

      const originalZhWord = get(invert(get(nsSourceMap, target?.ns)), enWord); // ?????????????????????????????????????????????????????????
      if (originalZhWord && originalZhWord !== zh) {
        // ????????????????????????????????????
        enWord = `${enWord}__CONFLICT__`;
        log(`?????????????????????locale?????????????????????????????????${enWord}????????????????????????`);
      }
      translatedWords[zh] = enWord;
    });
  return translatedWords;
};
const translateCall = async (word: string) => {
  try {
    const result = await translate(word, {
      from: 'zh',
      to: 'en',
      engine: 'google',
      key: apiKey,
    });
    return { zh: word, en: result };
  } catch (error) {
    log(`????????????...${error}`);
    throw error;
  }
};
const freeTranslateCall = async (word: string) => {
  try {
    const result = await freeTranslate(word, {
      tld: 'cn',
      to: 'en',
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      client: 'gtx',
    });
    return { zh: word, en: result.text };
  } catch (error) {
    log(`????????????...${error}`);
    throw error;
  }
};
const filterInvalidWord = (enWord: string) => {
  return enWord.replace(/:/g, '&#58;');
};

const translateFile = async () => {
  if (fileList.length > 0 && waitingTranslatePool.length > 0) {
    log('????????????...');
    const fileListCp = [...fileList];
    const waitingTranslatePoolCp = [...waitingTranslatePool];
    fileList.length = 0;
    waitingTranslatePool.length = 0;
    const translatedWords = await doTranslate(waitingTranslatePoolCp);
    if (Object.keys(translatedWords).length > 0) {
      // ?????????locale????????????
      await writeLocale(translatedWords, nsSourceMap, {
        localePath,
        ns,
        callTarget,
        customProps,
        defaultLng,
        defaultNs,
        scannerPath,
      });
      // ????????????????????????i18n.s ????????????locale??????
      // ????????????????????????????????????locale???????????????????????????????????????????????????????????????????????????????????????
      nsSourceMap = prepareLocaleSource(localePath, defaultLng);
      eventHub.emit('onLocaleFileChange', nsSourceMap);
      fileListCp.forEach((filePath) => {
        // ??????????????????
        const content = fs.readFileSync(filePath, { encoding: 'utf-8' });
        fs.writeFile(filePath, content, () => {
          void 0;
        });
      });
    }
  }
};

const autoTranslate = () => {
  clearTimeout(tid);
  if (process.env.NODE_ENV !== 'production') {
    tid = setTimeout(async () => {
      translateFile();
      autoTranslate();
    }, translateTimeout);
  }
};

export const transformCode = async (code: string, options: Options, fileName: string) => {
  options.ns?.length && (ns = options.ns);
  defaultNs = options.defaultNs || ns[0];
  defaultLng = options?.defaultLng ?? 'en';
  localePath = options.localePath;
  options.timeout && (translateTimeout = options.timeout);
  nsSourceMap = prepareLocaleSource(localePath, defaultLng);
  options?.callTarget && (callTarget = options?.callTarget);
  options?.customProps && (customProps = options?.customProps);
  apiKey = options.apiKey;
  options?.scannerPath && (scannerPath = options.scannerPath);
  typeof options.lowerCaseFirstLetter === 'boolean' && (lowerCaseFirstLetter = options.lowerCaseFirstLetter);
  const result = await transformAsync(code, {
    plugins: [travelPlugin],
    filename: fileName,
  });
  return result?.code as string;
};

autoTranslate();
