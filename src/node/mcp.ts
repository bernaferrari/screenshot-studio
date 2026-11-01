/**
 * Screenshot Studio as an MCP server, so an agent can make and check store art the way a person would: look at the
 * listing, check it, render cards, and look at the images. Speaks MCP over stdio (JSON-RPC 2.0, newline-delimited),
 * with no dependencies.
 *   npx screenshot-studio mcp            # in an app; or pass --listing path/to/app
 * Add it to Claude Code: claude mcp add screenshot-studio -- npx screenshot-studio mcp
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {checkListing, formatIssues} from './check';
import {exportListing} from './export';
import {findListing, loadListing, readCopy} from './project';
import {cardsFor, devicesFor, outputFile} from '../core/gallery';

const PROTOCOL = '2025-06-18';

interface Tool {
  name: string;
  description: string;
  inputSchema: {type: 'object'; properties: Record<string, unknown>; required?: string[]};
  call(args: Record<string, unknown>): Promise<Content[]>;
}
type Content = {type: 'text'; text: string} | {type: 'image'; data: string; mimeType: string};

const text = (value: unknown): Content => ({type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2)});
const listingArg = {listing: {type: 'string', description: 'The app folder or its store-listing folder. Defaults to the one the server was started in.'}};

export function createTools(defaultListing?: string): Tool[] {
  const where = (args: Record<string, unknown>) => {
    const found = findListing(typeof args.listing === 'string' ? args.listing : defaultListing);
    if (!found) throw new Error('No store-listing/studio.json found. Run `npx screenshot-studio init` in the app first, or pass "listing".');
    return found;
  };
  return [
    {
      name: 'describe_listing',
      description: 'What the listing contains: galleries and their sizes, every card (feature, layout, captures, headline in the default language, output file), languages and the theme files. Start here.',
      inputSchema: {type: 'object', properties: listingArg},
      async call(args) {
        const listing = where(args);
        const {config, profiles, galleries, defaultLocale, locales} = loadListing(listing);
        const copy = readCopy(listing, defaultLocale);
        return [text({
          listing, app: config.app, defaultLocale, locales,
          files: {theme: ['theme.css', 'theme.js'].filter(f => fs.existsSync(path.join(listing, f))), gallery: 'gallery.json', copy: `${defaultLocale}/copy.json`},
          galleries: Object.fromEntries(Object.keys(galleries).map(kind => [kind, {
            size: `${profiles[kind].width}×${profiles[kind].height}`, frame: profiles[kind].frame, defaultLocaleOnly: !!profiles[kind].defaultLocaleOnly,
            cards: cardsFor(galleries, kind).map((card, index) => ({
              index, feature: card.feature, layout: card.layout, captures: devicesFor(card).map(d => d.raw),
              title: (copy[`${kind}/${card.feature}`] || copy[card.feature])?.title, output: `${defaultLocale}/${outputFile(kind, card, index)}`,
            })),
          }])),
        })];
      },
    },
    {
      name: 'check',
      description: 'Check every file without rendering: schemas, missing or wrong-shaped captures, missing words, store text over limits. Fast; run it after each edit. Returns issues with a fix for each.',
      inputSchema: {type: 'object', properties: listingArg},
      async call(args) {
        const result = checkListing(where(args));
        return [text(formatIssues(result)), text({ok: result.ok, issues: result.issues})];
      },
    },
    {
      name: 'render_card',
      description: 'Render one card and return the image, so you can see it. Also returns the renderer\'s notes (copy shrunk to fit, borrowed captures) or why it failed (copy that doesn\'t fit, a device out of bounds). Use it to iterate on theme.css, gallery.json or copy.json.',
      inputSchema: {type: 'object', properties: {
        ...listingArg,
        gallery: {type: 'string', description: 'The gallery, e.g. phone, tablet7, tablet10, readme.'},
        card: {type: 'integer', description: 'The card\'s index in the gallery (0-based).'},
        locale: {type: 'string', description: 'The language (default: the default language).'},
      }, required: ['gallery', 'card']},
      async call(args) {
        const listing = where(args);
        const {defaultLocale} = loadListing(listing);
        const locale = typeof args.locale === 'string' ? args.locale : defaultLocale;
        const result = await exportListing({listing, locales: [locale], kind: String(args.gallery), card: Number(args.card), log: () => {}});
        if (!result.ok || !result.cards.length) return [text(`Render failed: ${result.error || 'no such card'}`)];
        const card = result.cards[0];
        return [image(path.join(listing, card.file), 1400), text({file: card.file, notes: card.notes, warnings: result.warnings})];
      },
    },
    {
      name: 'export',
      description: 'Render and check every card (optionally one language or gallery) and write the images. Returns every file written, notes per card, and warnings such as seams that break between cards or images no card writes any more.',
      inputSchema: {type: 'object', properties: {
        ...listingArg,
        locale: {type: 'string', description: 'Only this language.'},
        gallery: {type: 'string', description: 'Only this gallery.'},
        strict: {type: 'boolean', description: 'Fail on warnings and untranslated words.'},
      }},
      async call(args) {
        const result = await exportListing({listing: where(args), locales: typeof args.locale === 'string' ? [args.locale] : undefined,
          kind: typeof args.gallery === 'string' ? args.gallery : undefined, strict: !!args.strict, log: () => {}});
        return [text(result)];
      },
    },
    {
      name: 'view_image',
      description: 'Look at an image in the listing: an exported card, a contact sheet (contact-phone.jpg shows the whole strip, to judge it as a set), or a raw capture. The path is relative to the store-listing folder.',
      inputSchema: {type: 'object', properties: {...listingArg, file: {type: 'string', description: 'e.g. en-US/contact-phone.jpg or en-US/raw/phone/01-home.png'}}, required: ['file']},
      async call(args) {
        const listing = where(args);
        const file = path.resolve(listing, String(args.file));
        if (!file.startsWith(listing + path.sep)) throw new Error('The file must be inside the store-listing folder.');
        if (!fs.existsSync(file)) throw new Error(`${args.file} doesn't exist. Export first, or check the path with describe_listing.`);
        return [image(file, 1600)];
      },
    },
  ];
}

/** An image as MCP content, scaled down on macOS when it's large so it stays within an agent's image limits. */
function image(file: string, maxSide: number): Content {
  let data = fs.readFileSync(file);
  let mimeType = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  if (process.platform === 'darwin' && data.length > 600_000) {
    const scaled = path.join(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'studio-mcp-')), 'image.jpg');
    try {
      require('node:child_process').execFileSync('sips', ['-Z', String(maxSide), '-s', 'format', 'jpeg', file, '--out', scaled], {stdio: 'ignore'});
      data = fs.readFileSync(scaled);
      mimeType = 'image/jpeg';
    } catch { /* send the original */ }
    fs.rmSync(path.dirname(scaled), {recursive: true, force: true});
  }
  return {type: 'image', data: data.toString('base64'), mimeType};
}

