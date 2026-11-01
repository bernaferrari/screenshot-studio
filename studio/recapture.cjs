#!/usr/bin/env node
// Same as `node studio.cjs recapture`.
require('./studio.cjs').main(['recapture', ...process.argv.slice(2)]).then(code => { process.exitCode = code; });
