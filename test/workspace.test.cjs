const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkspaceStore } = require("../studio/studio.cjs");
const { serve } = require("../studio/studio.cjs");
function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "studio-workspace-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      typeof value === "object" ? JSON.stringify(value) : value,
    );
  };
  const app = (name) => {
    const repo = path.join(root, name),
      listing = path.join(repo, "store-listing");
    write(path.join(listing, "studio.json"), {
      app: name,
      defaultLocale: "en-US",
      locales: ["en-US", "de-DE"],
    });
    write(path.join(listing, "profiles.json"), {
      phone: { width: 400, height: 800 },
      tablet7: { width: 800, height: 1200 },
    });
    write(path.join(listing, "gallery.json"), {
      phone: [{ feature: "home", raw: "phone/home.png" }],
      tablet7: { inherits: "phone", cards: [{}] },
    });
    write(path.join(listing, "en-US/copy.json"), {
      home: { title: "Hello", body: "World" },
    });
    write(path.join(listing, "de-DE/copy.json"), {
      home: { title: "Hallo", body: "" },
    });
    write(path.join(listing, "en-US/raw/phone/home.png"), "capture");
    write(path.join(listing, "en-US/raw/phone/home.nodes.json"), { nodes: [] });
    write(path.join(listing, "en-US/phone/01-home.jpg"), "export");
    write(path.join(listing, "en-US/tablet7/01-home.jpg"), "export");
    return repo;
  };
  return {
    root,
    write,
    app,
    store: createWorkspaceStore({
      registryFile: path.join(root, ".workspace/projects.json"),
    }),
  };
}
test("projects persist, deduplicate canonical folders, and removal preserves their files", async (t) => {
  const f = fixture(t),
    repo = f.app("First");
  const [project] = await f.store.add([path.join(repo, "store-listing")]);
  fs.symlinkSync(repo, path.join(f.root, "alias"));
  assert.equal(
    (await f.store.add([repo, path.join(f.root, "alias")]))[0].id,
    project.id,
  );
  assert.equal((await f.store.list()).length, 1);
  const reopened = createWorkspaceStore({ registryFile: f.store.registryFile });
  assert.equal(reopened.get(project.id).root, repo);
  await reopened.update(project.id, { root: repo, name: "My listing" });
  assert.equal((await reopened.list())[0].name, "My listing");
  await reopened.remove(project.id);
  assert.equal(
    fs.existsSync(path.join(repo, "store-listing/gallery.json")),
    true,
  );
  assert.equal((await reopened.list()).length, 0);
});
test("coverage resolves inherited galleries and counts only actual locale files", async (t) => {
  const f = fixture(t);
  await f.store.add([f.app("Coverage")]);
  const [project] = await f.store.list();
  assert.equal(project.cardCount, 2);
  assert.equal(project.completeLocales, 1);
  assert.deepEqual(
    project.locales.map((l) => [
      l.translated,
      l.captures,
      l.layouts,
      l.exports,
      l.next,
    ]),
    [
      [2, 1, 1, 2, "review"],
      [1, 0, 0, 0, "copy"],
    ],
  );
  assert.equal(project.totals.expectedCaptures, 2); // One unique capture in each language.
  assert.equal(project.totals.expectedExports, 4);
  assert.equal(project.previews.length, 2);
});
test("folder discovery skips build trees and reports connected projects and image libraries", async (t) => {
  const f = fixture(t),
    app = f.app("Found");
  await f.store.add([app]);
  f.app("node_modules/Hidden");
  f.write(path.join(f.root, "Library/screenshots/one.png"), "png");
  f.write(path.join(f.root, "Library/screenshots/two.webp"), "webp");
  const result = await f.store.discover(f.root);
  assert.equal(result.projects.length, 2);
  assert(result.projects.find((p) => p.name === "Found").registeredId);
  const [library] = await f.store.add([path.join(f.root, "Library")]);
  assert.equal(f.store.library(library.id).files.length, 2);
  assert.equal(
    (await f.store.list()).find((p) => p.id === library.id).kind,
    "library",
  );
  fs.rmSync(app, { recursive: true });
  assert.equal(
    (await f.store.list()).find((p) => p.root === app).kind,
    "unavailable",
  );
});
test("independent registry writers preserve both additions and reject duplicate reconnects", async (t) => {
  const f = fixture(t),
    other = createWorkspaceStore({ registryFile: f.store.registryFile });
  const a = f.app("One"),
    b = f.app("Two");
  await Promise.all([f.store.add([a]), other.add([b])]);
  const projects = await f.store.list();
  assert.equal(projects.length, 2);
  await assert.rejects(
    f.store.update(projects[0].id, { root: projects[1].root }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    f.store.add(["/path/that/does/not/exist"]),
    /could not be opened/,
  );
});
test("mounted editors isolate writes, block path escapes, and keep shared UI read only", async (t) => {
  const f = fixture(t),
    a = f.app("A"),
    b = f.app("B");
  const [project] = await f.store.add([a, b]);
  const server = await serve(f.root, 0, {
    workspace: f.store,
    editable: true,
    selectFolder: async () => a,
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`,
    prefix = `/p/${project.id}`;
  const get = async (url) => fetch(base + url),
    put = async (url, value, headers = {}) =>
      fetch(base + url, {
        method: "PUT",
        headers,
        body: JSON.stringify(value),
      });
  assert.equal((await get("/studio/")).status, 200);
  assert.equal(
    (await get(prefix + "/store-listing/studio/assets/studio.js")).status,
    200,
  );
  assert.equal(
    (await put(prefix + "/store-listing/studio/assets/studio.js", {})).status,
    403,
  );
  const value = { home: { title: "Saved in A" } };
  assert.equal(
    (await put(prefix + "/store-listing/de-DE/copy.json", value)).status,
    204,
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(a, "store-listing/de-DE/copy.json"))),
    value,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(b, "store-listing/de-DE/copy.json")))
      .home.title,
    "Hallo",
  );
  assert.equal((await put(prefix + "/README.md", {})).status, 403);
  assert.equal(
    (
      await put(
        prefix + "/store-listing/de-DE/copy.json",
        {},
        { Origin: "https://elsewhere.test" },
      )
    ).status,
    403,
  );
  assert.equal(
    await new Promise((resolve) =>
      require("node:http").get(
        base + "/api/workspace",
        { headers: { Host: "elsewhere.test" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      ),
    ),
    403,
  );
  const outside = path.join(f.root, "secret");
  f.write(outside, "hidden");
  fs.symlinkSync(outside, path.join(a, "leak.txt"));
  assert.equal((await get(prefix + "/leak.txt")).status, 403);
  fs.mkdirSync(path.join(a, "linked-index"));
  fs.symlinkSync(outside, path.join(a, "linked-index/index.html"));
  assert.equal((await get(prefix + "/linked-index/")).status, 403);
  const picked = await fetch(base + "/api/workspace/pick-folder", {
    method: "POST",
  });
  assert.equal((await picked.json()).path, a);
  const listing = await (await get("/api/workspace")).json();
  assert.equal(listing.projects.length, 2);
  const standalone = await serve(a, 0);
  t.after(() => new Promise((resolve) => standalone.close(resolve)));
  assert.equal(
    (await fetch(`http://127.0.0.1:${standalone.address().port}/api/workspace`))
      .status,
    404,
  );
});
test("drafts survive project switches, isolate locales, and detect changed disk copy", async () => {
  const { createDraftStore } = await import("../ui/src/lib/drafts.ts"),
    values = new Map();
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  const a = createDraftStore("/p/a/", storage),
    b = createDraftStore("/p/b/", storage),
    disk = { title: "Original" };
  const draft = a.restore("en-US", disk);
  draft.data = { title: "Draft" };
  a.persist("en-US", draft);
  assert.equal(a.restore("en-US", disk).data.title, "Draft");
  assert.equal(b.restore("en-US", disk).data.title, "Original");
  assert.equal(a.restore("de-DE", disk).data.title, "Original");
  const changed = a.restore("en-US", { title: "Changed on disk" });
  assert.equal(changed.conflict, true);
  a.persist("en-US", changed);
  assert.equal(a.restore("en-US", { title: "Changed on disk" }).conflict, true);
  changed.conflict = false;
  changed.saved = JSON.stringify(changed.data);
  a.persist("en-US", changed);
  assert.equal(values.size, 0);
});

test('copy writes reject stale bases without changing disk', async t => {
  const f = fixture(t), root = f.app('Conflict');
  const [project] = await f.store.add([root]);
  const server = await serve(f.root, 0, {workspace: f.store, editable: true});
  t.after(() => new Promise(resolve => server.close(resolve)));
  const file = path.join(root, 'store-listing/de-DE/copy.json');
  const original = JSON.stringify(JSON.parse(fs.readFileSync(file)));
  const external = {home: {title: 'External change'}};
  fs.writeFileSync(file, JSON.stringify(external));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/p/${project.id}/store-listing/de-DE/copy.json`, {
    method: 'PUT', headers: {'X-Studio-Base': require('node:crypto').createHash('sha256').update(original).digest('hex')}, body: JSON.stringify({home: {title: 'Stale draft'}})
  });
  assert.equal(response.status, 409);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), external);
  const fresh = await fetch(`http://127.0.0.1:${server.address().port}/p/${project.id}/store-listing/de-DE/copy.json`, {
    method: 'PUT', headers: {'X-Studio-Base': require('node:crypto').createHash('sha256').update(JSON.stringify(external)).digest('hex')}, body: JSON.stringify({home: {title: 'Resolved'}})
  });
  assert.equal(fresh.status, 204);
});

