#!/usr/bin/env node
// Same as `node studio.cjs locales`.
require('./studio.cjs').main(['locales', ...process.argv.slice(2)]).then(code => { process.exitCode = code; });
