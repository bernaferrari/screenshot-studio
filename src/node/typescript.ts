// TypeScript an app writes (theme.ts), as the JavaScript a browser runs: Node's own type stripping, which removes
// annotations, `import type` and `satisfies` and leaves everything else where it was. Enums, namespaces and other
// syntax that needs transforming aren't supported; the error says so.
import module from 'node:module';

/** JavaScript from TypeScript source. Throws with the file's name when the source uses syntax that can't be stripped. */
export function stripTypes(source: string, file: string): string {
  const strip = (module as {stripTypeScriptTypes?: (code: string) => string}).stripTypeScriptTypes;
  if (!strip) throw new Error(`${file} is TypeScript, which needs Node 22.18 or later (this is ${process.version}).`);
  // Node marks stripTypeScriptTypes experimental and warns once per process; the warning isn't the user's to act on.
  const warn = process.emitWarning;
  process.emitWarning = (() => {}) as typeof process.emitWarning;
  try { return strip(source); }
  catch (error) { throw new Error(`${file}: ${(error as Error).message}. Themes are stripped of types, not compiled: use plain TypeScript (no enums or namespaces).`); }
  finally { process.emitWarning = warn; }
}
