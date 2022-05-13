export interface WaitingTranslate {
  ns: string;
  zhWord: string;
}

export type language = 'zh' | 'en';

export type nsWord = Record<string, string>;
export type nsMap = Record<string, nsWord>;

export interface Obj {
  [prop: string]: any;
}
