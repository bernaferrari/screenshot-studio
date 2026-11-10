// The editor's pure logic (ui/src/lib), loaded straight from TypeScript: Node strips the types.
import { test } from "node:test";
import assert from "node:assert/strict";

const skip = !process.features.typescript && "this Node can't load .ts files";
const lib = (name) => import(`../ui/src/lib/${name}.ts`);

test("the viewer reducer moves, zooms and recovers", { skip }, async () => {
  const { viewerReducer, viewerState } = await lib("viewer");
  let state = viewerState(0);
  state = viewerReducer(state, { type: "zoom", to: 40, max: 16 });
  assert.equal(state.zoom, 16);
  assert.equal(viewerReducer(state, { type: "zoom", by: 2, max: 16 }), state);
  state = viewerReducer(state, { type: "failed", error: "Gone" });
  state = viewerReducer(state, { type: "retry" });
  assert.deepEqual([state.error, state.retry, state.loaded], ["", 1, false]);
  // Moving wraps around, and starts the next image afresh but keeps the retry count.
  state = viewerReducer(state, { type: "choose", index: -1, count: 3 });
  assert.deepEqual([state.index, state.zoom, state.retry], [2, 1, 1]);
  assert.equal(
    viewerReducer(state, { type: "choose", index: 5, count: 3 }),
    state,
  );
  state = viewerReducer(state, { type: "live" });
  assert.deepEqual([state.fallback, state.loaded], [true, false]);
});

test("the viewer fits, centres and reads swipes", { skip }, async () => {
  const { fitScale, maxZoom, toggledZoom, centred, swipeDirection } =
    await lib("viewer");
  assert.equal(fitScale({ width: 0, height: 0 }, { width: 10, height: 10 }), 0);
  // Never enlarges; otherwise fits with a 16 px margin each side.
  assert.equal(
    fitScale({ width: 2000, height: 2000 }, { width: 100, height: 100 }),
    1,
  );
  assert.equal(
    fitScale({ width: 432, height: 1000 }, { width: 800, height: 400 }),
    0.5,
  );
  assert.equal(maxZoom(0.5), 16);
  assert.equal(maxZoom(0.01), 100);
  assert.equal(toggledZoom(1, 0.25, 16), 4);
  assert.equal(toggledZoom(3, 0.25, 16), 1);
  assert.deepEqual(
    centred({ width: 100, height: 100 }, 4, { width: 200, height: 500 }),
    { left: 100, top: 0 },
  );
  assert.equal(swipeDirection(-120, 10, 1000), 1);
  assert.equal(swipeDirection(120, 10, 1000), -1);
  assert.equal(swipeDirection(-120, 110, 1000), 0);
  assert.equal(swipeDirection(-50, 0, 1000), 0);
});

const node = (path, b, extra = {}) => ({ path, b, ...extra });

test(
  "the callout picker finds elements and builds the callout",
  { skip },
  async () => {
    const {
      nodeAt,
      findNodes,
      parentNode,
      savedNode,
      usableNodes,
      pickReducer,
      startPick,
      pickedCallout,
      validCallout,
      capturePoint,
    } = await lib("callout");
    const screen = node("0", [0, 0, 100, 200]),
      list = node("0.1", [0, 50, 100, 150]),
      button = node("0.1.0", [10, 60, 50, 80], {
        text: "Save",
        id: "app:id/save",
        cls: "android.widget.Button",
      });
    const nodes = usableNodes(
      { nodes: [screen, list, button, node("0.2", [90, 0, 120, 10])] },
      { width: 100, height: 200 },
    );
    assert.deepEqual(
      nodes.map((n) => n.path),
      ["0", "0.1", "0.1.0"],
    );
    assert.equal(nodeAt(nodes, 20, 70, false), button);
    assert.equal(nodeAt(nodes, 20, 120, false), undefined);
    assert.equal(nodeAt(nodes, 20, 120, true), list);
    assert.deepEqual(findNodes(nodes, "save", false, null), [button]);
    assert.deepEqual(findNodes(nodes, "nothing", false, list), [list]);
    assert.equal(parentNode(nodes, button), list);
    assert.equal(savedNode({ targetId: "app:id/save" }, nodes), button);
    assert.equal(
      savedNode(
        { target: "0.1.0", targetClass: "android.widget.Switch" },
        nodes,
      ),
      undefined,
    );
    assert.deepEqual(
      capturePoint(
        150,
        75,
        { left: 50, top: 50, width: 50, height: 100 },
        {
          width: 100,
          height: 200,
        },
      ),
      [100, 50],
    );

    const saved = {
      x: 1,
      y: 2,
      w: 3,
      h: 4,
      mag: 1.5,
      target: "0.9",
      targetMode: "element",
    };
    let pick = pickReducer(startPick(saved), { type: "select", node: button });
    let value = pickedCallout(pick, saved, nodes, 0);
    assert.deepEqual(value, {
      x: 10,
      y: 60,
      w: 40,
      h: 20,
      mag: 1.5,
      radius: 24,
      target: "0.1.0",
      targetMode: "element",
      targetClass: "android.widget.Button",
      targetId: "app:id/save",
    });
    assert.ok(validCallout(value, { width: 100, height: 200 }, pick.selected));
    // Typing a box by hand drops the element, and remembers the choice to draw.
    pick = pickReducer(pick, { type: "edit", key: "w", value: 200 });
    value = pickedCallout(pick, saved, nodes, 1);
    assert.equal(value.target, undefined);
    assert.equal(value.device, 1);
    assert.ok(pick.drawn);
    assert.ok(!validCallout(value, { width: 100, height: 200 }, null));
  },
);

