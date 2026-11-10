/** Run `npm run build && npm run test:ui`. All writes use temporary projects. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  zlib = require("node:zlib");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { serve } = require("../studio/studio.cjs");
const { createWorkspaceStore } = require("../studio/studio.cjs");
function png(width, height) {
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const content = Buffer.concat([Buffer.from(type), data]),
      head = Buffer.alloc(4),
      tail = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    tail.writeUInt32BE(crc(content));
    return Buffer.concat([head, content, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1), 245);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) raw[y * (width * 4 + 1) + x * 4 + 4] = 255;
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
async function setup(t) {
  const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "studio-shadcn-")),
    ),
    write = (file, value) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        Buffer.isBuffer(value) || typeof value === "string"
          ? value
          : JSON.stringify(value),
      );
    };
  const app = (folder, name) => {
    const repo = path.join(root, folder),
      l = path.join(repo, "store-listing");
    write(l + "/studio.json", { app: name, locales: ["en-US", "de-DE"] });
    write(l + "/profiles.json", {
      phone: {
        width: 400,
        height: 800,
        captureWidth: 400,
        captureHeight: 800,
        label: "Phone",
      },
      tablet7: { width: 600, height: 800, label: "Tablet" },
    });
    write(l + "/gallery.json", {
      phone: [
        { feature: "hello", raw: "phone/home.png", file: "phone/01-hello.png" },
      ],
      tablet7: [{ feature: "hello" }],
    });
    for (const locale of ["en-US", "de-DE"]) {
      write(`${l}/${locale}/copy.json`, {
        hello: { title: locale === "en-US" ? name : "", body: "Words" },
      });
      write(`${l}/${locale}/raw/phone/home.png`, png(400, 800));
      write(`${l}/${locale}/raw/phone/home.nodes.json`, {
        width: 400,
        height: 800,
        nodes: [
          { path: "0", cls: "Root", b: [0, 0, 400, 800] },
          {
            path: "0.1",
            cls: "Button",
            id: "app:id/action",
            text: "Suggested channel",
            b: locale === "en-US" ? [20, 100, 180, 160] : [40, 180, 220, 260],
          },
          {
            path: "0.1.0",
            cls: "TextView",
            text: "Tap to change",
            b: [50, 115, 150, 145],
          },
        ],
      });
    }
    write(l + "/en-US/phone/01-hello.png", png(400, 800));
    write(l + "/theme.js", "export default {}");
    write(
      l + "/theme.css",
      "body{background:#eee;font-family:Arial}header{top:30px;left:20px;right:20px}h1{font-size:36px}.device{left:60px;top:220px;width:280px;--bezel:6px;--radius:20px}",
    );
    return repo;
  };
  const roots = [app("Alpha", "Alpha"), app("Beta", "Beta")],
    library = path.join(root, "discover/Library");
  write(library + "/screenshots/sample.png", png(80, 160));
  const discoverApp = app("discover/Gamma", "Gamma"),
    store = createWorkspaceStore({
      registryFile: path.join(root, "registry.json"),
    });
  await store.add(roots);
  const projects = await store.list(),
    server = await serve(root, 0, {
      workspace: store,
      editable: true,
      selectFolder: async () => library,
    }),
    browser = await chromium.launch();
  t.after(async () => {
    if (/callout|mobile/.test(t.name))
      await page
        .screenshot({
          path:
            "/tmp/studio-shadcn-" +
            (/callout/.test(t.name) ? "picker" : "mobile") +
            "-test.png",
        })
        .catch(() => {});
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const page = await browser.newPage({
      viewport: { width: 1400, height: 1000 },
    }),
    base = `http://127.0.0.1:${server.address().port}`,
    errors = [];
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (/DialogContent.*requires|Missing.*Description/.test(m.text()))
      errors.push(m.text());
  });
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(base + "/studio/");
  await page.locator(".workspace-card").first().waitFor();
  return {
    page,
    base,
    projects,
    roots,
    root,
    library,
    discoverApp,
    write,
    store,
  };
}
const activeNav = (page) => page.locator(".workspace-project.current");
async function view(page, name) {
  await activeNav(page).getByRole("link", { name, exact: true }).click();
}
async function choice(page, label, option) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
const active = (page) => page.locator(".editor-view:not([hidden])");

test("genuine shadcn sidebar, menus and navigation preserve the document and loaded cards", async (t) => {
  const { page } = await setup(t);
  await page.evaluate(() => {
    window.shell = document.querySelector('[data-slot="sidebar-inner"]');
    window.probe = true;
  });
  let documents = 0;
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents++;
  });
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Alpha", exact: true })
    .click();
  await page.getByRole("navigation", { name: "Project sections" }).waitFor();
  await active(page).locator("iframe.preview-ready").waitFor();
  const original = await active(page)
    .locator("iframe")
    .evaluateHandle((n) => n);
  await view(page, "Gallery");
  await active(page).locator(".canvas-surface").waitFor();
  assert(
    await active(page)
      .locator("iframe")
      .evaluate((n, old) => n === old, original),
  );
  await view(page, "Languages");
  await page.locator(".language-row").first().waitFor();
  await view(page, "Gallery");
  await active(page).locator(".canvas-surface").waitFor();
  assert(
    await active(page)
      .locator("iframe")
      .evaluate((n, old) => n === old, original),
  );
  await page.goBack();
  await page.locator(".language-row").first().waitFor();
  await page.goForward();
  await active(page).locator("iframe").waitFor();
  await page.getByRole("button", { name: "Joined", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".editor-view:not([hidden]) .canvas-surface")
        ?.dataset.joined === "false",
  );
  await page.getByRole("slider", { name: "Preview size", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert(
    await active(page)
      .locator("iframe")
      .evaluate((n, old) => n === old, original),
  );
  assert.equal(documents, 0);
  assert(
    await page.evaluate(
      () =>
        window.probe &&
        window.shell === document.querySelector('[data-slot="sidebar-inner"]'),
    ),
  );
  assert((await page.locator('[data-slot="slider"]').count()) > 0);
  await page.locator("[data-slot=sidebar-trigger]").click();
  await page.waitForFunction(
    () =>
      document.querySelector("[data-slot=sidebar]")?.dataset.state ===
      "collapsed",
  );
});

test("copy filtering, custom selects, conflict recovery and keyboard saves retain draft data", async (t) => {
  const { page, base, projects, roots, write } = await setup(t);
  await page.goto(base + projects[0].editorURL + "?view=copy&locale=de-DE");
  const area = page.getByRole("textbox", {
    name: "de-DE hello title",
    exact: true,
  });
  await area.waitFor();
  await page.getByRole("button", { name: "Missing only", exact: true }).click();
  await area.pressSequentially("Draft kept while typing");
  assert.equal(await area.inputValue(), "Draft kept while typing");
  await page
    .getByRole("searchbox", { name: "Search copy", exact: true })
    .fill("not found");
  await page.getByText("No matching copy", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  assert.equal(await area.inputValue(), "Draft kept while typing");
  const search = page.getByRole("searchbox", {
    name: "Search copy",
    exact: true,
  });
  await search.fill("Draft kept");
  await search.press("Enter");
  assert.equal(
    JSON.parse(fs.readFileSync(roots[0] + "/store-listing/de-DE/copy.json"))
      .hello.title,
    "",
  );
  await choice(page, "Jump to copy card", "01 · Hello");
  assert.equal(await search.inputValue(), "");
  await area.press("Control+Enter");
  await page.getByText("All changes saved", { exact: true }).waitFor();
  assert.equal(
    JSON.parse(fs.readFileSync(roots[0] + "/store-listing/de-DE/copy.json"))
      .hello.title,
    "Draft kept while typing",
  );
  await area.fill("Conflict draft");
  write(roots[0] + "/store-listing/de-DE/copy.json", {
    hello: { title: "External change", body: "Words" },
  });
  await page.reload();
  await page.getByText("The saved copy changed", { exact: true }).waitFor();
  assert(
    await page
      .getByRole("button", { name: "Save de-DE/copy.json", exact: true })
      .isDisabled(),
  );
  await page
    .getByRole("button", { name: "Use saved copy", exact: true })
    .click();
  assert.equal(await area.inputValue(), "External change");
  await choice(page, "Language", "American English · reference");
  await page
    .getByRole("textbox", { name: "en-US hello title", exact: true })
    .waitFor();
  assert.equal(await page.locator(".copy .copy-reference").count(), 0);
});

test("a pending save stays scoped to the original project after switching projects", async (t) => {
  const { page, base, projects, roots } = await setup(t);
  await page.goto(base + projects[0].editorURL + "?view=copy");
  await page.getByRole("textbox").first().fill("Saved only in Alpha");
  let release, observed;
  const gate = new Promise((r) => (release = r)),
    put = new Promise((r) => (observed = r));
  await page.route("**/en-US/copy.json", async (route) => {
    if (route.request().method() === "PUT") {
      observed();
      await gate;
    }
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Save en-US/copy.json", exact: true })
    .click();
  await put;
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Beta", exact: true })
    .click();
  await page.getByRole("heading", { name: "Beta", exact: true }).waitFor();
  release();
  await page.waitForResponse((r) => r.request().method() === "PUT");
  assert.equal(
    JSON.parse(fs.readFileSync(roots[0] + "/store-listing/en-US/copy.json"))
      .hello.title,
    "Saved only in Alpha",
  );
  assert.equal(
    JSON.parse(fs.readFileSync(roots[1] + "/store-listing/en-US/copy.json"))
      .hello.title,
    "Beta",
  );
});

