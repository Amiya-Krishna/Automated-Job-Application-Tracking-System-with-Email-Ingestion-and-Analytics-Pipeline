// Tiny TypeScript loader for tests: '@/x' alias + on-the-fly transpile (CRLF-safe, comments dropped).
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const stubs = {};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (stubs[request]) return stubs[request];
  if (request.startsWith('@/')) {
    const base = path.join(root, request.slice(2));
    for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(base + ext)) return base + ext;
  }
  return origResolve.call(this, request, ...rest);
};
require.extensions['.ts'] = function (module, filename) {
  const src = fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n');
  const out = ts.transpileModule(src, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, removeComments: true },
  });
  module._compile(out.outputText, filename);
};

/** Replace a module (by import specifier) with a stub file path for the duration of the process. */
function stub(specifier, file) {
  stubs[specifier] = file;
}
function loadTs(file) {
  delete require.cache[file];
  return require(file);
}
module.exports = { loadTs, stub, root };
