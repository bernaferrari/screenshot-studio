// Tailwind CSS in an app's theme.css. A theme that imports "tailwindcss" (or uses @apply, @theme or @utility) is
// compiled when it is served: utilities for every class its cards use (layers, layout words, device roles in
// gallery.json, and the strings in theme.ts), and @apply in its own rules. Tailwind's reset (preflight) is left out,
// so it can't undo the renderer's base styles, and the colors are shadcn/ui's tokens, which every theme sets
// (bg-background, text-foreground, bg-primary text-primary-foreground, text-muted-foreground, border-border).
import fs from 'node:fs';
import path from 'node:path';
import {STUDIO_DIR, themeScript} from './project';

/** Whether theme.css asks for Tailwind. */
export const usesTailwind = (css: string): boolean => /@import\s+(url\()?["']tailwindcss|@apply\s|@theme\b|@utility\s/.test(css);

/** shadcn/ui's color tokens: theme.css sets them, and the renderer's studio.css fills in any it leaves out. */
const TOKENS = ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground', 'primary', 'primary-foreground',
  'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'border', 'input', 'ring'];

/** What `@import "tailwindcss"` means in a theme: its tokens and utilities, no reset, and shadcn/ui's colors. */
const TAILWIND = `@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
@theme inline {
${TOKENS.map(name => `  --color-${name}: var(--${name});`).join('\n')}
}
`;

/** Every class name a card can carry: layer classes, layout words and device roles in gallery.json, and the theme script's strings. */
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
  const script = themeScript(listing);
  if (script) for (const [, text] of fs.readFileSync(script, 'utf8').matchAll(/["'`]([^"'`\n]*)["'`]/g)) add(text);
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
