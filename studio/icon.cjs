#!/usr/bin/env node
// Same as `node studio.cjs icons`.
require('./studio.cjs').main(['icons', ...process.argv.slice(2)]).then(code => { process.exitCode = code; });
