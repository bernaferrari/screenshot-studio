// Generates schemas/*.schema.json, the JSON Schemas `check` and editors use, from the types in src/core/types.d.ts.
// The types are the source: descriptions come from their comments, rules from tags like @pattern and @minimum.
//   node scripts/schemas.mjs           write schemas/
//   node scripts/schemas.mjs --check   fail if schemas/ doesn't match the types
import fs from 'node:fs';
import path from 'node:path';
import {createGenerator} from 'ts-json-schema-generator';

const root = path.resolve(import.meta.dirname, '..');
const SCHEMAS = {
  studio: {type: 'StudioConfig', title: 'Screenshot Studio settings (store-listing/studio.json)'},
  gallery: {type: 'Galleries', title: 'Screenshot Studio cards (store-listing/gallery.json)'},
  profiles: {type: 'Profiles', title: "Screenshot Studio galleries' sizes (store-listing/profiles.json)"},
  copy: {type: 'Copy', title: 'Screenshot Studio words (store-listing/<locale>/copy.json)'},
};

const generator = createGenerator({
  path: path.join(root, 'src/core/types.d.ts'),
  tsconfig: path.join(root, 'tsconfig.json'),
  expose: 'export',
  topRef: false,
  jsDoc: 'extended',
  sortProps: false,
  skipTypeCheck: true,
  // Rules the types can't say: a capture block open to other settings, an install needing an APK or an app,
  // whole-number card indexes.
  extraTags: ['additionalProperties', 'anyOf', 'items'],
});

/** One schema file's text. */
function schema(name, {type, title}) {
  const {definitions, $schema: _draft, description, ...body} = generator.createSchema(type);
  return JSON.stringify(tidy({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://github.com/bernaferrari/screenshot-studio/schemas/${name}.schema.json`,
    title,
    description,
    ...body,
    // Files may name their schema, for editor autocomplete.
    properties: {$schema: {type: 'string'}, ...body.properties},
    $defs: definitions,
  }), null, 2).replaceAll('"#/definitions/', '"#/$defs/') + '\n';
}

/** Spells the generator's output the way the studio's validator reads it. */
function tidy(value) {
  if (Array.isArray(value)) return value.map(tidy);
  if (!value || typeof value !== 'object') return value;
  const out = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, tidy(item)]));
  // An index signature of unknown allows anything.
  if (isEmpty(out.additionalProperties)) out.additionalProperties = true;
  // A constant needs no type; without one, the validator lists it among the allowed values.
  if ('const' in out) delete out.type;
  // An optional field's undefined (`{"not": {}}`) never matches a JSON value.
  if (out.anyOf) {
    out.anyOf = out.anyOf.filter(option => !(Object.keys(option).length === 1 && isEmpty(option.not)));
    if (out.anyOf.length === 1) Object.assign(out, out.anyOf.pop());
    if (!out.anyOf.length) delete out.anyOf;
  }
  return out;
}
const isEmpty = value => !!value && typeof value === 'object' && !Object.keys(value).length;

const stale = [];
for (const [name, options] of Object.entries(SCHEMAS)) {
  const file = path.join(root, 'schemas', `${name}.schema.json`);
  const text = schema(name, options);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) stale.push(path.relative(root, file));
  } else fs.writeFileSync(file, text);
}
if (stale.length) {
  console.error(`${stale.join(', ')} ${stale.length > 1 ? "don't" : "doesn't"} match src/core/types.d.ts. Run \`npm run schemas\`.`);
  process.exit(1);
}