test("a slow abandoned editor cannot commit over the next project", async (t) => {
  const { page, projects } = await setup(t);
  let release, observed;
  const gate = new Promise((r) => (release = r)),
    started = new Promise((r) => (observed = r));
  await page.route("**/studio.json", async (route) => {
    if (route.request().url().includes(projects[0].id)) {
      observed();
      await gate;
    }
    await route.continue();
  });
  await page
    .locator(".workspace-card")
    .filter({ hasText: "Alpha" })
    .getByRole("link", { name: "Open studio", exact: true })
    .click();
  await started;
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Beta", exact: true })
    .click();
  await page.getByRole("heading", { name: "Beta", exact: true }).waitFor();
  release();
  await page.waitForTimeout(200);
  assert.equal(await page.locator("#main h1").textContent(), "Beta");
  assert.equal(
    await page
      .locator(".workspace-project.current .project-link-name")
      .textContent(),
    "Beta",
  );
});

test("languages list every language's needs, filters them and opens its words", async (t) => {
  const { page, base, projects } = await setup(t);
  await page.goto(base + projects[0].editorURL + "?view=languages");
  await page.locator(".language-row").first().waitFor();
  assert.equal(await page.locator("iframe").count(), 0);
  const german = page.locator('.language-row[data-locale="de-DE"]');
  assert.match(await german.textContent(), /1 \/ 2 copy fields/);
  assert.match(await german.textContent(), /Copy needed/);
  await page.getByRole("tab", { name: "Complete", exact: true }).click();
  await page.getByText("No matching languages", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search languages", exact: true })
    .fill("German");
  assert.equal(await page.locator(".language-row").count(), 1);
  await page
    .getByRole("button", { name: "Edit German (Germany) copy", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "de-DE hello title", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "All languages", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue translation", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "de-DE hello title", exact: true })
    .waitFor();
  await page.goBack();
  await page
    .getByRole("button", { name: "View German (Germany) gallery", exact: true })
    .click();
  await active(page).locator("iframe.preview-ready").waitFor();
  assert(
    (await active(page).locator("iframe").getAttribute("src")).includes(
      "locale=de-DE",
    ),
  );
});

test("project dialogs use shadcn to discover, connect, rename and remove folders safely", async (t) => {
  const { page, root, library, store } = await setup(t);
  await page
    .getByRole("button", { name: "Add project", exact: true })
    .last()
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Connect your projects",
    exact: true,
  });
  await dialog.getByRole("tab", { name: "Find projects", exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "Search inside folder", exact: true })
    .fill(root + "/discover");
  await dialog
    .getByRole("button", { name: "Find projects", exact: true })
    .click();
  await dialog.getByText("2 projects found", { exact: true }).waitFor();
  await dialog
    .getByRole("button", { name: "Add 2 projects", exact: true })
    .click();
  await page.locator(".workspace-card").filter({ hasText: "Gamma" }).waitFor();
  assert.equal((await store.list()).length, 4);
  await page
    .getByRole("searchbox", { name: "Search projects", exact: true })
    .fill("Library");
  await page.getByRole("link", { name: "View images", exact: true }).click();
  await page.locator(".library-image img").evaluate((img) => img.decode());
  await page
    .getByRole("button", { name: "Manage Library", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Change folder or name", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Project settings", exact: true });
  await dialog
    .getByRole("textbox", { name: "Project name optional", exact: true })
    .fill("My screenshots");
  await dialog
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "My screenshots", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Manage My screenshots", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Remove from workspace", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove from workspace", exact: true })
    .click();
  await page.locator(".workspace-card").first().waitFor();
  assert.equal((await store.list()).length, 3);
  assert(fs.existsSync(library + "/screenshots/sample.png"));
});

test("shadcn callout dialog saves exact element metadata, follows localized bounds and supports manual crops", async (t) => {
  const { page, base, projects, roots } = await setup(t);
  await page.goto(base + projects[0].editorURL + "?view=gallery");
  await page.getByRole("button", { name: "Pick callout", exact: true }).click();
  let dialog = page.getByRole("dialog", {
    name: "Pick a callout",
    exact: true,
  });
  await dialog.getByRole("tab", { name: "Element", exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector("[role=tab][data-state=active]") &&
      [...document.querySelectorAll("[role=tab]")].some(
        (n) => n.textContent === "Element" && n.dataset.state === "active",
      ),
  );
  await dialog
    .getByRole("combobox", { name: "Find accessibility element", exact: true })
    .fill("Suggested");
  await dialog.getByRole("option").first().click();
  await dialog
    .getByRole("button", { name: "Save as this card's callout", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  let callout = JSON.parse(
    fs.readFileSync(roots[0] + "/store-listing/gallery.json"),
  ).phone[0].callouts[0];
  assert.deepEqual(
    [callout.x, callout.y, callout.w, callout.h],
    [20, 100, 160, 60],
  );
  assert.equal(callout.targetId, "app:id/action");
  assert.equal(callout.targetMode, "element");
  await choice(page, "Language", "German (Germany)");
  await page.waitForFunction(() =>
    document
      .querySelector(".editor-view:not([hidden]) iframe")
      ?.src.includes("locale=de-DE"),
  );
  await active(page).locator("iframe.preview-ready").waitFor();
  const report = await active(page)
    .locator("iframe")
    .evaluate((f) =>
      JSON.parse(f.contentDocument.documentElement.dataset.report),
    );
  assert.equal(report.fixedCallouts.length, 0);
  assert.equal(report.movedCallouts.length, 1);
  await page.getByRole("button", { name: "Pick callout", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Pick a callout", exact: true });
  await dialog.locator("img").evaluate((img) => img.decode());
  await dialog.getByRole("tab", { name: "Draw box", exact: true }).click();
  const rect = await dialog.locator("img").boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.1, rect.y + rect.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.4, {
    steps: 6,
  });
  await page.mouse.up();
  await dialog
    .getByRole("button", { name: "Save as this card's callout", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  callout = JSON.parse(
    fs.readFileSync(roots[0] + "/store-listing/gallery.json"),
  ).phone[0].callouts[0];
  assert(callout.w > 0 && callout.h > 0);
  assert.equal(callout.targetMode, undefined);
});

test("mobile Sidebar Sheet, keyboard search, saved preview and dark mode work without overflow", async (t) => {
  const { page, base, projects } = await setup(t);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + projects[0].editorURL + "?view=copy");
  await page.getByRole("textbox").first().waitFor();
  await page.locator("[data-slot=sidebar-trigger]").click();
  const sheet = page.getByRole("dialog", { name: "Sidebar", exact: true });
  await sheet.getByRole("link", { name: "Alpha", exact: true }).click();
  await sheet.waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Alpha", exact: true }).waitFor();
  await page.locator("[data-slot=sidebar-trigger]").click();
  await page
    .getByRole("dialog", { name: "Sidebar", exact: true })
    .getByRole("button", {
      name: "Local workspace 2 connected projects",
      exact: true,
    })
    .click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  assert(
    await page.locator("html").evaluate((n) => n.classList.contains("dark")),
  );
  await page.getByRole("menu").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Close project sidebar", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Sidebar", exact: true })
    .waitFor({ state: "hidden" });
  await page.locator("[data-slot=sidebar-trigger]").click();
  await page
    .getByRole("dialog", { name: "Sidebar", exact: true })
    .getByRole("link", { name: "Languages", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit American English copy", exact: true })
    .click();
  await page.getByRole("textbox").first().waitFor();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("dialog", {
    name: "Saved preview",
    exact: true,
  });
  await preview.locator("iframe.preview-ready").waitFor();
  await page.keyboard.press("Escape");
  await preview.waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
    0,
  );
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox")
    .filter({ has: page.locator("input") })
    .count();
  await page.getByPlaceholder("Search projects and actions…").fill("Beta");
  await page.getByRole("option", { name: /Beta/ }).click();
  await page.getByRole("heading", { name: "Beta", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
    0,
  );
});

test("the compiled UI opens a shadcn launch screen directly from disk", async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(__dirname, "../studio/index.html")).href);
  await page
    .getByText("Open your screenshot workspace", { exact: true })
    .waitFor();
  assert((await page.locator('[data-slot="card"]').count()) > 0);
  assert(
    await page
      .getByRole("button", { name: "Copy command", exact: true })
      .isVisible(),
  );
});

function addViewerGallery({ roots, write }, count = 3) {
  const listing = roots[0] + "/store-listing",
    gallery = JSON.parse(fs.readFileSync(listing + "/gallery.json"));
  for (let i = 1; i < count; i++) {
    const feature = `detail-${i + 1}`;
    gallery.phone.push({ feature, file: `phone/0${i + 1}-${feature}.png` });
    write(`${listing}/en-US/phone/0${i + 1}-${feature}.png`, png(400, 800));
  }
  write(listing + "/gallery.json", gallery);
  for (const locale of ["en-US", "de-DE"]) {
    const file = `${listing}/${locale}/copy.json`,
      copy = JSON.parse(fs.readFileSync(file));
    for (let i = 1; i < count; i++)
      copy[`detail-${i + 1}`] = {
        title: locale === "en-US" ? `Detail ${i + 1}` : "",
        body: "",
      };
    write(file, copy);
  }
}
const viewer = (page) => page.locator(".image-viewer");
async function waitViewer(page, type) {
  await viewer(page).waitFor();
  if (type)
    assert.equal(await viewer(page).getAttribute("data-media-type"), type);
  await viewer(page).locator(".image-viewer-stage[aria-busy=false]").waitFor();
}
async function viewerIndex(page, index) {
  await page.waitForFunction(
    (index) =>
      document.querySelector(".image-viewer")?.dataset.imageIndex ===
      String(index),
    index,
  );
}

test("overview images open a shadcn gallery with wrapping navigation, zoom, panning and restored focus", async (t) => {
  const f = await setup(t),
    { page } = f;
  addViewerGallery(f);
  await page.reload();
  await page
    .getByRole("button", { name: "Enlarge Alpha screenshot 1", exact: true })
    .waitFor();
  let documents = 0;
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents++;
  });
  const trigger = page.getByRole("button", {
    name: "Enlarge Alpha screenshot 1",
    exact: true,
  });
  await trigger.click();
  await waitViewer(page, "image");
  assert.equal(await page.context().pages().length, 1);
  assert.equal(await viewer(page).getAttribute("data-image-index"), "0");
  await page.keyboard.press("ArrowRight");
  await viewerIndex(page, 1);
  await waitViewer(page);
  await viewer(page)
    .getByRole("button", { name: /Show screenshot 3:/ })
    .click();
  await viewerIndex(page, 2);
  await waitViewer(page);
  await page.keyboard.press("ArrowRight");
  await viewerIndex(page, 0);
  await waitViewer(page);
  await viewer(page)
    .getByRole("button", { name: /Show screenshot 1:/ })
    .click();
  assert.equal(
    await viewer(page).locator(".image-viewer-stage").getAttribute("aria-busy"),
    "false",
    "Re-selecting the current image must not leave a loader stuck",
  );
  const before = await viewer(page)
    .getByRole("status", { name: "Image zoom", exact: true })
    .textContent();
  await viewer(page)
    .getByRole("button", { name: "Actual image size", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('.image-viewer [aria-label="Image zoom"]')
        .textContent === "100%",
  );
  assert.notEqual(before, "100%");
  const stage = viewer(page).locator(".image-viewer-stage"),
    bounds = await stage.boundingBox(),
    top = await stage.evaluate((n) => n.scrollTop);
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2 + 65,
    { steps: 5 },
  );
  await page.mouse.up();
  assert.notEqual(await stage.evaluate((n) => n.scrollTop), top);
  await viewer(page)
    .getByRole("button", { name: "Fit image", exact: true })
    .click();
  assert.equal(
    await viewer(page)
      .getByRole("status", { name: "Image zoom", exact: true })
      .textContent(),
    before,
  );
  assert(
    await viewer(page)
      .getByRole("link", { name: "Download image", exact: true })
      .isVisible(),
  );
  await page.keyboard.press("Escape");
  await viewer(page).waitFor({ state: "hidden" });
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") ===
      "Enlarge Alpha screenshot 1",
  );
  assert.equal(documents, 0);
});

