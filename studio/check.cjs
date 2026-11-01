#!/usr/bin/env node
// Same as `node studio.cjs check`.
require('./studio.cjs').main(['check', ...process.argv.slice(2)]).then(code => { process.exitCode = code; });