interface Request {jsonrpc: '2.0'; id?: number | string | null; method: string; params?: Record<string, unknown>}

/** `mcp [--listing path]`: serve until stdin closes. */
export async function run(argv: string[]): Promise<number> {
  const at = argv.indexOf('--listing');
  const tools = createTools(at >= 0 ? argv[at + 1] : undefined);
  const send = (message: unknown) => process.stdout.write(JSON.stringify(message) + '\n');
  const version = (() => { try { return fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim(); } catch { return '1.0'; } })();
  // Anything a command prints must not corrupt the protocol stream.
  console.log = (...parts: unknown[]) => process.stderr.write(parts.join(' ') + '\n');
  const input = readline.createInterface({input: process.stdin});
  for await (const line of input) {
    if (!line.trim()) continue;
    let request: Request;
    try { request = JSON.parse(line); } catch { send({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}}); continue; }
    const reply = (result: unknown) => request.id !== undefined && send({jsonrpc: '2.0', id: request.id, result});
    const fail = (code: number, message: string) => request.id !== undefined && send({jsonrpc: '2.0', id: request.id, error: {code, message}});
    switch (request.method) {
      case 'initialize':
        reply({protocolVersion: PROTOCOL, capabilities: {tools: {}}, serverInfo: {name: 'screenshot-studio', version},
          instructions: 'Make and check app store screenshots from real app captures. Start with describe_listing, edit theme.css / gallery.json / <locale>/copy.json, then check, render_card to see a card, and view_image en-US/contact-phone.jpg after export to judge the whole strip.'});
        break;
      case 'notifications/initialized': case 'notifications/cancelled': break;
      case 'ping': reply({}); break;
      case 'tools/list': reply({tools: tools.map(({name, description, inputSchema}) => ({name, description, inputSchema}))}); break;
      case 'tools/call': {
        const tool = tools.find(t => t.name === request.params?.name);
        if (!tool) { fail(-32602, `Unknown tool ${String(request.params?.name)}`); break; }
        try { reply({content: await tool.call((request.params?.arguments as Record<string, unknown>) || {})}); }
        catch (error) { reply({content: [text((error as Error).message)], isError: true}); }
        break;
      }
      default: fail(-32601, `Method not found: ${request.method}`);
    }
  }
  return 0;
}