test("live and exported gallery cards use the same viewer without reloading their original previews", async (t) => {
  const f = await setup(t),
    { page, base, projects } = f;
  addViewerGallery(f);
  await page.goto(base + projects[0].editorURL + "?view=gallery");
  await active(page).locator("iframe.preview-ready").first().waitFor();
  const original = await active(page)
    .locator("iframe")
    .first()
    .evaluateHandle((node) => node);
  await active(page)
    .getByRole("button", { name: "Open Hello in image viewer", exact: true })
    .click();
  await waitViewer(page, "live");
  assert(
    (await viewer(page).locator("iframe").getAttribute("src")).includes(
      "slide=0",
    ),
  );
  await viewer(page)
    .getByRole("button", { name: "Next screenshot", exact: true })
    .click();
  await viewerIndex(page, 1);
  await waitViewer(page);
  assert(
    (await viewer(page).locator("iframe").getAttribute("src")).includes(
      "slide=1",
    ),
  );
  await viewer(page)
    .getByRole("button", { name: "Close image viewer", exact: true })
    .click();
  await viewer(page).waitFor({ state: "hidden" });
  assert(
    await active(page)
      .locator("iframe")
      .first()
      .evaluate((node, old) => node === old, original),
  );
  await page.getByRole("tab", { name: "Exported", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".editor-view:not([hidden]) .canvas-surface")
        ?.dataset.previewSource === "exported",
  );
  await active(page)
    .getByRole("button", { name: "Open Hello in image viewer", exact: true })
    .click();
  await waitViewer(page, "image");
  await page.keyboard.press("Escape");
  await viewer(page).waitFor({ state: "hidden" });
  await page.getByRole("tab", { name: "Live", exact: true }).click();
  await choice(page, "Language", "German (Germany)");
  await page.waitForFunction(() =>
    document
      .querySelector(".editor-view:not([hidden]) iframe")
      ?.src.includes("locale=de-DE"),
  );
  await active(page)
    .getByRole("button", { name: "Open Hello in image viewer", exact: true })
    .click();
  await waitViewer(page, "live");
  assert(
    (await viewer(page).locator("iframe").getAttribute("src")).includes(
      "locale=de-DE",
    ),
  );
  await viewer(page).getByText("Untranslated copy", { exact: true }).waitFor();
});

