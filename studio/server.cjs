#!/usr/bin/env node
// Same as `node studio.cjs studio`.
require('./studio.cjs').main(['studio', ...process.argv.slice(2)]).then(code => { process.exitCode = code; });