test('coverage excludes reference-only galleries and includes separate callout captures', async t => {
  const f = fixture(t), root = f.app('Coverage'), listing = path.join(root, 'store-listing');
  f.write(path.join(listing, 'profiles.json'), {phone:{width:400,height:800},tablet7:{width:800,height:1200,defaultLocaleOnly:true}});
  f.write(path.join(listing, 'gallery.json'), {phone:[{feature:'home',raw:'phone/home.png',callouts:[{raw:'phone/notice.png'}]}],tablet7:{inherits:'phone',cards:[{}]}});
  await f.store.add([root]);
  const [project] = await f.store.list(), german = project.locales.find(l => l.locale === 'de-DE');
  assert.equal(german.expectedExports, 1);
  assert.equal(german.expectedCaptures, 2);
});

test("a clean draft follows the file on disk; an unsaved one keeps its words and asks", async () => {
  const { rebase, isDirty } = await import("../ui/src/lib/drafts.ts");
  const draft = { data: { home: { title: "A" } }, saved: JSON.stringify({ home: { title: "A" } }), saving: false, error: "", conflict: false };
  assert.equal(rebase(draft, { home: { title: "A" } }), false);
  assert.equal(rebase(draft, { home: { title: "B" } }), true);
  assert.equal(draft.data.home.title, "B");
  assert.equal(isDirty(draft), false);
  draft.data = { home: { title: "Mine" } };
  assert.equal(rebase(draft, { home: { title: "C" } }), true);
  assert.equal(draft.conflict, true);
  assert.equal(draft.data.home.title, "Mine");
  assert.equal(draft.restoreBase, JSON.stringify({ home: { title: "B" } }));
  // The file catching up with the draft settles the conflict.
  assert.equal(rebase(draft, { home: { title: "Mine" } }), true);
  assert.equal(draft.conflict, false);
});