test("library image dialogs recover from missing files and support touch swipe on a phone", async (t) => {
  const f = await setup(t),
    { page, store, library, write, base } = f;
  write(library + "/screenshots/second.png", png(160, 80));
  write(library + "/screenshots/broken.png", "invalid image");
  const [project] = await store.add([library]);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(base + `/studio/?project=${project.id}`);
  await page
    .getByRole("button", {
      name: "Enlarge screenshots/broken.png",
      exact: true,
    })
    .click();
  await viewer(page).getByRole("alert").waitFor();
  write(library + "/screenshots/broken.png", png(80, 160));
  await viewer(page)
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await waitViewer(page, "image");
  const before = Number(await viewer(page).getAttribute("data-image-index"));
  const stage = await viewer(page).locator(".image-viewer-stage").boundingBox(),
    cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const x = stage.x + stage.width * 0.75,
    y = stage.y + stage.height * 0.5;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x - stage.width * 0.5, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await viewerIndex(page, (before + 1) % 3);
  await waitViewer(page);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
    0,
  );
  const dialogBox = await viewer(page).boundingBox();
  assert(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 320);
  await viewer(page)
    .getByRole("button", { name: "Close image viewer", exact: true })
    .click();
  await viewer(page).waitFor({ state: "hidden" });
});

