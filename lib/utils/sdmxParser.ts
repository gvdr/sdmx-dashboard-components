// sdmx-json-parser ships today as a UMD/CommonJS bundle (module.exports =
// { SDMXParser }) and on newer builds as ESM with a named export. Node's
// CommonJS-to-ESM lexer does not detect the named export on the UMD bundle,
// so `import { SDMXParser }` throws in a plain Node ESM process (the case a
// server-rendered page hits before any bundler is involved). Resolving the
// class from the namespace covers every shape: the named export when present,
// otherwise the default interop object that carries module.exports.
// @ts-ignore - sdmx-json-parser publishes no type declarations
import * as parserModule from 'sdmx-json-parser';

const resolved: any =
    (parserModule as any).SDMXParser ??
    (parserModule as any).default?.SDMXParser ??
    (parserModule as any).default;

export const SDMXParser = resolved;
