declare module '@strudel/core';
declare module '@strudel/mini';
declare module '@strudel/tonal';
declare module '@strudel/webaudio';
declare module '@strudel/transpiler';

declare module 'escodegen' {
  interface GenerateOptions {
    format?: {
      indent?: { style?: string };
      quotes?: 'double' | 'single' | 'auto';
    };
  }
  export function generate(ast: unknown, options?: GenerateOptions): string;
}