test("the copy preview shares the gallery dialog and never saves unsaved words automatically", async (t) => {
  const f = await setup(t),
    { page, base, projects, roots } = f;
  addViewerGallery(f);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + projects[0].editorURL + "?view=copy");
  const area = page.getByRole("textbox", {
    name: "en-US hello title",
    exact: true,
  });
  await area.fill("Draft stays in the editor");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await waitViewer(page, "live");
  await viewer(page)
    .getByText(
      "This preview uses the saved copy. Save your changes to include the latest words.",
      { exact: true },
    )
    .waitFor();
  await viewer(page)
    .getByRole("button", { name: "Next screenshot", exact: true })
    .click();
  await viewerIndex(page, 1);
  await waitViewer(page);
  await page.keyboard.press("Escape");
  await viewer(page).waitFor({ state: "hidden" });
  assert.equal(await area.inputValue(), "Draft stays in the editor");
  assert.equal(
    JSON.parse(fs.readFileSync(roots[0] + "/store-listing/en-US/copy.json"))
      .hello.title,
    "Alpha",
  );
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === "Preview",
  );
  assert(
    await page
      .getByRole("button", { name: "Preview", exact: true })
      .evaluate((node) => node === document.activeElement),
  );
});

test("a long gallery stays fitted and keeps controls visible on mobile and after resize", async (t) => {
  const fixture = await setup(t),
    { page, base, projects } = fixture;
  addViewerGallery(fixture, 8);
  await page.goto(base + projects[0].editorURL + "?view=gallery");
  await active(page)
    .getByRole("button", { name: "Open Hello in image viewer", exact: true })
    .click();
  await waitViewer(page, "live");
  for (const width of [390, 320, 900]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(() => {
      const dialog = document.querySelector(".image-viewer"),
        button = dialog?.querySelector('[aria-label="Close image viewer"]'),
        stage = dialog?.querySelector(".image-viewer-stage");
      if (!dialog || !button || !stage) return false;
      const b = button.getBoundingClientRect(),
        r = dialog.getBoundingClientRect(),
        s = stage.getBoundingClientRect();
      return (
        r.x >= 0 &&
        r.right <= innerWidth &&
        r.y >= 0 &&
        r.bottom <= innerHeight &&
        b.x >= 0 &&
        b.right <= innerWidth &&
        b.y >= 0 &&
        b.bottom <= innerHeight &&
        s.width <= innerWidth
      );
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      0,
    );
  }
  await page.keyboard.press("End");
  await viewerIndex(page, 7);
  await waitViewer(page);
  const selected = viewer(page).getByRole("button", {
      name: /Show screenshot 8:/,
    }),
    strip = viewer(page).locator('[data-slot="scroll-area-viewport"]');
  await page.waitForFunction(() => {
    const selected = document.querySelector(
        '.image-viewer [aria-current="true"]',
      ),
      strip = document.querySelector(
        '.image-viewer [data-slot="scroll-area-viewport"]',
      );
    if (!selected || !strip) return false;
    const a = selected.getBoundingClientRect(),
      b = strip.getBoundingClientRect();
    return a.x >= b.x - 1 && a.right <= b.right + 1;
  });
});

test("project filters use connected shadcn tab panels and fit narrow screens", async (t) => {
  const { page, store, library } = await setup(t);
  await store.add([library]);
  await page.reload();
  const tabs = page.getByRole("tablist", { name: "Project filters" });
  const all = tabs.getByRole("tab", { name: "All projects", exact: true });
  const inProgress = tabs.getByRole("tab", {
    name: "In progress",
    exact: true,
  });
  const libraries = tabs.getByRole("tab", {
    name: "Libraries & setup",
    exact: true,
  });
  await all.waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".workspace-card").length === 3,
  );
  await all.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() =>
    document
      .querySelector('[data-slot="tabs-trigger"][data-state="active"]')
      ?.textContent.includes("In progress"),
  );
  assert.equal(await inProgress.getAttribute("aria-selected"), "true");
  assert.equal(await page.locator(".workspace-card").count(), 2);
  await libraries.click();
  const panel = page.getByRole("tabpanel");
  assert.equal(
    await panel.getAttribute("id"),
    await libraries.getAttribute("aria-controls"),
  );
  assert.equal(
    await panel.getAttribute("aria-labelledby"),
    await libraries.getAttribute("id"),
  );
  assert.equal(await panel.locator(".workspace-card").count(), 1);
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("does-not-exist");
  await page.getByText("No matching projects", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  assert.equal(await all.getAttribute("aria-selected"), "true");
  assert.equal(await panel.locator(".workspace-card").count(), 3);
  for (const width of [320, 390, 798, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    const geometry = await tabs.evaluate((el) => ({
      width: el.clientWidth,
      scrollWidth: el.scrollWidth,
      height: el.clientHeight,
      scrollHeight: el.scrollHeight,
      clipped: [...el.children].some((child) => {
        const r = child.getBoundingClientRect(),
          box = el.getBoundingClientRect();
        return (
          r.left < box.left ||
          r.right > box.right + 1 ||
          r.bottom > box.bottom + 1
        );
      }),
    }));
    assert(
      geometry.scrollWidth <= geometry.width + 1,
      `horizontal tab overflow at ${width}`,
    );
    assert(
      geometry.scrollHeight <= geometry.height + 1,
      `vertical tab overflow at ${width}`,
    );
    assert(!geometry.clipped, `clipped tab at ${width}`);
    await page.screenshot({
      path: `/tmp/studio-refined-${width}.png`,
      fullPage: width === 1440,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Alpha", exact: true })
    .click();
  await page.getByRole("navigation", { name: "Project sections" }).waitFor();
  await active(page).locator("iframe.preview-ready").waitFor();
  await view(page, "Languages");
  const languageTabs = page.getByRole("tablist", { name: "Language filters" });
  await languageTabs
    .getByRole("tab", { name: "Needs work", exact: true })
    .click();
  assert.equal(await page.locator(".language-row:visible").count(), 2);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await languageTabs.evaluate((el) => ({
      x: el.scrollWidth - el.clientWidth,
      y: el.scrollHeight - el.clientHeight,
    }));
    assert(
      overflow.x <= 1 && overflow.y <= 1,
      `language tabs overflow at ${width}: ${JSON.stringify(overflow)}`,
    );
  }
});

test("a listing opens in its editor, and project sections keep history and fit phones", async (t) => {
  const { page, projects, base } = await setup(t);
  await page.goto(base + projects[0].overviewURL);
  const sections = page.getByRole("navigation", { name: "Project sections" });
  await sections.waitFor();
  await page.waitForFunction(() => location.pathname.includes("/store-listing/studio/"));
  await page.evaluate(() => {
    window.projectDocument = document;
  });
  await sections.getByRole("link", { name: /Review/ }).click();
  await page.getByRole("tablist", { name: "Issue filters" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("view"), "review");
  await sections.getByRole("link", { name: /Languages/ }).click();
  await page.locator(".language-row").first().waitFor();
  await page.goBack();
  await page.getByRole("tablist", { name: "Issue filters" }).waitFor();
  await page.goForward();
  await page.locator(".language-row").first().waitFor();
  assert(await page.evaluate(() => document === window.projectDocument));
  await page.reload();
  await page.locator(".language-row").first().waitFor();
  assert.equal(
    await sections
      .getByRole("link", { name: /Languages/ })
      .getAttribute("aria-current"),
    "page",
  );
  for (const width of [320, 390, 798]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    const action = page.getByRole("button", {
      name: "Edit German (Germany) copy",
      exact: true,
    });
    const within = await action.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth;
    });
    assert(within, `copy action clipped at ${width}`);
    const fits = await sections.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1,
    );
    assert(fits, `project sections clipped at ${width}`);
  }
  await page
    .getByRole("button", { name: "Edit German (Germany) copy", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "de-DE hello title", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).searchParams.get("locale"), "de-DE");
  const reference = page
    .locator(".copy-field:visible")
    .first()
    .locator(".copy-reference");
  const area = page.getByRole("textbox", {
    name: "de-DE hello title",
    exact: true,
  });
  const a = await reference.boundingBox(),
    b = await area.boundingBox();
  assert(
    b.y >= a.y + a.height,
    "reference should stack above the translation on a phone",
  );
});

