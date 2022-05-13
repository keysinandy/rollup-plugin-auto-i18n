import { createFilter, FilterPattern } from '@rollup/pluginutils';
import { Plugin } from 'rollup';
import { extname } from 'path';
import { transformCode } from './core';
import { language, Obj } from './types';

export interface Options {
  localePath: string;
  apiKey: string;
  timeout?: number;
  include?: FilterPattern;
  exclude?: FilterPattern;
  extensions?: string[];
  callTarget?: string;
  ns?: string[];
  defaultNs?: string;
  defaultLng?: language;
  lowerCaseFirstLetter?: boolean;
  customProps?: Obj;
}
function autoI18n(options: Options): Plugin {
  const { include, exclude, extensions = ['.js', '.ts', '.jsx', '.tsx'] } = options;

  const filter = createFilter(include, exclude);
  return {
    name: 'rollup-plugin-auto-i18n',
    async transform(code, id) {
      if (!filter(id) || !extensions.includes(extname(id))) return;
      const result = await transformCode(code, options, id);
      return {
        code: result,
        map: null,
      };
    },
  };
}

export default autoI18n;
