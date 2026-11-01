// The renderer's rules, checked without a browser: headline markup, frame sizes, bounds, callout placement, widows.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../studio/studio.cjs');

test('headline markup becomes lines of plain, highlighted, struck and inserted runs', () => {
  assert.deepEqual(layout.parseHeadline('Every app,\n*on your terms.*'), [[{text: 'Every app,'}], [{text: 'on your terms.', tag: 'em'}]]);
  assert.deepEqual(layout.parseHeadline('~Ads~ [Nothing] left'), [[{text: 'Ads', tag: 'del'}, {text: ' '}, {text: 'Nothing', tag: 'ins'}, {text: ' left'}]]);
  // Empty markers stay as text.
  assert.deepEqual(layout.parseHeadline('5 ** 2'), [[{text: '5 ** 2'}]]);
  assert.deepEqual(layout.parseHighlight('Before *after*'), [{text: 'Before '}, {text: 'after', tag: 'em'}]);
});

test('frames scale with their width, landscape frames are slimmer, and fixed layouts or frames:false opt out', () => {
  assert.deepEqual(layout.frameSize({}, 'phone', false, 1000, ['phone', 'home']), {bezel: 20, radius: 90});
  assert.deepEqual(layout.frameSize({}, 'tablet', true, 1000, []), {bezel: 12, radius: 35});
  assert.deepEqual(layout.frameSize({frames: {phone: {bezel: .03, radius: .1}}}, 'phone', false, 1000, []), {bezel: 30, radius: 100});
  assert.equal(layout.frameSize({frames: {fixed: ['spread']}}, 'phone', false, 1000, ['readme', 'spread']), null);
  assert.equal(layout.frameSize({frames: false}, 'phone', false, 1000, []), null);
  assert.equal(layout.frameSize({}, 'none', false, 1000, []), null);
  assert.equal(layout.frameSize({}, 'browser', false, 1000, []), null);
});

test('bounds merge the base, built-in layouts, studio.json layouts and the card, in that order', () => {
  assert.deepEqual(layout.boundsFor({}, ['phone', 'home']), {margin: 0, visible: .6});
  assert.deepEqual(layout.boundsFor({}, ['phone', 'apps', 'hang']), {margin: 0, visible: .6, top: true});
  assert.deepEqual(layout.boundsFor({bounds: {margin: 40, layouts: {big: {visible: .5}}}}, ['phone', 'x', 'big'], {sides: true}), {margin: 40, visible: .5, sides: true});
  assert.equal(layout.boundsFor({bounds: {layouts: {wild: false}}}, ['wild']), null);
  assert.equal(layout.boundsFor({}, ['phone'], false), null);
});

test('a device that leaves the card says how', () => {
  const rule = {margin: 0, visible: .6};
  const box = (left, top, width = 400, height = 800) => ({left, top, width, height});
  assert.equal(layout.boundsProblem(box(100, 100), 'phone', rule, 1080, 1920, 'a.png'), null);
  assert.equal(layout.boundsProblem(box(-10, 100), 'phone', rule, 1080, 1920, 'a.png'), 'Screen leaves the side of the card: a.png');
  assert.equal(layout.boundsProblem(box(800, 100), 'phone', {...rule, right: .3}, 1080, 1920, 'a.png'), null);
  assert.equal(layout.boundsProblem(box(100, -10), 'phone', rule, 1080, 1920, 'a.png'), 'Screen leaves the top of the card: a.png');
  assert.equal(layout.boundsProblem(box(100, 1500), 'phone', rule, 1080, 1920, 'a.png'), 'Too little of a.png is visible');
  assert.equal(layout.boundsProblem(box(0, 1000, 1000, 600), 'tablet', {...rule, visible: 0}, 1080, 1400, 't.png'), 'Landscape tablet is cut: t.png');
  assert.equal(layout.boundsProblem(box(-500, -500), 'none', rule, 1080, 1920, 'a.png'), null);
});

test('a callout centres on its region, magnified, or sits where it is placed', () => {
  const screen = {left: 100, top: 200, width: 540, height: 1170};
  // The capture is twice the screen's width: the region's centre (300, 450) lands at (250, 425) on the card.
  const at = layout.calloutPlacement({x: 200, y: 400, w: 200, h: 100}, 1080, screen, {mag: 1.2});
  assert.equal(at.scale, .6);
  assert.deepEqual({left: at.left, top: at.top}, {left: 250 - 60, top: 425 - 30});
  assert.deepEqual(layout.calloutPlacement({x: 0, y: 0, w: 200, h: 100}, 1080, screen, {place: {left: 10, top: 20, width: 400}}), {left: 10, top: 20, scale: 2});
});

test('a last line under 30% of the longest is a widow', () => {
  assert.equal(layout.isWidow([800, 200]), true);
  assert.equal(layout.isWidow([800, 300]), false);
  assert.equal(layout.isWidow([800]), false);
});

test('captures must keep a real device ratio', () => {
  assert.equal(layout.hasDeviceRatio(1080, 2340, [1080 / 2340, 2340 / 1080]), true);
  assert.equal(layout.hasDeviceRatio(2340, 1080, [1080 / 2340, 2340 / 1080]), true);
  assert.equal(layout.hasDeviceRatio(1080, 1920, [1080 / 2340]), false);
  assert.equal(layout.hasDeviceRatio(1080, 1920, [1080 / 2340], 1080 / 1920), true);
});