test("the narrow gallery select switches devices and reuses the loaded gallery", async (t) => {
  const { page, projects, base } = await setup(t);
  await page.setViewportSize({ width: 798, height: 1000 });
  await page.goto(base + projects[0].editorURL + "?view=gallery");
  await active(page).locator("iframe.preview-ready").waitFor();
  const original = await active(page)
    .locator("iframe")
    .evaluateHandle((el) => el);
  assert.equal(
    await page.getByRole("tablist", { name: "Device galleries" }).isVisible(),
    false,
  );
  await choice(page, "Device gallery", "Tablet · 1 card");
  await page.waitForFunction(
    () => new URL(location.href).searchParams.get("kind") === "tablet7",
  );
  await active(page).locator("iframe.preview-ready").waitFor();
  await choice(page, "Device gallery", "Phone · 1 card");
  await page.waitForFunction(
    () =>
      new URL(location.href).searchParams.get("kind") === "phone" &&
      new URL(
        document.querySelector(".editor-view:not([hidden]) iframe")?.src,
      ).searchParams.get("kind") === "phone",
  );
  assert(
    await active(page)
      .locator("iframe")
      .evaluate((el, old) => el === old, original),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("tablist", { name: "Device galleries" })
    .waitFor({ state: "visible" });
  assert(
    await page.getByRole("tablist", { name: "Device galleries" }).isVisible(),
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "Device gallery", exact: true })
      .isVisible(),
    false,
  );
});

test('saving a callout preserves other callouts', async t => {
  const {page, base, projects, roots, write} = await setup(t);
  const file = roots[0] + '/store-listing/gallery.json';
  const gallery = JSON.parse(fs.readFileSync(file));
  const sibling = {x:30, y:300, w:100, h:60};
  gallery.phone[0].callouts = [{x:20,y:100,w:160,h:60}, sibling];
  write(file, gallery);
  await page.goto(base + projects[0].editorURL + '?view=gallery');
  await page.getByRole('button', {name:'Pick callout',exact:true}).click();
  const dialog = page.getByRole('dialog', {name:'Pick a callout',exact:true});
  await dialog.getByRole('combobox', {name:'Find accessibility element',exact:true}).fill('Suggested');
  await dialog.getByRole('option').first().click();
  await dialog.getByRole('button', {name:"Save as this card's callout",exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).phone[0].callouts[1], sibling);
});

