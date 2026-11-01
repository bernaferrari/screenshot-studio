#!/usr/bin/env node
// Same as `node studio.cjs fixtures`.
require('./studio.cjs').main(['fixtures', ...process.argv.slice(2)]).then(code => { process.exitCode = code; });
