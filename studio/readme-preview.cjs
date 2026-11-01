#!/usr/bin/env node
// Same as `node studio.cjs readme`.
require('./studio.cjs').main(['readme', ...process.argv.slice(2)]).then(code => { process.exitCode = code; });
