#!/usr/bin/env node
/**
 * Scaffold Screenshot Studio in an app repository.
 *   node init.cjs /path/to/app --name "App name" --package com.example.app [--locales en-US,de-DE]
 * Creates store-listing/ with a working starter theme and gallery, syncs studio/, and never overwrites
 * files that already exist. Follow PLAYBOOK.md afterwards.
 */
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const args = process.argv.slice(2);
const repo = path.resolve(args[0] || '');
const flag = name => { const i = args.indexOf(`--${name}`); return i > 0 ? args[i + 1] : null; };
const name = flag('name'), pkg = flag('package');
const locales = (flag('locales') || 'en-US').split(',');
if (!args[0] || !name || !pkg) {
  console.error('Usage: node init.cjs /path/to/app --name "App name" --package com.example.app [--locales en-US,de-DE]');
  process.exit(1);
}
const listing = path.join(repo, 'store-listing');
const write = (rel, content) => {
  const file = path.join(listing, rel);
  if (fs.existsSync(file)) return console.log(`kept      ${rel}`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
  console.log(`created   ${rel}`);
};

write('studio.json', {app: name, package: pkg, locales, defaultLocale: 'en-US', supersample: 2});
write('profiles.json', {
  phone: {width: 1080, height: 1920, captureWidth: 1080, captureHeight: 2340, captureDensity: 420, frame: 'phone', label: 'Phone'},
  tablet7: {width: 1200, height: 1920, captureWidth: 1200, captureHeight: 1920, captureDensity: 320, frame: 'tablet', label: '7″ tablet'},
  tablet10: {width: 1920, height: 1200, captureWidth: 1920, captureHeight: 1200, captureDensity: 240, frame: 'tablet', label: '10″ tablet'}
});
write('gallery.json', {
  phone: [
    {feature: 'hero', raw: 'phone/01-hero.png', layout: 'big'},
    {feature: 'second', raw: 'phone/02-second.png', layout: 'big'}
  ],
  tablet7: [{feature: 'hero', raw: 'tablet7/01-hero.png', layout: 'big'}],
  tablet10: [{feature: 'hero', raw: 'tablet10/01-hero.png', layout: 'big'}]
});
write('en-US/copy.json', {
  hero: {title: 'One clear\n*promise*', body: 'One short supporting line.'},
  second: {title: 'The core\n*feature*', body: 'Why it matters, briefly.'}
});
write('en-US/listing.json', {title: name, shortDescription: 'Up to 80 characters that say what the app does.', fullDescription: 'Up to 4000 characters.'});
write('theme.css', `/* ${name}: replace this starter with the app's own identity (see PLAYBOOK.md section 2). */
:root{--paper:#f6f6fb;--ink:#15172b;--accent:#4150d0}
body,.campaign{background:var(--paper);color:var(--ink);font-family:system-ui,var(--script-font),sans-serif}
header{left:72px;right:72px;top:130px;text-align:center}
h1{font-size:104px;line-height:1.04;letter-spacing:-.03em;font-weight:700}
h1 em{color:var(--accent)}
header p{margin:24px auto 0;font-size:40px;line-height:1.3;opacity:.75;max-width:880px}
.device{--bezel:12px;--radius:70px;box-shadow:0 40px 90px -24px #15172b55}
.phone .big .device{left:110px;top:520px;width:860px}
.tablet7 .big .device{left:110px;top:560px;width:980px}
.tablet10 header{left:96px;right:auto;top:0;bottom:0;width:620px;display:flex;flex-direction:column;justify-content:center;text-align:left}
.tablet10 h1 .line{white-space:normal}
.tablet10 .big .device{left:760px;top:200px;width:1100px}
`);
write('theme.js', `// ${name}: one continuous field under the whole strip, laid out in panorama coordinates.
import {panoramaGradient} from './studio/shapes.js';

export default {
  art(ctx) {
    const {W, H} = ctx;
    return \`<defs>\${panoramaGradient(ctx, 'field', ['#eef0ff', '#f6f6fb', '#eef7f3'])}</defs><rect width="\${W}" height="\${H}" fill="url(#field)"/>\`;
  }
};
`);
write('.gitignore', `# Commit the reference locale's captures and exports (the README uses them) and every locale's words.
# Other locales regenerate from the capture script and the studio, so their images stay out of git.
node_modules/
__pycache__/
play-staging/
.play-api.env
/[a-z][a-z]-*/*
/[a-z][a-z][a-z]-*/*
!/*/copy.json
!/*/listing.json
!/*/*.txt
!/en-US/*
`);
write('README.md', `# ${name} · Play listing

Built with [Screenshot Studio](studio/). Read \`~/Documents/screenshot-studio/PLAYBOOK.md\` first.

| Change | File |
| --- | --- |
| Cards, order, captures | \`gallery.json\` |
| Words per language | \`<locale>/copy.json\`, \`<locale>/listing.json\` |
| Look | \`theme.css\`, \`theme.js\` |
| Canvas and capture sizes | \`profiles.json\` |

\`\`\`sh
node store-listing/studio/server.cjs 8790        # editor
node store-listing/studio/export.cjs --locale en-US
\`\`\`
`);
execFileSync(path.join(__dirname, 'sync.sh'), [repo], {stdio: 'inherit'});
console.log(`\nNext: add a capture build and script, then design theme.css/theme.js. See PLAYBOOK.md.`);