test("the editor hears about listing changes over Server-Sent Events, without studio or export output", async (t) => {
  const f = fixture(t), root = f.app("Live"), listing = path.join(root, "store-listing");
  const [project] = await f.store.add([root]);
  const server = await serve(f.root, 0, { workspace: f.store, editable: true });
  const abort = new AbortController();
  t.after(() => {
    abort.abort();
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/projects/${project.id}/events`, { signal: abort.signal });
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let text = "";
  const until = async (pattern) => {
    while (!pattern.test(text)) {
      const { value, done } = await reader.read();
      if (done) throw new Error("stream ended");
      text += decoder.decode(value);
    }
  };
  await until(/event: ready/);
  // Exports and the studio copy are the studio's own writes; they're not news.
  f.write(path.join(listing, "studio/render.js"), "// copy");
  f.write(path.join(listing, "de-DE/phone/01-home.jpg"), "jpg");
  f.write(path.join(listing, "theme.css"), "body{}");
  f.write(path.join(listing, "de-DE/raw/phone/home.png"), "png");
  // Changes are batched over a short window, so the writes may arrive in more than one event.
  const changed = () => new Set(text.split("event: change\ndata: ").slice(1).flatMap((part) => JSON.parse(part.split("\n")[0]).files));
  await until(/event: change/);
  while (!(changed().has("theme.css") && changed().has("de-DE/raw/phone/home.png"))) await until(new RegExp(`(event: change[\\s\\S]*){${[...text.matchAll(/event: change/g)].length + 1}}`));
  assert.deepEqual([...changed()].sort(), ["de-DE/raw/phone/home.png", "theme.css"]);
});

test("the review route joins the file check with the last export's notes and warnings", async (t) => {
  const f = fixture(t), root = f.app("Review"), listing = path.join(root, "store-listing");
  const [project] = await f.store.add([root]);
  f.write(path.join(listing, "export-report.json"), {
    ok: false, error: "Fonts failed to load: de-DE/phone/01-home.jpg", cards: [], locales: [{ locale: "de-DE" }],
    warnings: ["de-DE/phone/01-home.jpg: \"Welt\" is left on a short last line; reword or shorten the copy"],
    finishedAt: "2026-01-01T00:00:00.000Z", options: { locales: ["de-DE"] },
  });
  f.write(path.join(listing, "de-DE/assets.json"), { galleries: { phone: [{ file: "phone/01-home.jpg", feature: "home", slide: 0, notes: ["untranslated: body"] }] } });
  const server = await serve(f.root, 0, { workspace: f.store, editable: true });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const review = await (await fetch(`http://127.0.0.1:${server.address().port}/api/projects/${project.id}/review`)).json();
  assert.equal(review.lastExport.ok, false);
  assert.deepEqual(review.lastExport.locales, ["de-DE"]);
  const byMessage = (text) => review.issues.find((issue) => issue.message.includes(text));
  assert.equal(review.issues[0].level, "error");
  assert.equal(byMessage("Fonts failed").source, "export");
  assert.deepEqual(byMessage("untranslated: body").card, { kind: "phone", index: 0, feature: "home" });
  const widow = byMessage("short last line");
  assert.equal(widow.file, "de-DE/phone/01-home.jpg");
  assert.deepEqual(widow.card, { kind: "phone", index: 0, feature: "home" });
  assert.match(widow.fix, /Reword/);
  // A missing capture names its card through the JSON path.
  f.write(path.join(listing, "gallery.json"), { phone: [{ feature: "home", raw: "phone/missing.png" }], tablet7: { inherits: "phone", cards: [{}] } });
  const again = await (await fetch(`http://127.0.0.1:${server.address().port}/api/projects/${project.id}/review`)).json();
  const missing = again.issues.find((issue) => issue.message.includes("missing.png"));
  assert.equal(missing.level, "error");
  assert.equal(missing.path, "phone[0].raw");
  assert.deepEqual(missing.card, { kind: "phone", index: 0, feature: "home" });
});
