/** Shared CLI option parsing built on node:util parseArgs: supports --flag value and --flag=value, and rejects typos. */
import {parseArgs as nodeParseArgs} from 'node:util';

export type OptionSpec = {
  type: 'string' | 'boolean';
  short?: string;
  multiple?: boolean;
};

export type ParsedOptions<T extends Record<string, OptionSpec>> = {
  values: {
    [K in keyof T]: T[K]['multiple'] extends true
      ? (T[K]['type'] extends 'boolean' ? boolean : string)[] | undefined
      : (T[K]['type'] extends 'boolean' ? boolean : string) | undefined;
  };
  positionals: string[];
};

/** Parse command-line arguments strictly, turning Node's low-level parse errors into clear messages with usage. */
export function parseCli<T extends Record<string, OptionSpec>>(
  argv: string[],
  options: T,
  {allowPositionals = false, usage}: {allowPositionals?: boolean; usage?: string} = {},
): ParsedOptions<T> {
  try {
    const parsed = nodeParseArgs({
      args: argv,
      options,
      allowPositionals,
      strict: true,
    });
    return parsed as unknown as ParsedOptions<T>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(usage ? `${message}\n${usage}` : message);
  }
}

/** Parse an optional integer option (e.g. --port, --card, --jobs) with bounds validation. */
export function parseIntOption(value: string | undefined, name: string, {min, max}: {min?: number; max?: number} = {}): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!value.trim() || !Number.isInteger(parsed)) throw new Error(`${name} must be a whole number, not "${value}".`);
  if (min !== undefined && parsed < min) throw new Error(`${name} must be at least ${min}, not ${parsed}.`);
  if (max !== undefined && parsed > max) throw new Error(`${name} must be at most ${max}, not ${parsed}.`);
  return parsed;
}

/** Parse a comma-separated option into trimmed non-empty strings. */
export function parseListOption(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const items = value.split(',').map(item => item.trim()).filter(Boolean);
  return items.length ? items : undefined;
}
