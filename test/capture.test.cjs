// The capture engine's rules that need no emulator: which element a label names, and taps recorded in the default
// language replayed by tree position in another.
const test = require('node:test');
const assert = require('node:assert/strict');
const {matcher, TapMap} = require('../studio/studio.cjs');

const tab = {path: '0.2.1', b: [0, 2200, 360, 2340], text: 'Firewall', cls: 'android.widget.TextView'};
const toggle = {path: '0.0.4', b: [400, 600, 680, 880], desc: 'Firewall', cls: 'android.view.View'};

test('a label matches the whole text, or the description unless textOnly; strings are regular expressions', () => {
  assert.equal(matcher('Firewall')(toggle), true);
  assert.equal(matcher('Firewall', true)(toggle), false);
  assert.equal(matcher('Firewall', true)(tab), true);
  assert.equal(matcher('Fire')(tab), false, 'matched whole, not as a substring');
  assert.equal(matcher('Fire.*')(tab), true);
  assert.equal(matcher(/firewall/i)(tab), true);
  assert.equal(matcher('Firewall', false, b => b[1] > 2000)(toggle), false, 'within narrows by position');
});

test('taps recorded in the default language replay by tree path, whatever the label says there', () => {
  let saved = null;
  const recording = new TapMap('tap-map.json', true, () => null);
  assert.equal(recording.resolve('phone|light|Firewall', [toggle, tab], matcher('Firewall', true)).path, '0.2.1');
  saved = recording.json();
  const german = {...tab, text: 'Firewall-Regeln'};
  const replay = new TapMap('tap-map.json', false, () => saved);
  assert.equal(replay.resolve('phone|light|Firewall', [toggle, german], matcher('Firewall', true)), german);
  assert.throws(() => replay.resolve('phone|light|Firewall', [toggle, german], () => true), /No recorded tap for phone\|light\|Firewall#1/);
  assert.throws(() => new TapMap('tap-map.json', false, () => null), /capture the default language first/);
});

test('waits and scrolls record a value in the default language and replay it, numbered per key', () => {
  const recording = new TapMap('tap-map.json', true, () => null);
  recording.put('phone|light|scroll Most blocked', '1800 1.0.4');
  recording.put('phone|light|scroll Most blocked', '-120 1.0.2');
  const replay = new TapMap('tap-map.json', false, () => recording.json());
  assert.equal(replay.take('phone|light|scroll Most blocked'), '1800 1.0.4');
  assert.equal(replay.take('phone|light|scroll Most blocked'), '-120 1.0.2');
  assert.throws(() => replay.take('phone|light|scroll Most blocked'), /Nothing recorded for phone\|light\|scroll Most blocked#2/);
});
