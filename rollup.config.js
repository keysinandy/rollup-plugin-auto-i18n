import path from 'path';
import typescript from '@rollup/plugin-typescript';
import pkg from './package.json';
import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

const resolveFile = function (filePath) {
  return path.join(__dirname, '.', filePath);
};
const babelOptions = {
  presets: ['@babel/preset-env'],
  babelHelpers: 'runtime',
  plugins: ['@babel/plugin-transform-runtime'],
};

module.exports = [
  {
    input: resolveFile('src/index.ts'),
    output: [
      {
        file: pkg.main,
        format: 'cjs',
        exports: 'named',
      },
      {
        file: pkg.module,
        format: 'es',
      },
    ],
    plugins: [json(), typescript({ include: 'src/**/*.{ts,js}', module: 'esnext' }), commonjs(), babel(babelOptions)],
    external: Object.keys(pkg.dependencies),
  },
];
