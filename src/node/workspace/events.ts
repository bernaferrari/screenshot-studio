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

type Listener = (change: ListingChange) => void;
interface Watch {
  listeners: Set<Listener>;
  close(): void;
}
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
    const flush = () => {
      timer = null;
      const files = [...pending].sort();
      pending.clear();
      if (files.length) for (const notify of listeners) notify({files});
    };
    let watcher: fs.FSWatcher | null = null;
    try {
      watcher = fs.watch(listing, {recursive: true}, (_event, name) => {
        if (!name) return;
        const file = String(name).split(path.sep).join('/');
        if (!relevantChange(file)) return;
        // A new folder is news only through the files that arrive in it.
        try { if (fs.statSync(path.join(listing, file)).isDirectory()) return; } catch { /* Removed: that is a change. */ }
        pending.add(file);
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, delay);
      });
      // A watcher on a removed folder reports an error; the editor keeps working without live reload.
      watcher.on('error', () => { watcher?.close(); watcher = null; });
      watcher.unref();
    } catch { watcher = null; }
    const current: Watch = {listeners, close() { if (timer) clearTimeout(timer); watcher?.close(); watches.delete(listing); }};
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
  // Tell the browser how soon to reconnect, and the editor that it is live.
  response.write(`retry: 1500\nevent: ready\ndata: {}\n\n`);
  const stop = watchListing(listing, change => { response.write(`event: change\ndata: ${JSON.stringify(change)}\n\n`); });
  const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 25_000);
  heartbeat.unref();
  let ended = false;
  const end = () => { if (ended) return; ended = true; clearInterval(heartbeat); stop(); };
  request.on('close', end);
  response.on('close', end);
}
