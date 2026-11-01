// A small JSON Schema validator for the studio's own schemas (schemas/*.json), so checks run anywhere with no
// dependencies. It covers the subset those schemas use: type, properties, required, additionalProperties, items,
// enum, const, pattern, minimum/maximum, exclusiveMinimum, minItems, anyOf, allOf and local $ref.

export interface Schema {
  $ref?: string;
  $defs?: Record<string, Schema>;
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  enum?: unknown[];
  const?: unknown;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minItems?: number;
  anyOf?: Schema[];
  allOf?: Schema[];
  description?: string;
  [keyword: string]: unknown;
}

export interface SchemaError {
  /** Where in the document, as a JSON path: `phone[2].callouts[0].w`. */
  path: string;
  message: string;
}

const typeOf = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
const matchesType = (value: unknown, type: string) => {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
};
const join = (base: string, key: string | number) =>
  typeof key === 'number' ? `${base}[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? (base ? `${base}.${key}` : key) : `${base}[${JSON.stringify(key)}]`;
const show = (value: unknown) => JSON.stringify(value)?.slice(0, 60) ?? String(value);

/** Validate `value` against `schema`; an empty list means valid. */
export function validate(value: unknown, schema: Schema, root: Schema = schema, path = ''): SchemaError[] {
  if (schema.$ref) {
    const name = schema.$ref.replace(/^#\/\$defs\//, '');
    const target = root.$defs?.[name];
    if (!target) return [{path, message: `unknown schema reference ${schema.$ref}`}];
    return validate(value, target, root, path);
  }
  const errors: SchemaError[] = [];
  const add = (message: string, at = path) => errors.push({path: at || '(top level)', message});

  if (schema.allOf) for (const part of schema.allOf) errors.push(...validate(value, part, root, path));
  if (schema.anyOf) {
    const attempts = schema.anyOf.map(option => validate(value, option, root, path));
    if (!attempts.some(found => found.length === 0)) {
      // Report the alternative of the value's own type (an array where a list of cards is allowed, say), so the
      // message points at the real mistake instead of saying nothing matched.
      const sameType = schema.anyOf.map((option, i) => ({option, i})).filter(({option}) => {
        const resolved = option.$ref ? root.$defs?.[option.$ref.replace(/^#\/\$defs\//, '')] ?? option : option;
        const types = resolved.type ? (Array.isArray(resolved.type) ? resolved.type : [resolved.type]) : [];
        return types.some(type => matchesType(value, type));
      });
      if (sameType.length === 1) return [...errors, ...attempts[sameType[0].i]];
      const consts = schema.anyOf.filter(option => 'const' in option).map(option => show(option.const));
      add(`${show(value)} isn't an allowed value${consts.length ? ` (allowed values include ${consts.join(', ')})` : ''}`);
      return errors;
    }
  }
  if ('const' in schema && value !== schema.const) add(`must be ${show(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) add(`must be one of ${schema.enum.map(show).join(', ')}; got ${show(value)}`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(type => matchesType(value, type))) { add(`must be ${types.join(' or ')}, not ${typeOf(value)}`); return errors; }
  }
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) add(`${show(value)} doesn't match the expected format (${schema.pattern})`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) add(`must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) add(`must be at most ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) add(`must be more than ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) add(`needs at least ${schema.minItems} item(s)`);
    if (schema.items) value.forEach((item, i) => errors.push(...validate(item, schema.items!, root, join(path, i))));
  }
  if (typeOf(value) === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of schema.required || []) if (!(key in object)) add(`is missing "${key}"`);
    for (const [key, item] of Object.entries(object)) {
      const own = schema.properties?.[key];
      if (own) errors.push(...validate(item, own, root, join(path, key)));
      else if (schema.additionalProperties === false) {
        const known = Object.keys(schema.properties || {});
        const near = known.find(name => name.toLowerCase() === key.toLowerCase() || levenshtein(name, key) <= 2);
        add(`unknown setting "${key}"${near ? `; did you mean "${near}"?` : ''}`, join(path, key));
      } else if (typeof schema.additionalProperties === 'object') errors.push(...validate(item, schema.additionalProperties, root, join(path, key)));
    }
  }
  return errors;
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]++;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}
