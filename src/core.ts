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
const customProps = {};

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
            log(`不支持运行时变量：${path.getSource()}`);
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
          // console.log(nsSourceMap, ns, nsResources, 'nsResources', zhWord);
          if (enWord) {
            const nsWordValue = defaultLng === 'en' ? enWord : zhWord;
            // if (ns !== defaultNs) {
            //   nsWordValue = `${ns}:${defaultLng === 'en' ? enWord : zhWord}`;
            // }
            const newNode = t.cloneNode(node);
            if (t.isMemberExpression(newNode.callee) && t.isIdentifier(newNode.callee.property)) {
              newNode.callee.property.name = 't';
            }
            if (t.isStringLiteral(newNode.arguments[0])) {
              newNode.arguments = [t.stringLiteral(nsWordValue)];
            }
            path.replaceWith(newNode);
          } else if (process.env.NODE_ENV === 'production') {
            // 在生产模式下，不用自动翻译，找不到就报错
            throw new Error(`找不到对应翻译：${zhWord}`);
          } else {
            // 开发模式下，通知轮询器准备翻译
            const fileName = state.filename;
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

  // 如果翻译超时直接返回
  const translatedList = await Promise.race([timeoutPromise, Promise.allSettled(promises)]);
  if (translatedList === 'timeout') {
    log('翻译超时...下次修改文件后重试');
    return {};
  }

  const translatedWords: nsWord = {};
  // 将翻译结果集合到一个对象中
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

      const originalZhWord = get(invert(get(nsSourceMap, target?.ns)), enWord); // 潜在的翻译结果相同，本来已经存在的中文
      if (originalZhWord && originalZhWord !== zh) {
        // 存在且与当前不是同一个词
        enWord = `${enWord}__CONFLICT__`;
        log(`翻译结果与当前locale有冲突！翻译结果暂为：${enWord}，请手动处理冲突`);
      }
      translatedWords[zh] = enWord;
    });
  console.log(translatedWords, 'translatedWords');
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
    log(`翻译失败...${error}`);
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
    log(`翻译失败...${error}`);
    throw error;
  }
};
const filterInvalidWord = (enWord: string) => {
  return enWord.replace(/:/g, '&#58;');
};

const translateFile = async () => {
  log(fileList, waitingTranslatePool, 'waitingTranslatePool');
  if (fileList.length > 0 && waitingTranslatePool.length > 0) {
    log('开始翻译...');
    const fileListCp = [...fileList];
    const waitingTranslatePoolCp = [...waitingTranslatePool];
    fileList.length = 0;
    waitingTranslatePool.length = 0;
    const translatedWords = await doTranslate(waitingTranslatePoolCp);
    if (Object.keys(translatedWords).length > 0) {
      // 输出到locale资源文件
      await writeLocale(translatedWords, nsSourceMap, {
        localePath,
        ns,
        callTarget,
        customProps,
        defaultLng,
        defaultNs,
      });
      // 如果是删除了某个i18n.s 需要删除locale文件
      // 这里性能考虑暂时不去删除locale文件中不需要翻译，当下次有新的词需要翻译的时候就会自动删除
      nsSourceMap = prepareLocaleSource(localePath, defaultLng);
      eventHub.emit('onLocaleFileChange', nsSourceMap);
      fileListCp.forEach((filePath) => {
        // 为了强制刷新
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
  apiKey = options.apiKey;
  typeof options.lowerCaseFirstLetter === 'boolean' && (lowerCaseFirstLetter = options.lowerCaseFirstLetter);
  const result = await transformAsync(code, {
    plugins: [travelPlugin],
    filename: fileName,
  });
  return result?.code as string;
};

autoTranslate();
