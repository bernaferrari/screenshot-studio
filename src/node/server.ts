/**
 * The local Screenshot Studio server. It serves an app's files, and the studio itself (renderer, editor, theme helpers)
 * at the app's store-listing/studio/ address, so an app keeps no copy of the studio: a theme's
 * `import … from './studio/shapes.js'` and the renderer's `../theme.js` both resolve. With a workspace it also serves
 * the project overview and /p/<id>/ mounts for every connected project.
 *   npx screenshot-studio studio [port] [--add /path/to/app]… [--registry projects.json] [--open]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inside, createWorkspaceStore} from './workspace/store';
import {findListing, STUDIO_DIR} from './project';
import type {WorkspaceStore} from './workspace/store';
import {workspaceRoutes} from './workspace/routes';
import type {ServeFileOptions, WorkspaceHandler} from './workspace/routes';

export interface ServeOptions {
  /** Whether gallery.json and copy.json under the root may be written. */
  editable?: boolean;
  /** Adds the project overview and /p/<id>/ mounts for every registered project. */
  workspace?: WorkspaceStore | null;
  activeProjectId?: string | null;
  selectFolder?: () => Promise<string | null>;
}

const types: Record<string, string> = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.ttc': 'font/collection'};
function writable(file: string, listingRoot: string): boolean {
  const relative = path.relative(listingRoot, file).split(path.sep);
  return (relative.length === 1 && relative[0] === 'gallery.json') ||
    (relative.length === 2 && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(relative[0]) && relative[1] === 'copy.json');
}
export function serve(root: string, port = 0, {editable = false, workspace = null, activeProjectId = null, selectFolder}: ServeOptions = {}): Promise<http.Server> {
  root = path.resolve(root);
  // The listing whose gallery.json and copy.json may be written: root itself, or its store-listing/.
  const listing = fs.existsSync(path.join(root, 'studio.json')) ? root : path.join(root, 'store-listing');
  const hub: WorkspaceHandler | null = workspace ? workspaceRoutes({store: workspace, uiDirectory: STUDIO_DIR, activeProjectId, selectFolder}) : null;
  /** `/<listing>/studio/<rest>` for any folder under root that holds a studio.json: the studio's own <rest>. */
  const studioFile = (pathname: string): string | null => {
    const match = pathname.match(/^(.*?)\/studio(\/.*)?$/);
    if (!match) return null;
    const folder = path.resolve(root, `.${match[1] || '/'}`);
    return inside(root, folder) && fs.existsSync(path.join(folder, 'studio.json')) ? match[2] || '/' : null;
  };
  const server = http.createServer(async (request, response) => {
    async function serveFile(allowedRoot: string, url: string, {editable: canWrite = editable, listingRoot = listing}: ServeFileOptions = {}): Promise<void> {
      allowedRoot = path.resolve(allowedRoot);
      let file = path.resolve(allowedRoot, `.${url}`);
      if (!inside(allowedRoot, file)) { response.writeHead(403).end(); return; }
      try {
        if (fs.existsSync(file) && !inside(fs.realpathSync(allowedRoot), fs.realpathSync(file))) { response.writeHead(403).end(); return; }
        if (request.method === 'PUT') {
          if (!canWrite || !writable(file, listingRoot)) { response.writeHead(403).end('Not writable'); return; }
          const host = request.headers.host || '';
          if (request.headers.origin && request.headers.origin !== `http://${host}`) { response.writeHead(403).end('Use the local studio'); return; }
          // New locale folders may not exist yet, so check their nearest existing parent too.
          let parent = path.dirname(file);
          while (!fs.existsSync(parent)) parent = path.dirname(parent);
          if (!inside(fs.realpathSync(allowedRoot), fs.realpathSync(parent))) { response.writeHead(403).end(); return; }
          let body = '', bytes = 0;
          for await (const chunk of request as AsyncIterable<Buffer>) { bytes += chunk.length; if (bytes > 1024 * 1024) { response.writeHead(413).end('Copy file is too large'); return; } body += chunk; }
          const value: unknown = JSON.parse(body);
          const expected = request.headers['x-studio-base'];
          const current = JSON.stringify(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {});
          if (expected !== undefined && expected !== createHash('sha256').update(current).digest('hex')) {
            response.writeHead(409, {'Content-Type': 'application/json'}).end(JSON.stringify({error: 'The saved copy changed. Reload to resolve your draft.'})); return;
          }
          fs.mkdirSync(path.dirname(file), {recursive: true});
          fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
          response.writeHead(204).end(); return;
        }
        if (!['GET', 'HEAD'].includes(request.method || '')) { response.writeHead(405).end(); return; }
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
        if (fs.existsSync(file) && !inside(fs.realpathSync(allowedRoot), fs.realpathSync(file))) { response.writeHead(403).end(); return; }
        const data = await fs.promises.readFile(file);
        response.writeHead(200, {'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store'});
        response.end(request.method === 'HEAD' ? undefined : data);
      } catch (error) {
        const failure = error as {code?: string; message?: string};
        response.writeHead(failure.code === 'ENOENT' ? 404 : request.method === 'PUT' ? 400 : 500).end(failure.code === 'ENOENT' ? 'Not found' : failure.message);
      }
    }
    try {
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host || '')) { response.writeHead(403).end('Use the local Studio address'); return; }
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://local').pathname);
      if (hub && await hub(request, response, pathname, serveFile)) return;
      const own = studioFile(pathname);
      if (own !== null) await serveFile(STUDIO_DIR, own, {editable: false});
      else await serveFile(root, pathname);
    } catch (error) { if (!response.headersSent) response.writeHead(400).end((error as Error).message); }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

/**
 * `studio [port] [--add /path/to/app]… [--registry projects.json] [--open]`: the editor. Inside an app it connects that
 * app; from the studio itself it opens the workspace of every connected project. Keeps running until stopped.
 */
export async function run(argv: string[]): Promise<number> {
  const value = (flag: string): string | undefined => { const index = argv.indexOf(flag); return index < 0 ? undefined : argv[index + 1]; };
  const port = Number(value('--port') || (argv[0] && !argv[0].startsWith('--') ? argv[0] : 8790));
  const workspace = createWorkspaceStore({registryFile: value('--registry')});
  const listing = findListing();
  const app = listing !== null;
  const root = listing ? path.dirname(listing) : path.dirname(STUDIO_DIR);
  let activeProjectId: string | null = null;
  if (app) activeProjectId = (await workspace.add([root]))[0].id;
  for (let index = 0; index < argv.length; index++) if (argv[index] === '--add') await workspace.add([argv[++index]]);
  await serve(root, port, {editable: true, workspace, activeProjectId});
  const url = listing ? `http://127.0.0.1:${port}/${path.relative(root, listing).split(path.sep).join('/')}/studio/` : `http://127.0.0.1:${port}/studio/`;
  console.log(`Screenshot Studio: ${url}`);
  if (argv.includes('--open')) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
    (await import('node:child_process')).spawn(opener, [url], {detached: true, stdio: 'ignore'}).unref();
  }
  return 0;
}
