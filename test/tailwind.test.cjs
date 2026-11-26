// Tailwind in theme.css: compiled for the classes an app's cards use, without the reset, with the theme's colors.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {compileTheme} = require('../studio/studio.cjs');

test('a theme.css that imports tailwindcss compiles utilities for the classes its cards use, with @apply and the theme colors', async () => {
  const listing = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-tailwind-'));
  try {
    fs.writeFileSync(path.join(listing, 'gallery.json'), JSON.stringify({phone: [{feature: 'a', layout: 'big', layers: [{text: 'Hi', class: 'rotate-6 bg-primary/20 text-primary-foreground bg-accent text-[120px]'}]}]}));
    fs.writeFileSync(path.join(listing, 'theme.js'), "export default {compose({main}) { main.append(Object.assign(document.createElement('i'), {className: 'px-8 font-black'})); }};");
    fs.writeFileSync(path.join(listing, 'theme.css'), '@import "studio/layouts.css";\n@import "tailwindcss";\n:root{--accent:#f50}\nh1 em{@apply text-primary}\n');
    const css = await compileTheme(path.join(listing, 'theme.css'));
    for (const rule of ['.rotate-6', '.bg-primary\\/20', '.text-primary-foreground', '.bg-accent', '.text-\\[120px\\]', '.px-8', '.font-black']) assert.ok(css.includes(rule), `missing ${rule}`);
    // shadcn's tokens, inlined from the theme's variables: re-branding --accent re-colors every utility. primary is
    // the brand color (a shadcn --primary wins when the theme sets one); accent is shadcn's quiet tint of it.
    assert.match(css, /h1 em \{\s*color: var\(--primary, var\(--accent\)\);/);
    assert.match(css, /\.text-primary-foreground \{\s*color: var\(--primary-foreground, var\(--paper\)\);/);
    assert.match(css, /\.bg-accent \{[^}]*color-mix\(in oklab, var\(--accent\) 16%, var\(--paper\)\)/);
    // No reset: preflight's border reset would undo the renderer's frames.
    assert.ok(!css.includes('border: 0 solid'));
    // The studio's own layouts are inlined from the package.
    assert.match(css, /--device-top/);
    // A theme without Tailwind is served as it is.
    fs.writeFileSync(path.join(listing, 'theme.css'), 'h1{color:red}');
    assert.equal(await compileTheme(path.join(listing, 'theme.css')), 'h1{color:red}');
  } finally { fs.rmSync(listing, {recursive: true, force: true}); }
});
