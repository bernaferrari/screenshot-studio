// The capture engine's rules that need no device: which element a label names, taps recorded in the default
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

test('a listing still on a Python tour is told to write capture.tour.mjs', t => {
  const {tourFile} = require('../studio/studio.cjs');
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const listing = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-tour-'));
  t.after(() => fs.rmSync(listing, {recursive: true, force: true}));
  assert.throws(() => tourFile(listing), /write store-listing\/capture\.tour\.mjs/);
  fs.writeFileSync(path.join(listing, 'capture-emulator.py'), '');
  assert.throws(() => tourFile(listing), /capture-emulator\.py is a Python tour, which this version no longer runs/);
  fs.writeFileSync(path.join(listing, 'capture.tour.mjs'), 'export default {}');
  assert.equal(tourFile(listing), path.join(listing, 'capture.tour.mjs'));
});

test('iOS launches in the capture language with the language and region iOS names', () => {
  const {appleLanguage} = require('../studio/studio.cjs');
  assert.deepEqual(appleLanguage('de-DE'), ['-AppleLanguages', '(de-DE)', '-AppleLocale', 'de_DE']);
  assert.deepEqual(appleLanguage('zh-CN'), ['-AppleLanguages', '(zh-Hans)', '-AppleLocale', 'zh_CN']);
  assert.deepEqual(appleLanguage('ja'), ['-AppleLanguages', '(ja)', '-AppleLocale', 'ja']);
});

test('a failed Android tour restores original state and updates rotated dimensions', async t=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-restore-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'state.json');
  const initial={wifi:false,data:false,night:'yes',helper:true,locale:'de-DE',navigation:'com.android.internal.systemui.navbar.threebutton',settings:{font_scale:'1.3',auto_time:'0',wifi_on:'0',mobile_data:'0'}};
  fs.writeFileSync(file,JSON.stringify(initial));
  fs.writeFileSync(path.join(root,'adb'),`#!${process.execPath}
const fs=require('fs');const f=${JSON.stringify(file)};const s=JSON.parse(fs.readFileSync(f));const a=process.argv.slice(5),cmd=a.join(' ');let out='';
if(cmd.startsWith('getprop'))out='1';
if(cmd==='wm size')out='Physical size: 200x400';
if(cmd==='wm density')out='Physical density: 160';
if(cmd.startsWith('settings get'))out=s.settings[a[3]]??'null';
if(cmd.startsWith('settings put'))s.settings[a[3]]=a[4];
if(cmd.startsWith('settings delete'))delete s.settings[a[3]];
if(cmd==='cmd uimode night')out='Night mode: '+s.night;
if(cmd.startsWith('cmd uimode night '))s.night=a[3];
if(cmd==='cmd overlay list')out='[x] '+s.navigation;
if(cmd.startsWith('cmd overlay enable-exclusive'))s.navigation=a.at(-1);
if(cmd==='pm list instrumentation')out='com.callstack.agentdevice.snapshothelper';
if(cmd==='pm list packages')out=s.helper?'package:com.example.safetycore':'';
if(cmd.startsWith('pm uninstall')){s.helper=false;out='Success';}
if(cmd.startsWith('pm install-existing')){s.helper=true;out='Package installed';}
if(cmd.startsWith('svc wifi'))s.wifi=cmd.endsWith('enable');
if(cmd.startsWith('svc data'))s.data=cmd.endsWith('enable');
if(cmd.startsWith('cmd locale get-app-locales'))out='Locales for app are ['+s.locale+']';
if(cmd.startsWith('cmd locale set-app-locales'))s.locale=a.at(-1);
fs.writeFileSync(f,JSON.stringify(s));process.stdout.write(out);
`,{mode:0o755});
  fs.writeFileSync(path.join(root,'studio.json'),JSON.stringify({app:'Test',locales:['en-US']}));
  fs.writeFileSync(path.join(root,'profiles.json'),JSON.stringify({phone:{width:200,height:400,captureWidth:200,captureHeight:400,captureDensity:160}}));
  const dimensions=path.join(root,'dimensions.json'),tour=path.join(root,'capture.tour.mjs');
  fs.writeFileSync(tour,`import fs from 'node:fs';export default {app:'example.app',tapMap:false,async run(d){await d.rotate(true);const landscape=[d.width,d.height];await d.rotate(false);fs.writeFileSync(${JSON.stringify(dimensions)},JSON.stringify({landscape,portrait:[d.width,d.height]}));throw new Error('intentional failure');}};`);
  const previous=process.env.PATH;process.env.PATH=root+path.delimiter+previous;
  try {
    const {runTour}=require('../studio/studio.cjs');
    await assert.rejects(runTour(tour,{listing:root,locale:'en-US',serial:'emulator-5554',log:()=>{}}),/intentional failure/);
  } finally {process.env.PATH=previous;}
  assert.deepEqual(JSON.parse(fs.readFileSync(dimensions)),{landscape:[400,200],portrait:[200,400]});
  assert.deepEqual(JSON.parse(fs.readFileSync(file)),initial);
});
