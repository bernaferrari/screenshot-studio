/**
 * Live reload: one recursive watcher per project's store-listing/, shared by every editor tab that listens, and a
 * Server-Sent Events stream that tells those tabs which files changed. Edits arrive in bursts (an agent rewriting
 * theme.css, an exporter writing a language), so changes are collected for a moment and sent together.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {IncomingMessage, ServerResponse} from 'node:http';

/** What the editor receives: changed paths relative to store-listing/, with forward slashes. */
export interface ListingChange {
  files: string[];
}

const IMAGE = /\.(png|jpe?g|webp)$/i;
/** Locale folders hold copy, captures (raw/) and exports; exports are images anywhere else in the folder. */
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/**
 * Whether a change matters to the editor. The studio copy (studio/) and export outputs (rendered cards, contact
 * sheets, README strips) are written by the studio itself; the exporter's manifests (assets.json,
 * export-report.json) still count, so export notes refresh when an export finishes.
 */
export function relevantChange(file: string): boolean {
  const parts = file.split('/');
  const name = parts.at(-1) || '';
  if (!name || parts[0] === 'studio' || parts.some(part => part.startsWith('.') || part === 'node_modules')) return false;
  if (/(~|\.tmp|\.swp|\.crdownload)$/i.test(name)) return false;
  if (IMAGE.test(name)) return !(LOCALE.test(parts[0]) && parts[1] !== 'raw');
  return true;
}

/**
 * The files an event stands for. Usually the event names a file. But when the file system is busy, macOS coalesces
 * changes and names only the folder they happened in, or nothing at all; then every relevant file in that folder (the
 * whole listing, for no name) modified at or after `since` (ms) is a change.
 */
export function changedFiles(listing: string, name: string | null, since: number): string[] {
  const file = name ? String(name).split(path.sep).join('/') : '';
  let stat: fs.Stats | null = null;
  try { stat = fs.statSync(path.join(listing, file)); } catch { /* Removed: that is a change. */ }
  if (file && !stat?.isDirectory()) return relevantChange(file) ? [file] : [];
  const found: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(path.join(listing, dir), {withFileTypes: true}); } catch { return; }
    for (const entry of entries) {
      const relative = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (relevantChange(`${relative}/x`)) walk(relative); continue; }
      if (!relevantChange(relative)) continue;
      try { if (fs.statSync(path.join(listing, relative)).mtimeMs >= since) found.push(relative); } catch { /* Gone already. */ }
    }
  };
  walk(file);
  return found;
}

type Listener = (change: ListingChange) => void;
interface Watch {
  listeners: Set<Listener>;
  close(): void;
}
/**
 * When to rescan the whole listing after a watcher starts, in ms. macOS starts a recursive watcher asynchronously, so
 * a change made in its first moments can go unreported; these rescans catch it without writing anything to the app.
 */
const STARTUP_RESCANS = [150, 500, 1200, 2500];
const watches = new Map<string, Watch>();

/**
 * Call `listener` with the files that changed under `listing`, `delay` ms after the last change of a burst.
 * Returns a function that stops listening; the watcher closes with its last listener.
 */
export function watchListing(listing: string, listener: Listener, delay = 120): () => void {
  listing = path.resolve(listing);
  let watch = watches.get(listing);
  if (!watch) {
    const listeners = new Set<Listener>(), pending = new Set<string>();
    let timer: NodeJS.Timeout | null = null;
    // Files modified after the watcher started are news (a second's slack covers coarse mtimes). A folder event, or a
    // startup rescan (from the start itself), looks for them, and reports each only if it changed since it was last reported.
    const started = Date.now(), since = started - 1000, reported = new Map<string, number>();
    const mtime = (file: string) => { try { return fs.statSync(path.join(listing, file)).mtimeMs; } catch { return -1; } };
    const isFolder = (file: string) => { try { return fs.statSync(path.join(listing, file)).isDirectory(); } catch { return false; } };
    const flush = () => {
      timer = null;
      const files = [...pending].sort();
      pending.clear();
      if (files.length) for (const notify of listeners) notify({files});
    };
    const report = (name: string, rescan: boolean, from = since) => {
      const files = changedFiles(listing, name || null, from).filter(file => {
        const time = mtime(file);
        if (rescan && reported.get(file) === time) return false;
        reported.set(file, time);
        return true;
      });
      if (!files.length) return;
      for (const file of files) pending.add(file);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    };
    let watcher: fs.FSWatcher | null = null;
    try {
      watcher = fs.watch(listing, {recursive: true}, (_event, name) => {
        const named = name ? String(name).split(path.sep).join('/') : '';
        report(named, !named || isFolder(named));
      });
      // A watcher on a removed folder reports an error; the editor keeps working without live reload.
      watcher.on('error', () => { watcher?.close(); watcher = null; });
      watcher.unref();
    } catch { watcher = null; }
    const rescans = watcher ? STARTUP_RESCANS.map(after => {
      const rescan = setTimeout(() => report('', true, started), after);
      rescan.unref();
      return rescan;
    }) : [];
    const current: Watch = {listeners, close() {
      if (timer) clearTimeout(timer);
      for (const rescan of rescans) clearTimeout(rescan);
      watcher?.close();
      watches.delete(listing);
    }};
    watches.set(listing, current);
    watch = current;
  }
  const own = watch;
  own.listeners.add(listener);
  return () => {
    own.listeners.delete(listener);
    if (!own.listeners.size) own.close();
  };
}

/** Answer with a Server-Sent Events stream of `change` events for one listing, until the client disconnects. */
export function streamListingChanges(request: IncomingMessage, response: ServerResponse, listing: string): void {
  response.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no'});
  const stop = watchListing(listing, change => { response.write(`event: change\ndata: ${JSON.stringify(change)}\n\n`); });
  // Tell the browser how soon to reconnect, and the editor that it is live.
  response.write(`retry: 1500\nevent: ready\ndata: {}\n\n`);
  const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 25_000);
  heartbeat.unref();
  let ended = false;
  const end = () => { if (ended) return; ended = true; clearInterval(heartbeat); stop(); };
  request.on('close', end);
  response.on('close', end);
}