test("live reload re-renders previews in place when theme, gallery and copy files change", async (t) => {
  const { page, base, projects, roots, write } = await setup(t);
  const listing = roots[0] + "/store-listing";
  await page.goto(base + projects[0].editorURL + "?view=gallery");
  await page.locator(".live-indicator[data-state=live]").waitFor();
  await active(page).locator("iframe.preview-ready").waitFor();
  const first = await active(page).locator("iframe").getAttribute("src");
  await page.evaluate(() => scrollTo(0, 120));
  const scrolled = await page.evaluate(() => scrollY);
  write(
    listing + "/theme.css",
    fs.readFileSync(listing + "/theme.css", "utf8") + "body{background:#123456}",
  );
  // A new frame renders behind the old one and replaces it once ready.
  await page.waitForFunction(
    (old) => {
      const frames = [
        ...document.querySelectorAll(".editor-view:not([hidden]) iframe"),
      ];
      return (
        frames.length === 1 &&
        frames[0].src !== old &&
        frames[0].classList.contains("preview-ready")
      );
    },
    first,
    { timeout: 10000 },
  );
  const background = await active(page)
    .locator("iframe")
    .evaluate((f) => getComputedStyle(f.contentDocument.body).backgroundColor);
  assert.equal(background, "rgb(18, 52, 86)");
  assert.equal(await page.evaluate(() => scrollY), scrolled);
  // A new card in gallery.json appears without a reload.
  const gallery = JSON.parse(fs.readFileSync(listing + "/gallery.json"));
  gallery.phone.push({ feature: "second" });
  write(listing + "/gallery.json", gallery);
  await active(page)
    .getByRole("button", { name: "Inspect Second", exact: true })
    .waitFor();
  // Words saved elsewhere reach an open, clean copy editor.
  await page.goto(base + projects[0].editorURL + "?view=copy&locale=de-DE");
  const area = page.getByRole("textbox", {
    name: "de-DE hello title",
    exact: true,
  });
  await area.waitFor();
  await page.locator(".live-indicator[data-state=live]").waitFor();
  write(listing + "/de-DE/copy.json", {
    hello: { title: "Von außen", body: "Words" },
  });
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="de-DE hello title"]')?.value ===
      "Von außen",
  );
  // An unsaved draft is kept, and the person chooses.
  await area.fill("Mein Entwurf");
  write(listing + "/de-DE/copy.json", {
    hello: { title: "Noch einmal", body: "Words" },
  });
  await page.getByText("The saved copy changed", { exact: true }).waitFor();
  assert.equal(await area.inputValue(), "Mein Entwurf");
});

test("the review queue lists check and export issues with fixes and opens their cards", async (t) => {
  const { page, base, projects, roots, write } = await setup(t);
  const listing = roots[0] + "/store-listing";
  const copy = JSON.parse(fs.readFileSync(listing + "/en-US/copy.json"));
  copy.unused = { title: "Nobody reads me" };
  write(listing + "/en-US/copy.json", copy);
  write(listing + "/export-report.json", {
    ok: true,
    cards: [{}],
    warnings: [
      "de-DE/phone: the background breaks at the seam between cards 1 and 2 (12% of rows differ)",
      "en-US/phone/old.png is no longer in the gallery; delete it",
    ],
    locales: [{ locale: "de-DE" }],
    finishedAt: new Date().toISOString(),
    options: { locales: ["de-DE"] },
  });
  write(listing + "/de-DE/assets.json", {
    galleries: {
      phone: [
        {
          file: "phone/01-hello.png",
          feature: "hello",
          slide: 0,
          notes: ["untranslated: title"],
        },
      ],
    },
  });
  await page.goto(base + projects[0].editorURL + "?view=review");
  const issues = page.locator(".review-issue");
  await issues.first().waitFor();
  assert.equal(await issues.count(), 5);
  // Words the default language has and German doesn't, named so they can be translated.
  await page.getByText(/field\(s\) not translated yet/).first().waitFor();
  await page.getByText('"unused" isn\'t used by any card', { exact: true }).waitFor();
  await page.getByText("Remove it, or fix the card's feature name.").waitFor();
  await page.getByText("en-US/phone/old.png", { exact: true }).waitFor();
  assert.match(
    await page.locator(".review").textContent(),
    /Last export .* German \(Germany\)/,
  );
  await page.getByRole("tab", { name: /Errors/ }).click();
  await page.getByText("No errors", { exact: true }).waitFor();
  await page.getByRole("tab", { name: /All/ }).click();
  // The header and the section link count what needs fixing.
  await page
    .getByRole("navigation", { name: "Project sections" })
    .getByRole("link", { name: /Review\s*5/ })
    .waitFor();
  // A fixed file leaves the queue on its own.
  delete copy.unused;
  write(listing + "/en-US/copy.json", copy);
  await page.waitForFunction(
    () => document.querySelectorAll(".review-issue").length === 4,
  );
  await page
    .locator(".review-issue")
    .filter({ hasText: "untranslated: title" })
    .getByRole("button", { name: "Open card Hello", exact: true })
    .click();
  const inspector = page.getByRole("region", { name: "Hello card" });
  await inspector.waitFor();
  const url = new URL(page.url());
  assert.equal(url.searchParams.get("view"), "gallery");
  assert.equal(url.searchParams.get("card"), "0");
  assert.equal(url.searchParams.get("locale"), "de-DE");
  await inspector.getByText("untranslated: title", { exact: true }).waitFor();
  await inspector.getByText(/background breaks at the seam/).waitFor();
});

