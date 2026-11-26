// Tailwind CSS in an app's theme.css. A theme that imports "tailwindcss" (or uses @apply, @theme or @utility) is
// compiled when it is served: utilities for every class its cards use (layers, layout words, device roles in
// gallery.json, and the strings in theme.js), and @apply in its own rules. Tailwind's reset (preflight) is left out,
// so it can't undo the renderer's base styles, and the theme's colors become shadcn/ui's color tokens (bg-background,
// text-foreground, bg-primary text-primary-foreground, text-muted-foreground, border-border), worked out from its
// three variables, or taken from shadcn variables the theme sets itself (a palette pasted into :root).
import fs from 'node:fs';
import path from 'node:path';
import {STUDIO_DIR} from './project';

/** Whether theme.css asks for Tailwind. */
export const usesTailwind = (css: string): boolean => /@import\s+(url\()?["']tailwindcss|@apply\s|@theme\b|@utility\s/.test(css);

/**
 * What `@import "tailwindcss"` means in a theme: its tokens and utilities, no reset, and shadcn/ui's color tokens. Each
 * token reads the shadcn variable when the theme sets one (--primary, --muted-foreground…) and otherwise mixes it from
 * the studio's three (--paper, --ink, --accent). As in shadcn, `accent` and `muted` are quiet tints; the brand color is
 * `primary`. paper and ink are there too, by the studio's names. --accent and --muted already mean the brand color and
 * muted text in a theme, so the accent and muted tokens are always mixed, never read from them.
 */
const mix = (a: string, share: number, b: string) => `color-mix(in oklab, var(${a}) ${share}%, var(${b}))`;
const TOKENS: Record<string, string> = {
  background: 'var(--paper)',
  foreground: 'var(--ink)',
  card: mix('--ink', 4, '--paper'),
  'card-foreground': 'var(--ink)',
  popover: mix('--ink', 4, '--paper'),
  'popover-foreground': 'var(--ink)',
  primary: 'var(--accent)',
  'primary-foreground': 'var(--paper)',
  secondary: mix('--ink', 8, '--paper'),
  'secondary-foreground': 'var(--ink)',
  muted: mix('--ink', 6, '--paper'),
  'muted-foreground': `var(--muted, ${mix('--ink', 65, '--paper')})`,
  accent: mix('--accent', 16, '--paper'),
  'accent-foreground': 'var(--ink)',
  destructive: 'oklch(0.58 0.22 27)',
  border: mix('--ink', 14, '--paper'),
  input: mix('--ink', 14, '--paper'),
  ring: 'var(--accent)',
};
/** shadcn names the studio's own variables already use, with another meaning. */
const OWN = new Set(['accent', 'muted']);
const TAILWIND = `@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
@theme inline {
${Object.entries(TOKENS).map(([name, value]) => `  --color-${name}: ${OWN.has(name) ? value : `var(--${name}, ${value})`};`).join('\n')}
  --color-paper: var(--paper);
  --color-ink: var(--ink);
}
`;

/** Every class name a card can carry: layer classes, layout words and device roles in gallery.json, and theme.js's strings. */
export function candidates(listing: string): string[] {
  const found = new Set<string>();
  const add = (text: string) => { for (const word of text.split(/\s+/)) if (word) found.add(word); };
  const walk = (value: unknown, key = '') => {
    if (typeof value === 'string') { if (['class', 'layout', 'role'].includes(key)) add(value); }
    else if (Array.isArray(value)) value.forEach(item => walk(item, key));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  const gallery = path.join(listing, 'gallery.json');
  if (fs.existsSync(gallery)) { try { walk(JSON.parse(fs.readFileSync(gallery, 'utf8'))); } catch { /* check reports a broken gallery.json */ } }
  const script = path.join(listing, 'theme.js');
  if (fs.existsSync(script)) for (const [, text] of fs.readFileSync(script, 'utf8').matchAll(/["'`]([^"'`\n]*)["'`]/g)) add(text);
  return [...found];
}

const cache = new Map<string, {key: string; css: string}>();

/** theme.css as the renderer should see it: compiled through Tailwind when it asks for Tailwind, as it is otherwise. */
export async function compileTheme(file: string): Promise<string> {
  const css = fs.readFileSync(file, 'utf8');
  if (!usesTailwind(css)) return css;
  const listing = path.dirname(file);
  const classes = candidates(listing);
  const key = `${css}\0${classes.join(' ')}`;
  const hit = cache.get(file);
  if (hit?.key === key) return hit.css;
  const {compile} = await import('tailwindcss');
  const tailwindDir = path.dirname(require.resolve('tailwindcss/theme.css'));
  const compiler = await compile(css, {
    base: listing,
    async loadStylesheet(id, base) {
      if (id === 'tailwindcss') return {path: 'tailwindcss', base: tailwindDir, content: TAILWIND};
      if (id.startsWith('tailwindcss/')) {
        const sheet = path.join(tailwindDir, id.slice('tailwindcss/'.length));
        return {path: sheet, base: tailwindDir, content: fs.readFileSync(sheet, 'utf8')};
      }
      // The studio's own sheets (studio/layouts.css) are served from the package, not from the listing.
      const sheet = id.startsWith('studio/') ? path.join(STUDIO_DIR, id.slice('studio/'.length)) : path.resolve(base, id);
      if (!fs.existsSync(sheet)) throw new Error(`theme.css imports ${id}, which doesn't exist`);
      return {path: sheet, base: path.dirname(sheet), content: fs.readFileSync(sheet, 'utf8')};
    },
  });
  const built = compiler.build(classes);
  cache.set(file, {key, css: built});
  return built;
}