test("callouts are placed per device in gallery.json", { skip }, async () => {
  const { placeCallout } = await lib("callout");
  const gallery = {
    phone: [{ feature: "home", callouts: [{ x: 0, y: 0, w: 1, h: 1 }] }],
    tablet: { inherits: "phone", cards: [{ feature: "home" }] },
  };
  const callout = { x: 5, y: 5, w: 5, h: 5, device: 1 };
  placeCallout(gallery, "phone", 0, callout, 1);
  assert.equal(gallery.phone[0].callouts.length, 2);
  placeCallout(gallery, "phone", 0, { ...callout, w: 9 }, 1);
  assert.deepEqual(
    gallery.phone[0].callouts.map((c) => c.w),
    [1, 9],
  );
  placeCallout(gallery, "phone", 0, null, 0);
  assert.equal("callouts" in gallery.phone[0], false);
  placeCallout(gallery, "tablet", 0, null, 0);
  assert.deepEqual(gallery.tablet.cards[0].callouts, []);
});

test(
  "copy rows follow the reference, the search and missing fields",
  { skip },
  async () => {
    const { writtenFields, cardFields, copyRows, copyScope } =
      await lib("copy");
    const reference = {
      home: { title: "Home", body: "" },
      "phone/apps": { title: "Apps" },
    };
    assert.deepEqual(writtenFields(reference, "home", false), [
      "title",
      "body",
    ]);
    assert.deepEqual(writtenFields(reference, "home", true), ["title"]);
    assert.deepEqual(
      cardFields(
        { feature: "new", sharedCopy: false },
        "phone",
        [],
        reference,
        false,
      ),
      [
        ["phone/new", "title"],
        ["phone/new", "body"],
      ],
    );
    assert.deepEqual(
      cardFields({ feature: "new" }, "phone", [], reference, true),
      [],
    );
    const rows = (filters) =>
      copyRows(
        ["home", "phone/apps"],
        reference,
        { home: { title: "Start" } },
        true,
        {
          query: "",
          missing: false,
          focused: null,
          fieldName: (field) => field,
          ...filters,
        },
      ).map((row) => row.fields);
    assert.deepEqual(rows({ query: "start" }), [["title"], []]);
    assert.deepEqual(rows({ missing: true }), [[], ["title"]]);
    assert.deepEqual(rows({ missing: true, focused: "home/title" }), [
      ["title"],
      ["title"],
    ]);
    assert.equal(copyScope("phone/apps"), "phone");
    assert.equal(copyScope("home"), null);
  },
);

test("kept strips drop the oldest and the removed", { skip }, async () => {
  const { keepStrip } = await lib("strips");
  const strips = new Map(),
    exists = (strip) => strip.kind !== "gone";
  for (const kind of ["a", "b", "c"])
    keepStrip(strips, { kind, locale: "en", source: "live" }, exists, 2);
  assert.deepEqual(
    [...strips.values()].map((s) => s.kind),
    ["b", "c"],
  );
  strips.set("x", { kind: "gone", locale: "en", source: "live" });
  const key = keepStrip(
    strips,
    { kind: "c", locale: "en", source: "live" },
    exists,
    2,
  );
  assert.equal(key, JSON.stringify(["c", "en", "live"]));
  assert.deepEqual(
    [...strips.values()].map((s) => s.kind),
    ["c"],
  );
});

test(
  "the connect form finds, selects and names its button",
  { skip },
  async () => {
    const { connectReducer, openForm, submitLabel } = await lib("connect");
    let form = openForm({ root: "/apps/a", name: "A" });
    assert.equal(submitLabel(form, true, false), "Save project");
    form = connectReducer(openForm({}), {
      type: "mode",
      mode: "find",
      searchRoot: "/apps",
    });
    assert.equal(form.root, "/apps");
    assert.equal(submitLabel(form, false, false), "Find projects");
    form = connectReducer(form, {
      type: "found",
      found: {
        projects: [
          { root: "/apps/a", registeredId: "a" },
          { root: "/apps/b" },
          { root: "/apps/c" },
        ],
      },
    });
    assert.deepEqual([...form.selected], ["/apps/b", "/apps/c"]);
    form = connectReducer(form, {
      type: "select",
      root: "/apps/b",
      selected: false,
    });
    assert.equal(submitLabel(form, false, false), "Add 1 projects");
    form = connectReducer(form, { type: "root", root: "/elsewhere" });
    assert.equal(form.found, null);
    assert.equal(submitLabel(form, false, true), "Working…");
  },
);

test("render reports read as words", { skip }, async () => {
  const { reportProblems, reportNotes } = await lib("report");
  const report = {
    missingCopy: ["home"],
    fallbackCaptures: [],
    fixedCallouts: [],
    fit: 0.8,
  };
  assert.deepEqual(reportProblems(report), ["Untranslated copy"]);
  assert.deepEqual(reportNotes(report, "en-US"), [
    "Untranslated: home",
    "Words shrunk to 80% to fit",
  ]);
  assert.deepEqual(reportNotes(null, "en-US"), []);
});

test('live reload recognizes a pending save without losing later typing', {skip}, async()=>{
  const {rebase}=await lib('drafts');
  const before=JSON.stringify({home:{title:'Original'}}),snapshot=JSON.stringify({home:{title:'Saving'}});
  const draft={data:{home:{title:'Continued typing'}},saved:before,saving:true,pending:snapshot,error:'',conflict:false};
  assert.equal(rebase(draft,JSON.parse(snapshot)),true);
  assert.equal(draft.conflict,false);assert.equal(draft.saving,true);assert.equal(draft.saved,snapshot);
  assert.equal(draft.data.home.title,'Continued typing');
  rebase(draft,{home:{title:'External change'}});assert.equal(draft.conflict,true);
});