test("clicking a card inspects it: words save inline, the viewer stays reachable, keys move and close", async (t) => {
  const f = await setup(t),
    { page, base, projects, roots } = f;
  addViewerGallery(f);
  await page.goto(base + projects[0].editorURL + "?view=gallery&locale=de-DE");
  await active(page).locator("iframe.preview-ready").first().waitFor();
  await active(page)
    .getByRole("button", { name: "Inspect Hello", exact: true })
    .click();
  const inspector = page.getByRole("region", { name: "Hello card" });
  await inspector.waitFor();
  assert.equal(new URL(page.url()).searchParams.get("card"), "0");
  await inspector.getByText("gallery.json · phone[0]", { exact: true }).waitFor();
  await inspector.getByText("home.png", { exact: true }).waitFor();
  await inspector.getByText("Untranslated: title").waitFor();
  const title = inspector.getByRole("textbox", {
    name: "de-DE hello title",
    exact: true,
  });
  await title.fill("Hallo *Welt*");
  await inspector.getByText("Unsaved", { exact: true }).waitFor();
  await title.press("Control+Enter");
  await inspector.getByText("Saved", { exact: true }).waitFor();
  assert.equal(
    JSON.parse(fs.readFileSync(roots[0] + "/store-listing/de-DE/copy.json"))
      .hello.title,
    "Hallo *Welt*",
  );
  // The live preview follows the saved words.
  await page.waitForFunction(
    () =>
      document
        .querySelector(".editor-view:not([hidden]) iframe.preview-ready")
        ?.contentDocument?.querySelector("h1 em")?.textContent === "Welt",
    null,
    { timeout: 10000 },
  );
  await inspector.getByRole("button", { name: "Open in viewer", exact: true }).click();
  await waitViewer(page, "live");
  await page.keyboard.press("Escape");
  await viewer(page).waitFor({ state: "hidden" });
  await inspector.waitFor();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("region", { name: "Detail 2 card" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("region", { name: "Detail 2 card" }).waitFor({ state: "hidden" });
  assert.equal(new URL(page.url()).searchParams.get("card"), null);
  // On a phone the inspector is a sheet.
  await page.setViewportSize({ width: 390, height: 844 });
  await active(page)
    .getByRole("button", { name: "Inspect Hello", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Card inspector" });
  await sheet.getByRole("region", { name: "Hello card" }).waitFor();
  await sheet.getByRole("button", { name: "Close inspector", exact: true }).click();
  await sheet.waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    0,
  );
});

test("store preview shows the cards at Play's thumbnail size on a phone-width page", async (t) => {
  const f = await setup(t),
    { page, base, projects } = f;
  addViewerGallery(f);
  await page.goto(base + projects[0].editorURL + "?view=gallery");
  await active(page).locator("iframe.preview-ready").first().waitFor();
  await page.getByRole("button", { name: "Store preview", exact: true }).click();
  const store = page.getByRole("region", {
    name: "Google Play store page preview, American English",
  });
  await store.waitFor();
  assert.equal(new URL(page.url()).searchParams.get("store"), "true");
  await store.getByText("Alpha", { exact: true }).waitFor();
  const frames = store.locator("[data-card-frame]");
  assert.equal(await frames.count(), 3);
  const box = await frames.first().boundingBox();
  assert.equal(Math.round(box.height), 210);
  assert.equal(Math.round(box.width), 105);
  assert((await store.boundingBox()).width <= 432);
  await store.locator("iframe.preview-ready").first().waitFor();
  await store.getByRole("button", { name: "Inspect Detail 2", exact: true }).click();
  await page.getByRole("region", { name: "Detail 2 card" }).waitFor();
  await page.getByRole("button", { name: "Close inspector", exact: true }).click();
  // Galleries Play doesn't show say so.
  await page.getByRole("tab", { name: /Tablet/ }).click();
  await page.getByRole("region", { name: /Google Play store page preview/ }).waitFor();
  await page.getByRole("button", { name: "Store preview", exact: true }).click();
  await active(page).locator(".canvas-surface").waitFor();
});

test('a racing gallery edit is preserved when the callout dialog saves', async t => {
  const {page,base,projects,roots,write}=await setup(t);
  const file=roots[0]+'/store-listing/gallery.json';
  await page.goto(base+projects[0].editorURL+'?view=gallery');
  await page.getByRole('button',{name:'Pick callout',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Pick a callout',exact:true});
  await dialog.getByRole('combobox',{name:'Find accessibility element',exact:true}).fill('Suggested');
  await dialog.getByRole('option').first().click();
  let concurrent;
  await page.route('**/gallery.json',async route=>{
    if(route.request().method()==='PUT') {
      assert.ok(route.request().headers()['x-studio-base']);
      concurrent=JSON.parse(fs.readFileSync(file));concurrent.phone[0].layout='concurrent-edit';write(file,concurrent);
    }
    await route.continue();
  });
  const response=page.waitForResponse(r=>r.url().endsWith('/gallery.json')&&r.request().method()==='PUT');
  await dialog.getByRole('button',{name:"Save as this card's callout",exact:true}).click();
  assert.equal((await response).status(),409);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)),concurrent);
  assert.ok(await dialog.isVisible());
});

test('typing during a delayed save does not conflict with its own live event', async t=>{
  const {page,base,projects}=await setup(t);
  await page.goto(base+projects[0].editorURL+'?view=copy&locale=de-DE');
  const area=page.getByRole('textbox',{name:'de-DE hello title',exact:true});await area.waitFor();
  let sentResolve,releaseResolve;
  const sent=new Promise(r=>sentResolve=r),release=new Promise(r=>releaseResolve=r);
  await page.route('**/de-DE/copy.json',async route=>{
    if(route.request().method()!=='PUT')return route.continue();
    const response=await route.fetch();sentResolve();await release;await route.fulfill({response});
  });
  await area.fill('First save');await area.press('Meta+Enter');await sent;
  await area.fill('Keep typing');await page.waitForTimeout(600);releaseResolve();
  await page.getByText(/copy saved/).waitFor();
  assert.equal(await page.getByText('The saved copy changed',{exact:true}).count(),0);
  assert.equal(await area.inputValue(),'Keep typing');
  await page.unrouteAll({behavior:'wait'});
});

test('failed preview reloads retain at most the last successful and newest frame',async t=>{
  const {page,base,projects,roots,write}=await setup(t);
  const listing=roots[0]+'/store-listing';
  // Fail the render without generating uncaught page errors in the editor itself.
  write(listing+'/theme.js','export default {async compose(){await new Promise(()=>{})}}');
  await page.goto(base+projects[0].editorURL+'?view=gallery');
  const card=page.locator('[data-card-frame=live]').first();await card.waitFor();
  for(let i=0;i<4;i++){write(listing+'/theme.css',`body{background:rgb(${i},0,0)}`);await page.waitForTimeout(350);}
  assert.ok(await card.locator('iframe').count()<=2);
});

test('a partial export report refreshes exported image URLs',async t=>{
  const {page,base,projects,roots,write}=await setup(t);
  await page.goto(base+projects[0].editorURL+'?view=gallery&source=exported');
  const image=page.locator('[data-card-frame=exported] img').first();await image.waitFor();
  const before=await image.getAttribute('src');
  write(roots[0]+'/store-listing/export-report.json',{ok:true,cards:[{locale:'en-US'}],options:{kind:'phone',card:0}});
  await page.waitForFunction(previous=>document.querySelector('[data-card-frame=exported] img')?.getAttribute('src')!==previous,before);
});
