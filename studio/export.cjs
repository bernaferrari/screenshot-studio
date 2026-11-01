#!/usr/bin/env node
// Same as `node studio.cjs export`.
require('./studio.cjs').main(['export', ...process.argv.slice(2)]).then(code => { process.exitCode = code; });
